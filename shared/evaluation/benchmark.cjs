'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { readBundle } = require('./decompiler.cjs');
const { verifyOffline } = require('./offline-replay.cjs');
const { judgeCapture } = require('./benchmark-judge.cjs');
const { benchmarkAssignment, loadHeldOut } = require('./run.cjs');
const rel = require('../node/rel-values.cjs');

const run = promisify(execFile);
const projects = path.resolve(__dirname, '../../..');

function sameGeneration(expected, actual) {
  return actual && expected.seed === actual.seed && expected.temperature === actual.temperature &&
    expected.numPredict === actual.numPredict;
}

function benchmarkJobs({ bundles, runtime, directory }) {
  const jobs = new Map();
  let active = false;

  async function capture(job, scenario) {
    try {
      const folder = path.join(directory, job.id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await mkdir(folder, { mode: 0o700 });
      const captureDir = path.join(folder, 'evidence');
      await run(process.execPath, [path.join(projects, 'applications/north-river/test/pagerank-replay.mjs'),
        path.join(folder, 'run'), '--held-out', captureDir, scenario.id, ...(job.trialId ? [job.trialId] : [])], {
        env: { ...process.env, ENCOUNTER_RUST_HOST: runtime },
        timeout: 480000, maxBuffer: 1_000_000
      });
      const caseDir = path.join(captureDir, scenario.id);
      const manifest = await readFile(path.join(caseDir, 'manifest.rel'));
      const pin = createHash('sha256').update(manifest).digest('hex');
      const bundle = readBundle(path.join(captureDir, 'repair-image.rel.gz'),
        path.join(caseDir, 'repair-run.rel.gz'), pin, scenario);
      job.status = 'verifying';
      const files = {
        'manifest.rel': bundle.manifestBytes, 'encounter.gz': bundle.runtimeGzip,
        'repair-image.rel.gz': bundle.imageGzip, 'repair-run.rel.gz': bundle.traceGzip
      };
      const verification = await verifyOffline(name => files[name], pin);
      if (verification.results.some(result => result.status !== 'match')) {
        throw Error('Fresh capture did not match offline replay.');
      }
      const capture = bundle.capture;
      if (capture.model !== job.model || capture.digest !== job.digest) throw Error('Model pin changed.');
      if (job.generation && !sameGeneration(job.generation, capture.generation)) throw Error('Generation settings changed.');
      const verified = { ...job, status: 'verified', manifest: pin, verification };
      await writeFile(path.join(folder, 'benchmark.rel'), rel.encode(verified, 'EncounterBenchmarkCapture'),
        { mode: 0o600, flag: 'wx' });
      bundles.set(job.id, bundle);
      Object.assign(job, verified);
    } catch (error) {
      console.error('Benchmark ' + job.id + ': ' + error.message.slice(0, 2000));
      job.status = 'failed';
      job.message = 'Capture or replay verification failed. See the evaluation service log.';
    } finally {
      active = false;
    }
  }

  async function start(caseId, trialId) {
    if (!runtime) return { code: 503, message: 'The benchmark runtime is unavailable.' };
    if (active) return { code: 409, message: 'A benchmark is already running.' };
    active = true;
    let assignment;
    try {
      assignment = await benchmarkAssignment({ caseId, trialId });
    } catch {
      active = false;
      return { code: 400, message: 'Select a held-out case from the benchmark suite.' };
    }
    const { scenario, model, digest, generation } = assignment;
    const job = { id: 'benchmark-' + randomUUID(), caseId, model, digest, ...(trialId ? { trialId, generation } : {}), status: 'capturing' };
    jobs.set(job.id, job);
    void capture(job, scenario);
    return { code: 202, job };
  }

  async function get(id) {
    if (jobs.has(id)) return jobs.get(id);
    if (!/^benchmark-[a-f0-9-]{36}$/.test(id ?? '')) return null;
    const folder = path.join(directory, id);
    try {
      const receipt = rel.decode(await readFile(path.join(folder, 'benchmark.rel'), 'utf8'), 'EncounterBenchmarkCapture');
      if (receipt.id !== id || receipt.status !== 'verified' || !/^[a-f0-9]{64}$/.test(receipt.manifest) ||
          receipt.verification.manifestPin !== receipt.manifest ||
          receipt.verification.results.map(arm => arm.arm).sort().join(',') !== 'lexical,pagerank' ||
          receipt.verification.results.some(arm => arm.status !== 'match')) return null;
      const { scenario, model, digest, generation } = await benchmarkAssignment(receipt);
      if (receipt.model !== model || receipt.digest !== digest) return null;
      const evidence = path.join(folder, 'evidence');
      const bundle = readBundle(path.join(evidence, 'repair-image.rel.gz'),
        path.join(evidence, scenario.id, 'repair-run.rel.gz'), receipt.manifest, scenario);
      if (bundle.capture.model !== model || bundle.capture.digest !== digest ||
          (generation && (!sameGeneration(generation, receipt.generation) || !sameGeneration(generation, bundle.capture.generation)))) return null;
      bundles.set(id, bundle);
      const job = { ...receipt };
      try {
        const review = rel.decode(await readFile(path.join(folder, 'review.rel'), 'utf8'), 'EncounterBenchmarkReview');
        const sha = value => createHash('sha256').update(value).digest('hex');
        const evaluate = loadHeldOut();
        const rubric = await evaluate('heldOut.rubric', null);
        const rubricPin = sha(rel.encode(rubric, 'EncounterBenchmarkRubric'));
        if (review.capture !== id || review.manifest !== receipt.manifest || review.judge.digest !== digest ||
            review.judge.identity !== 'ollama/' + model || review.rubricSha256 !== rubricPin ||
            sha(rel.encode(review.rubric, 'EncounterBenchmarkRubric')) !== rubricPin || review.judgments.length !== 2) {
          throw Error('Review does not match the admitted capture or rubric.');
        }
        for (const arm of bundle.capture.comparison.arms) {
          const matches = review.judgments.filter(row => row.arm === arm.arm && row.replySha256 === sha(arm.reply));
          if (matches.length !== 1) throw Error('Review does not bind exactly one judgment to each reply.');
          const row = matches[0];
          const score = await evaluate('heldOut.judgment', { reply: arm.reply, outcome: arm.outcome, score: JSON.parse(row.raw) });
          if (Object.keys(score).some(key => score[key] !== row[key])) throw Error('Review score differs from its recorded response.');
        }
        Object.assign(job, { status: 'judged', review });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      jobs.set(id, job);
      return job;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Benchmark ' + id + ': ' + error.message);
      return null;
    }
  }

  async function judge(id) {
    const job = await get(id);
    if (job?.status === 'judged') return { code: 200, job };
    if (active || job?.status === 'judging') return { code: 409, message: 'A benchmark is already running.' };
    if (job?.status !== 'verified') return { code: 400, message: 'Select an offline-verified benchmark capture.' };
    active = true;
    job.status = 'judging';
    delete job.message;
    void (async () => {
      try {
        const review = await judgeCapture(job, bundles.get(id).capture);
        await writeFile(path.join(directory, id, 'review.rel'), rel.encode(review, 'EncounterBenchmarkReview'),
          { mode: 0o600, flag: 'wx' });
        Object.assign(job, { status: 'judged', review });
      } catch (error) {
        console.error('Benchmark judge ' + id + ': ' + error.message.slice(0, 1000));
        Object.assign(job, { status: 'verified', message: 'Judging failed. The capture is available for another review.' });
      } finally {
        active = false;
      }
    })();
    return { code: 202, job };
  }

  return { start, get, judge };
}

module.exports = { benchmarkJobs };
