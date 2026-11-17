'use strict';

const path = require('node:path');
const { readFile, readdir, stat, writeFile } = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
const { benchmarkJobs } = require('./benchmark.cjs');
const { benchmarkAssignment, loadHeldOut } = require('./run.cjs');
const rel = require('../node/rel-values.cjs');

async function completed(jobs, accepted, states, expected) {
  if (accepted.code >= 400) throw Error(accepted.message);
  let job = accepted.job;
  while (states.includes(job.status)) {
    await delay(1200);
    job = await jobs.get(job.id);
  }
  if (job.status !== expected) throw Error(job.id + ': ' + (job.message ?? job.status));
  return job;
}

function experimentPair(job, capture, order) {
  const { review } = job;
  return {
    caseId: job.caseId, trialId: job.trialId, order, generation: capture.generation,
    capture: job.id, manifest: job.manifest,
    pins: { model: job.digest, runtime: capture.runtime, image: capture.image,
      selector: capture.selector, index: capture.index, rubric: review.rubricSha256, judge: review.judge.digest },
    arms: capture.comparison.arms.map(run => {
      const judgment = review.judgments.find(row => row.arm === run.arm);
      return { arm: run.arm, outcome: run.outcome, score: judgment.value, disagreement: judgment.disagreement,
        modelUs: run.modelUs, terminalUs: run.terminalUs };
    })
  };
}

async function readExperiment(directory, id, jobs, bundles) {
  const name = /^experiment\.[a-z0-9]{6}$/i;
  if (id === 'latest') {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const candidates = entries.filter(entry => entry.isDirectory() && name.test(entry.name));
    const receipts = await Promise.all(candidates.map(async entry => {
      const file = path.join(directory, entry.name, 'experiment.rel');
      try { return { id: entry.name, date: (await stat(file)).mtimeMs }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
    }));
    id = receipts.filter(Boolean).sort((a, b) => b.date - a.date)[0]?.id;
  }
  if (!name.test(id ?? '')) return null;
  const kind = 'EncounterHeldOutExperiment';
  const bytes = await readFile(path.join(directory, id, 'experiment.rel'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (bytes === null) return null;
  const stored = rel.decode(bytes, kind);
  const pairs = [];
  for (const row of stored.pairs) {
    const job = await jobs.get(row.capture);
    if (job?.status !== 'judged' || !job.trialId) throw Error('Experiment capture is missing or unreviewed.');
    const { scenario } = await benchmarkAssignment(job);
    pairs.push(experimentPair(job, bundles.get(job.id).capture, scenario.order));
  }
  const report = await loadHeldOut()('heldOut.experimentSummary', pairs);
  if (rel.encode(report, kind) !== rel.encode(stored, kind)) throw Error('Experiment receipt differs from its captures.');
  return { id, report };
}

async function experiment(output, directory, runtime) {
  if (!output || !directory || !runtime) throw Error('Provide an output receipt, capture directory and runtime.');
  const evaluate = loadHeldOut();
  const plan = await evaluate('heldOut.experiment', null);
  const bundles = new Map();
  const jobs = benchmarkJobs({ bundles, runtime: path.resolve(runtime), directory: path.resolve(directory) });
  const pairs = [];
  for (const trial of plan.trials) {
    for (const scenario of plan.cases) {
      console.log(scenario.id + ' · ' + trial.id + ' · seed ' + trial.seed);
      const verified = await completed(jobs, await jobs.start(scenario.id, trial.id), ['capturing', 'verifying'], 'verified');
      const judged = await completed(jobs, await jobs.judge(verified.id), ['judging'], 'judged');
      pairs.push(experimentPair(judged, bundles.get(judged.id).capture, trial.order));
      console.log(judged.id + ' · both arms replayed and judged');
    }
  }
  const report = await evaluate('heldOut.experimentSummary', pairs);
  await writeFile(output, rel.encode(report, 'EncounterHeldOutExperiment'), { flag: 'wx', mode: 0o600 });
  for (const { arm, count, totals } of report.arms) {
    console.log(arm + ' · admitted ' + totals.admitted + '/' + count + ' · mean score ' +
      (totals.score / count).toFixed(2) + '/2 · mean terminal time ' + (totals.terminalUs / count / 1e6).toFixed(2) + 's');
  }
  console.log(output);
}

if (require.main === module) {
  experiment(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { readExperiment };
