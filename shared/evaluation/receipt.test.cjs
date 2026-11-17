'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const rel = require('../node/rel-values.cjs');
const { readTrace } = require('./decompiler.cjs');
const { loadPolicy, northTrials, pinTrial, readJudgments } = require('./run.cjs');

const sample = rel.decode(readFileSync(path.join(__dirname, 'evidence/pilot.rel'), 'utf8'), 'EncounterEvaluationReceipt');
let policy;
before(async () => { policy = await loadPolicy(); });

test('the reviewed pilot receipt replays exactly', async () => {
  assert.deepEqual(await policy.qualify(sample), sample);
});

test('changed reply bytes fail the trial pin', async () => {
  const packet = structuredClone(sample);
  packet.trials[0].reply += ' changed';
  await assert.rejects(policy.qualify(packet), /Trial bytes changed/);
});

test('a rehashed North River trial cannot swap the mandatory context pin', async () => {
  const packet = structuredClone(sample);
  const index = packet.trials.findIndex(trial => trial.arm === 'pagerank');
  const { sha256, ...trial } = packet.trials[index];
  trial.comparison.mandatory = '0'.repeat(64);
  packet.trials[index] = pinTrial(trial);
  await assert.rejects(policy.qualify(packet), /arms must share/);
});

test('a judge cannot substitute an invented quote or reuse a verdict under a new rubric', async () => {
  const packet = structuredClone(sample);
  packet.judgments[0].scores[0].evidence = 'a quote absent from the reply';
  await assert.rejects(policy.qualify(packet), /exact reply quote/);
  packet.judgments[0].rubricSha256 = '0'.repeat(64);
  await assert.rejects(policy.qualify(packet), /exact trial and rubric/);
});

test('the raw North River replay reproduces the four pinned comparison trials', async () => {
  const replay = await northTrials(path.join(__dirname, 'evidence/north-river-replay.rel'), sample.suite.northRiver);
  const recorded = sample.trials.filter(trial => trial.application === 'north-river');
  assert.equal(rel.encode(replay.map(pinTrial)), rel.encode(recorded));
});

test('the Encounter-authored review reproduces the receipt judgments', async () => {
  const review = await readJudgments(path.join(__dirname, 'evidence/pilot-review.encounter'));
  assert.equal(rel.encode(review), rel.encode({ judge: sample.judge, judgments: sample.judgments }));
});

test('both selectors resolve against the same image and expose context, control flow and storage evidence', () => {
  const directory = path.join(__dirname, 'evidence/decompiler');
  const capture = readTrace(path.join(directory, 'repair-image.rel.gz'), path.join(directory, 'repair-run.rel.gz'));
  for (const { phases } of capture.runs) {
    const scopes = phases.map(phase => phase.events.find(event =>
      event.kind === 'port-end' && event.data.query === 'nr.liveScope'));
    assert.deepEqual(scopes.map(event => event.data.result.count), [1, 0]);
    assert.ok(scopes.every(event => event.origin.file.endsWith('/live.encounter')));
  }
  const { arms, phases } = capture.comparison;
  assert.deepEqual(arms.map(arm => arm.selected), [
    ['chart-renderer', 'daily-report'], ['reference-example', 'model-constraint']
  ]);
  assert.ok(phases.every(phase => phase.sameOrder && phase.sites.every(site =>
    JSON.stringify(site.lexical) === JSON.stringify(site.pagerank))));
  const [left, right] = arms.map(arm => arm.writes[1][0]);
  assert.equal(left.revision, right.revision);
  assert.match(left.sourceHash, /^[0-9a-f]{64}$/);
  assert.match(right.sourceHash, /^[0-9a-f]{64}$/);
  assert.notEqual(left.sourceHash, right.sourceHash);
});

test('the reviewed manifest refuses edited trace bytes, even with a replacement manifest', () => {
  const bundle = traceFixture();
  try {
    for (const mutate of [
      replay => {
        const branch = replay.runs[0].traces[0].trace.events.find(event => event.kind === 'when');
        branch.data.taken = !branch.data.taken;
      },
      replay => { replay.runs[0].unaffectedReport = false; },
      replay => { replay.runs[0].selected.ids = ['invented-source']; }
    ]) {
      bundle.edit(mutate);
      assert.throws(bundle.read, /Trace bytes differ from the reviewed manifest/);
    }
    bundle.repin();
    assert.throws(bundle.read, /Trace manifest differs from the reviewed pin/);
  } finally { bundle.close(); }
});

test('newly pinned evidence still requires complete deliveries and prompt-derived source IDs', () => {
  const bundle = traceFixture();
  try {
    bundle.edit(replay => { replay.runs[0].traces[0].trace.events = []; });
    assert.throws(() => bundle.read(bundle.repin()), /missing delivery events/);
    bundle.edit(replay => {
      const events = replay.runs[0].traces[0].trace.events;
      events.splice(events.findIndex(event => event.kind === 'port-start'), 1);
    });
    assert.throws(() => bundle.read(bundle.repin()), /port calls and returns are unbalanced/);
    bundle.edit(replay => { replay.runs[0].selected.ids = ['invented-source']; });
    assert.throws(() => bundle.read(bundle.repin()), /Selected source IDs differ from the actual prompt/);
    bundle.edit(replay => {
      const run = replay.runs[0];
      const change = text => text.replace('[chart-renderer] The manager', '[chart-renderer] A manager  ');
      run.prompt = change(run.prompt);
      run.selected.text = change(run.selected.text);
    });
    assert.throws(() => bundle.read(bundle.repin()), /not an exact optional unit/);
  } finally { bundle.close(); }
});

function traceFixture() {
  const fs = require('node:fs');
  const os = require('node:os');
  const { createHash } = require('node:crypto');
  const { gzipSync, gunzipSync } = require('node:zlib');
  const source = path.join(__dirname, 'evidence/decompiler');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-test-'));
  const image = path.join(source, 'repair-image.rel.gz');
  const trace = path.join(directory, 'repair-run.rel.gz');
  const manifest = path.join(directory, 'manifest.rel');
  fs.copyFileSync(path.join(source, 'manifest.rel'), manifest);
  fs.copyFileSync(path.join(source, 'encounter.gz'), path.join(directory, 'encounter.gz'));
  const decode = () => structuredClone(rel.decode(gunzipSync(fs.readFileSync(path.join(source, 'repair-run.rel.gz'))).toString(), 'NorthRiverPageRankReplay'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  let replay;
  let receipt;
  return {
    read: pin => readTrace(image, trace, pin),
    close: () => fs.rmSync(directory, { recursive: true, force: true }),
    edit(mutate) {
      replay = decode();
      mutate(replay);
      receipt = rel.encode(replay, 'NorthRiverPageRankReplay');
      fs.writeFileSync(trace, gzipSync(receipt));
    },
    repin() {
      const value = structuredClone(rel.decode(fs.readFileSync(manifest, 'utf8'), 'NorthRiverTraceManifest'));
      value.trace = sha(receipt);
      value.eventCounts = replay.runs.map(run => run.traces.map(phase => phase.trace.events.length));
      const bytes = rel.encode(value, 'NorthRiverTraceManifest');
      fs.writeFileSync(manifest, bytes);
      return sha(bytes);
    }
  };
}
