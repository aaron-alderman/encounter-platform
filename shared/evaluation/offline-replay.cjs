'use strict';

const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { isDeepStrictEqual } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const rel = module.exports.decode ? module.exports : require('../node/rel-values.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function load(read, manifestPin) {
  const manifestBytes = read('manifest.rel');
  assert.equal(sha(manifestBytes), manifestPin, 'reviewed manifest pin');
  const manifest = rel.decode(manifestBytes.toString('utf8'), 'NorthRiverTraceManifest');
  const extract = (file, pin, limit) => {
    const bytes = gunzipSync(read(file), { maxOutputLength: limit });
    assert.equal(sha(bytes), pin, file + ' pin');
    return bytes;
  };
  const image = extract('repair-image.rel.gz', manifest.image, 64_000_000);
  const runtime = extract('encounter.gz', manifest.runtime, 32_000_000);
  const raw = extract('repair-run.rel.gz', manifest.trace, 32_000_000);
  const capture = rel.decode(raw.toString('utf8'), 'NorthRiverPageRankReplay');
  assert.deepEqual(capture.runs.map(run => run.arm), capture.order);
  assert.deepEqual([...capture.order].sort(), ['lexical', 'pagerank']);
  assert.equal(capture.image, manifest.image);
  assert.equal(capture.runtime, manifest.runtime);
  assert.deepEqual(capture.runs.map(run => run.traces.map(phase => phase.trace.events.length)), manifest.eventCounts);
  return { image, runtime, capture };
}

function form(html, action, fields) {
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    const body = new URLSearchParams();
    for (const input of match[2].matchAll(/<input\b([^>]*)>/g)) {
      const attrs = Object.fromEntries(Array.from(input[1].matchAll(/([\w-]+)="([^"]*)"/g), m => [m[1], m[2]]));
      if (attrs.type === 'hidden') body.set(attrs.name, attrs.value);
    }
    if (body.get('action') !== action || (action === 'start-live' && body.get('scope') !== 'timesheet')) continue;
    const target = /\baction="([^"]*)"/.exec(match[1])?.[1];
    assert.match(target, /^\/(?:\?task=[\w.-]+)?$/);
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    return { target, body };
  }
  throw Error('Expected North River form for ' + action);
}

function comparable(event, normalized) {
  const data = { ...event.data };
  if (event.kind === 'port-end' && data.ok) {
    // These writes include the new run identity. The revision and all other
    // captured port metadata still have to match.
    if (data.port === 'storage.cas') {
      assert.match(data.sourceHash, /^[0-9a-f]{64}$/);
      delete data.sourceHash;
      normalized.push("Stored-document hash");
    }
    // nr.hashPlan includes the live proposer identity in the hashed review.
    if ((event.process === 'nr.hashPlan' && data.port === 'digest.sha256') ||
        (event.process === 'app.agentResult' && data.query === 'nr.hashPlan')) {
      assert.equal(data.result.kind, 'text');
      assert.match(data.result.value, /^[0-9a-f]{64}$/);
      data.result = { ...data.result, value: '<run-specific plan hash>' };
      normalized.push('Run-specific plan hash');
    }
  }
  return JSON.parse(JSON.stringify({ ...event, data }));
}

function verifyTrace(original, actual, arm) {
  const result = { arm, status: 'match', deliveries: [], normalized: [], effects: [], mismatch: null, error: null };
  const mismatch = (field, expected, observed, delivery = null, event = null) => {
    result.status = 'mismatch';
    result.mismatch = { field, delivery, event, expected: expected ?? null, observed: observed ?? null };
    return result;
  };
  if (actual.length !== original.length) return mismatch('Delivery count', original.length, actual.length);
  for (const [index, observed] of actual.entries()) {
    const expected = original[index];
    const phase = { delivery: index + 1, expected: expected.trace.events.length, matched: 0, branches: 0, checks: 0, ports: 0 };
    result.deliveries.push(phase);
    for (const field of ['entry', 'repair', 'basis', 'replySha256', 'completed']) {
      if (observed[field] !== expected[field]) return mismatch(field, expected[field], observed[field], index + 1);
    }
    if (observed.trace.dropped !== 0) return mismatch('Dropped events', 0, observed.trace.dropped, index + 1);
    const events = observed.trace.events;
    for (let sequence = 0; sequence < Math.min(events.length, phase.expected); sequence++) {
      const event = events[sequence];
      const reference = expected.trace.events[sequence];
      const normalized = [];
      let equivalent;
      try {
        equivalent = isDeepStrictEqual(comparable(event, normalized), comparable(reference, []));
      } catch (error) {
        if (error.code !== 'ERR_ASSERTION') throw error;
        equivalent = false;
      }
      if (!equivalent) {
        return mismatch('Instruction event', reference, event, index + 1, sequence + 1);
      }
      phase.matched++;
      if (event.kind === 'when') phase.branches++;
      if (event.kind === 'assert') phase.checks++;
      if (event.kind === 'port-end') {
        phase.ports++;
        const port = event.data.port;
        let effect = result.effects.find(item => item.port === port);
        if (!effect) {
          effect = { port, count: 0, revisions: [] };
          result.effects.push(effect);
        }
        effect.count++;
        if (port === 'storage.cas' && event.data.revision !== null) effect.revisions.push(event.data.revision);
      }
      for (const kind of normalized) {
        const entry = result.normalized.find(item => item.kind === kind);
        if (entry) entry.count++;
        else result.normalized.push({ kind, count: 1 });
      }
    }
    if (events.length !== phase.expected) {
      return mismatch('Event count', phase.expected, events.length, index + 1, phase.matched + 1);
    }
  }
  return result;
}

