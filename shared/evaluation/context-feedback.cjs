'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { gunzipSync } = require('node:zlib');
const { readBundle } = require('./decompiler.cjs');
const { readHeldOut } = require('./held-out.cjs');
const { benchmarkJobs } = require('./benchmark.cjs');
const { readExperiment } = require('./benchmark-experiment.cjs');
const { loadHeldOut } = require('./run.cjs');
const rel = require('../node/rel-values.cjs');

const applications = path.resolve(__dirname, '../../../applications');
const selectorPath = path.join(applications, 'context-hub/tooling/search/search_corpus.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function contextFeedback(state, experimentId) {
  const evaluate = loadHeldOut();
  const plan = await evaluate('feedback.plan', null);
  const bundles = new Map();
  const jobs = benchmarkJobs({ bundles, runtime: null, directory: path.join(state, 'benchmarks') });
  const experiment = await readExperiment(state, experimentId, jobs, bundles);
  if (!experiment) throw Error('A completed experiment is required.');
  const historical = path.join(__dirname, 'evidence/decompiler');
  const archive = await readHeldOut(path.join(__dirname, 'evidence/held-out-access-refusal'), 'access-refusal');
  const selector = hash(await readFile(selectorPath));
  const { rankSemanticUnits } = await import(pathToFileURL(selectorPath).href);
  const { packet } = await import(pathToFileURL(path.join(applications, 'north-river/test/repair-packet.mjs')).href);
  const cases = [];
  for (const label of plan.cases) {
    const fresh = experiment.report.pairs.filter(pair => pair.caseId === label.id);
    const captures = label.id === 'regression'
      ? [readBundle(path.join(historical, 'repair-image.rel.gz'), path.join(historical, 'repair-run.rel.gz'))]
      : label.split === 'regression' ? [archive.bundles.get(label.id)]
      : fresh.map(pair => bundles.get(pair.capture));
    assert.ok(captures.length && captures.every(Boolean), 'Missing feedback capture for ' + label.id);
    let index;
    for (const bundle of captures) {
      const replay = rel.decode(gunzipSync(bundle.traceGzip, { maxOutputLength: 32_000_000 }).toString(), 'NorthRiverPageRankReplay');
      assert.equal(replay.selector, selector, 'Feedback requires the exact recorded selector source');
      const source = bundle.imageFiles['north-river/test/repair-index.rel'].text;
      assert.equal(hash(source), replay.index);
      const data = rel.decode(source, 'ApplicationData');
      const next = { ...data, query: replay.query ?? data.query, seeds: replay.seeds ?? data.seeds };
      if (index) assert.deepEqual(index, next);
      index = next;
      for (const arm of replay.runs) {
        const selected = packet(index, rankSemanticUnits({ ...index, pageRank: arm.arm === 'pagerank' }));
        assert.deepEqual(selected, { ...arm.selected }, 'Recorded context must reproduce exactly');
      }
    }
    assert.ok(label.relevant.every(id => index.units.some(unit => unit.optional && unit.id === id)));
    async function measure(pageRank, mixing) {
      const selected = packet(index, rankSemanticUnits({ ...index, pageRank, mixing }));
      const score = await evaluate('feedback.score', { ids: selected.ids, relevant: label.relevant });
      return { ids: selected.ids, bytes: selected.optionalBytes, score };
    }
    const lexical = await measure(false, index.mixing);
    const baseline = await measure(true, index.mixing);
    const candidates = {};
    for (const mixing of plan.candidates) {
      const candidate = await measure(true, mixing);
      candidates[mixing] = { ...candidate, ...(await evaluate('feedback.compare', {
        baseline: baseline.score, candidate: candidate.score
      })) };
    }
    cases.push({ ...label, lexical, baseline, candidates,
      manifests: captures.map(bundle => bundle.capture.manifestSha256),
      outcomes: fresh.map(pair => ({ trial: pair.trialId, arms: pair.arms }))
    });
  }
  return evaluate('feedback.summary', { experiment: experiment.id, selector, cases });
}

if (require.main === module) {
  const [state, experimentId, output] = process.argv.slice(2);
  if (!output) throw Error('Provide evaluation state, experiment id and output path.');
  contextFeedback(state, experimentId).then(async report => {
    await writeFile(output, rel.encode(report, 'EncounterContextFeedback'), { flag: 'wx', mode: 0o600 });
    for (const candidate of report.candidates) console.log(candidate.mixing, candidate.disposition);
    console.log(output);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { contextFeedback };