async function replay(directory, executable, image, capture, run) {
  const store = path.join(directory, 'store');
  fs.mkdirSync(store, { mode: 0o700 });
  const write = (name, bytes) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    return file;
  };
  const credential = Buffer.from('replay-owner:' + randomBytes(32).toString('hex')).toString('base64');
  const operators = write('operators.rel', [
    '("operators", "version", "encounter/operators/1")',
    '("replay-owner", "role", "author")',
    '("replay-owner", "basicSha256", ' + JSON.stringify(sha(credential)) + ')', ''
  ].join('\n'));
  const config = write('launch.rel', Object.entries({
    version: 'encounter/launch/1', mode: 'image', image, sha256: capture.image, store,
    port: '0', operators, liveModel: 'ollama-loopback'
  }).map(([key, value]) => '("launch", ' + JSON.stringify(key) + ', ' + JSON.stringify(value) + ')').join('\n') + '\n');
  const child = spawn(executable, ['--config', config, 'serve'], {
    env: {
      PATH: process.env.PATH, LANG: process.env.LANG,
      ENCOUNTER_TEST_MODEL_REPLAY: write('rejected.rel', rel.encode(capture.rejected, 'EncounterModelReplay')),
      ENCOUNTER_TEST_MODEL_CONTEXT: write('selection.rel', rel.encode(run.selected.ids, 'EncounterModelContext')),
      ENCOUNTER_TEST_OFFLINE_REPAIR: write('repair.rel', rel.encode({
        reply: run.reply, promptSha256: sha(run.prompt)
      }, 'EncounterOfflineRepair')),
      ENCOUNTER_TEST_REPAIR_TRACE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '', exited = false, failure;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once('close', () => { exited = true; resolve(); }));
  child.once('error', error => { failure = error; });
  async function until(check, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (exited || stderr.includes('live delivery:')) throw Error(run.arm + ' ' + label + '\n' + stderr.slice(-1500));
      const result = await check();
      if (result) return result;
      await delay(30);
    }
    throw Error(run.arm + ' timed out waiting for ' + label);
  }
  try {
    const origin = await until(() => /^Encounter (http:\/\/127\.0\.0\.1:\d+)\s*$/m.exec(stdout)?.[1], 'listener');
    let cookie;
    async function request(route, body) {
      const headers = { Authorization: 'Basic ' + credential, Origin: origin };
      if (cookie) headers.Cookie = cookie;
      if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const response = await fetch(origin + route, {
        method: body ? 'POST' : 'GET', body, headers, redirect: 'error', signal: AbortSignal.timeout(4000)
      });
      assert.equal(response.status, 200, run.arm + ' ' + route);
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
      return response.text();
    }
    let html = await request('/');
    for (const [action, fields] of [
      ['create-project', { project: 'North River Science Labs' }],
      ['create-task', { objective: capture.objective, agent: 'north-river-agent' }],
      ['start-live', {}]
    ]) {
      const { target, body } = form(html, action, fields);
      html = await request(target, body);
    }
    const observed = await until(() => {
      const rows = stderr.split('\n').slice(0, -1).filter(row => row.startsWith('repair-trace '));
      return rows.length >= 2 && rows.map(row => JSON.parse(row.slice('repair-trace '.length)));
    }, 'both recorded deliveries');
    const result = verifyTrace(run.traces, observed, run.arm);
    if (result.status !== 'match') return result;
    html = await request('/');
    const admissible = html.includes('Your answer is needed');
    const outcome = admissible ? 'admissible' : html.includes('Critical · Blocked') ? 'blocked' : 'unknown';
    if (outcome !== run.outcome) {
      result.status = 'mismatch';
      result.mismatch = { field: 'Terminal outcome', delivery: 2, event: null, expected: run.outcome, observed: outcome };
    }
    return result;
  } finally {
    if (!exited) child.kill();
    await closed;
  }
}

async function verifyOffline(read, manifestPin) {
  const { image, runtime, capture } = load(read, manifestPin);
  const results = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'north-river-replay-'));
  try {
    const executable = path.join(scratch, 'encounter');
    const imageFile = path.join(scratch, 'repair-image.rel');
    fs.writeFileSync(executable, runtime, { mode: 0o700 });
    fs.writeFileSync(imageFile, image, { mode: 0o600 });
    for (const run of capture.runs) {
      assert.ok(['lexical', 'pagerank'].includes(run.arm));
      const arm = path.join(scratch, run.arm);
      fs.mkdirSync(arm, { mode: 0o700 });
      try {
        results.push(await replay(arm, executable, imageFile, capture, run));
      } catch (error) {
        results.push({ arm: run.arm, status: 'error', deliveries: [], normalized: [], effects: [], mismatch: null, error: error.message.slice(0, 600) });
      }
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  return { results, manifestPin };
}

async function main() {
  const directory = path.resolve(process.argv[2] ?? __dirname);
  const manifestPin = process.argv[3] ?? (typeof bundledManifestSha256 === 'string' ? bundledManifestSha256 : '');
  assert.match(manifestPin, /^[0-9a-f]{64}$/, 'pass the reviewed manifest SHA-256 from the evidence docket');
  const { results } = await verifyOffline(file => fs.readFileSync(path.join(directory, file)), manifestPin);
  for (const result of results) {
    if (result.status === 'match') {
      console.log(result.arm + ': matched ' + result.deliveries.map(phase => phase.matched).join(' + ') +
        ' events, including branches, checks and port effects');
    } else {
      console.error(result.arm + ': ' + (result.error ?? JSON.stringify(result.mismatch)));
      process.exitCode = 1;
    }
  }
}

module.exports = { verifyOffline, verifyTrace, comparable };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
