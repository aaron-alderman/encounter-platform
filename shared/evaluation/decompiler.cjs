'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const rel = require('../node/rel-values.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function origins(files) {
  const byProcess = new Map();
  for (const [file, { text, sha256 }] of Object.entries(files)) {
    if (!file.endsWith('.encounter')) continue;
    if (sha(text) !== sha256) throw Error('Image source pin differs: ' + file);
    for (const match of text.matchAll(/^process ([\w.-]+):/gm)) {
      const process = match[1];
      if (byProcess.has(process)) throw Error('Ambiguous process origin: ' + process);
      byProcess.set(process, { file, line: text.slice(0, match.index).split('\n').length, sha256 });
    }
  }
  return byProcess;
}

// Review this pin when promoting a newly captured bundle. The bundle cannot
// attest to its own integrity by supplying a new manifest.
const reviewedManifestSha256 = '002d876b7aa60819375a9560bed07a3dbb6adec38c82767efe3aeb34a5b7b7eb';

function readTrace(imagePath, tracePath, manifestSha256) {
  return readBundle(imagePath, tracePath, manifestSha256).capture;
}

function readBundle(imagePath, tracePath, manifestSha256 = reviewedManifestSha256, heldOut) {
  const directory = path.dirname(tracePath);
  const manifestBytes = readFileSync(path.join(directory, 'manifest.rel'));
  if (sha(manifestBytes) !== manifestSha256) throw Error('Trace manifest differs from the reviewed pin.');
  const manifest = rel.decode(manifestBytes.toString('utf8'), 'NorthRiverTraceManifest');
  const imageGzip = readFileSync(imagePath);
  const traceGzip = readFileSync(tracePath);
  const runtimeGzip = readFileSync(path.join(heldOut ? path.dirname(directory) : directory, 'encounter.gz'));
  const bytes = gunzipSync(imageGzip, { maxOutputLength: 64_000_000 });
  const raw = gunzipSync(traceGzip, { maxOutputLength: 32_000_000 });
  const runtime = gunzipSync(runtimeGzip, { maxOutputLength: 32_000_000 });
  if (sha(raw) !== manifest.trace) throw Error('Trace bytes differ from the reviewed manifest.');
  if (sha(bytes) !== manifest.image || sha(runtime) !== manifest.runtime) {
    throw Error('Image or runtime bytes differ from the reviewed manifest.');
  }
  let replay = rel.decode(raw.toString('utf8'), 'NorthRiverPageRankReplay');
  const image = rel.decode(bytes.toString('utf8'), 'EncounterApplicationImage');
  if (manifest.image !== replay.image || manifest.runtime !== replay.runtime || image.runtimeSha256 !== replay.runtime ||
      image.programmeSha256 !== replay.programme ||
      sha(rel.encode(image.programme, 'EncounterCompiledProgramme')) !== replay.programme) {
    throw Error('Trace and admitted image pins differ.');
  }
  const counts = replay.runs.map(run => run.traces.map(phase => phase.trace.events.length));
  if (JSON.stringify(counts) !== JSON.stringify(manifest.eventCounts) ||
      counts.some(run => run.length !== 2 || run.some(count => count === 0))) {
    throw Error('Trace is missing delivery events.');
  }
  const arms = replay.runs.map(run => run.arm).join(',');
  const allowed = heldOut ? [heldOut.order.join(',')] : ['pagerank', 'lexical,pagerank'];
  if (!allowed.includes(arms) || replay.order.join(',') !== arms) {
    throw Error('Trace does not contain the expected selector order.');
  }
  if (heldOut && (rel.encode(replay.scenario, 'HeldOutCase') !== rel.encode(heldOut, 'HeldOutCase') ||
      replay.query !== heldOut.query || JSON.stringify(replay.seeds) !== JSON.stringify(heldOut.seeds) ||
      replay.objective !== heldOut.objective)) throw Error('Trace differs from the authored held-out case.');
  const sources = origins(image.files);
  const expected = { assert: 'assert', when: 'when', catch: 'try', 'port-start': 'port', 'port-end': 'port' };
  const identity = {
    image: replay.image, programme: replay.programme, runtime: replay.runtime,
    trace: manifest.trace, manifestSha256, model: replay.model, objective: replay.objective
  };
  if (heldOut) replay = { ...replay, runs: [...replay.runs].sort((a, b) => a.arm.localeCompare(b.arm)) };
  const contexts = verifyContexts(replay, image);
  const runs = replay.runs.map(run => resolveRun(run, replay, image, sources, expected));
  const capture = { ...identity, ...runs.at(-1) };
  if (runs.length === 2) {
    capture.comparison = compareRuns(replay, runs, contexts);
    if (heldOut) {
      capture.digest = replay.digest;
      capture.selector = replay.selector;
      capture.index = replay.index;
      capture.generation = replay.generation ?? null;
      for (const [index, run] of replay.runs.entries()) {
        const observedIssues = runs[index].phases.map(phase => phase.events.find(event =>
          event.kind === 'port-end' && event.data.query === 'nr.liveScope')?.data.result.count ?? null);
        const [initialIssues, remainingIssues] = observedIssues;
        if (initialIssues !== run.observation?.initialIssues || remainingIssues !== run.observation?.remainingIssues) {
          throw Error('Held-out scope observation differs from the trace.');
        }
        const sessionCheck = runs[index].phases[1].events.find(event =>
          event.kind === 'port-end' && event.data.query === 'nr.sessionRepairCheck');
        const refusalCheck = sessionCheck?.data.result;
        if (sessionCheck && typeof refusalCheck !== 'boolean') throw Error('Invalid session refusal check trace.');
        Object.assign(capture.comparison.arms[index], {
          refusalCheck: refusalCheck ?? null,
          observation: run.observation, modelUs: run.modelUs, promptTokens: run.promptTokens,
          replyTokens: run.replyTokens, selectionUs: run.selectionUs, terminalUs: run.terminalUs
        });
      }
    }
    capture.runs = runs.map(run => ({ ...identity, ...run }));
  }
  return { capture, manifestBytes, imageGzip, traceGzip, runtimeGzip, imageFiles: image.files };
}

function resolveRun(run, replay, image, sources, expected) {
  if (run.traces.length !== 2 || run.traces[0].repair !== false || run.traces[1].repair !== true ||
      sha(JSON.stringify(replay.rejected)) !== run.traces[0].replySha256 ||
      sha(run.reply) !== run.traces[1].replySha256) throw Error('Repair deliveries do not match their recorded reply.');
  const phases = run.traces.map(phase => {
    if (phase.basis !== image.basis || phase.entry !== 'app.agentResult' || phase.completed !== true || phase.trace.dropped !== 0) {
      throw Error('Trace is incomplete or belongs to another admitted application.');
    }
    const openPorts = [];
    const events = phase.trace.events.map((event, index) => {
      if (!Array.isArray(event.address) || event.address.length === 0 ||
          !event.address.every(value => Number.isSafeInteger(value) && value >= 0)) {
        throw Error('Invalid trace instruction address.');
      }
      const root = image.programme[event.process];
      const instruction = event.address.reduce((current, coordinate) => current?.[coordinate], root);
      const origin = sources.get(event.process);
      if (!origin || !Array.isArray(instruction) || instruction[0] !== expected[event.kind] ||
          (instruction[0] === 'port' && event.data.port !== instruction[1])) {
        throw Error('Trace instruction does not resolve in the admitted image: ' + event.process);
      }
      if (event.kind === 'port-start' || event.kind === 'port-end') {
        const call = JSON.stringify([event.process, event.address, event.data.port, event.data.query]);
        if (event.kind === 'port-start') openPorts.push(call);
        else if (openPorts.pop() !== call) throw Error('Trace port calls and returns are unbalanced.');
      }
      // Keep the predicate and diagnostic, rather than serializing unexecuted child blocks.
      const predicate = ['when', 'assert'].includes(event.kind) ? instruction[1] : null;
      return { ...event, sequence: index + 1, origin, predicate,
        diagnostic: event.kind === 'assert' ? instruction[2] : null };
    });
    if (openPorts.length) throw Error('Trace port calls and returns are unbalanced.');
    return { repair: phase.repair, replySha256: phase.replySha256, events };
  });
  return { arm: run.arm, outcome: run.outcome, reportPreserved: run.unaffectedReport, modelUs: run.modelUs, phases };
}

function verifyContexts(replay, image) {
  const file = image.files['north-river/test/repair-index.rel'];
  if (!file || sha(file.text) !== file.sha256 || file.sha256 !== replay.index) {
    throw Error('Repair index differs from the admitted image.');
  }
  const index = rel.decode(file.text, 'ApplicationData');
  const label = unit => '[' + unit.id + '] ' + unit.text;
  const required = index.units.filter(unit => !unit.optional);
  const optional = new Map(index.units.filter(unit => unit.optional).map(unit => [unit.id, unit]));
  const mandatory = required.map(label).join('\n');
  if (mandatory !== replay.required || sha(mandatory) !== replay.mandatory ||
      index.budgetBytes !== replay.budgetBytes) throw Error('Mandatory context or budget differs from the repair index.');
  const boundary = '\n\nOptional context (navigation only):\n';
  const requiredBlock = 'Mandatory context (same for every arm):\n' + mandatory;
  let sharedPrompt;
  return replay.runs.map(run => {
    const parts = run.prompt.split(boundary);
    if (parts.length !== 2 || !parts[0].endsWith(requiredBlock) ||
        run.selected.text !== requiredBlock + boundary + parts[1] ||
        Buffer.byteLength(parts[1]) !== run.selected.optionalBytes || run.selected.optionalBytes > index.budgetBytes ||
        (sharedPrompt !== undefined && parts[0] !== sharedPrompt)) throw Error('Traced repair prompt controls differ.');
    sharedPrompt = parts[0];
    const ids = parts[1] === '' ? [] : parts[1].split('\n').map(line => {
      const id = /^\[([^\]]+)\] /.exec(line)?.[1];
      const unit = optional.get(id);
      if (!unit || line !== label(unit)) throw Error('Prompt source is not an exact optional unit from the admitted index.');
      return id;
    });
    if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(run.selected.ids) ||
        JSON.stringify(required.map(unit => unit.id)) !== JSON.stringify(run.selected.required)) {
      throw Error('Selected source IDs differ from the actual prompt.');
    }
    return { selected: ids, context: parts[1], optionalBytes: Buffer.byteLength(parts[1]) };
  });
}

function compareRuns(replay, runs, contexts) {
  const arms = replay.runs.map((run, index) => ({
      arm: run.arm, outcome: run.outcome, reportPreserved: run.unaffectedReport,
      ...contexts[index],
      reply: run.reply,
      writes: runs[index].phases.map(phase => phase.events
        .filter(event => event.kind === 'port-end' && event.data.port === 'storage.cas')
        .map(event => ({ revision: event.data.revision, sourceHash: event.data.sourceHash ?? null })))
  }));
  return {
    arms, budgetBytes: replay.budgetBytes, mandatory: replay.required,
    phases: runs[0].phases.map((phase, index) => ({
      repair: phase.repair,
      sameOrder: JSON.stringify(phase.events.map(siteKey)) === JSON.stringify(runs[1].phases[index].events.map(siteKey)),
      sites: alignSites(phase.events, runs[1].phases[index].events)
    }))
  };
}

// Repeated execution at one address is a sequence, not a one-to-one match
// across invocations. Keep each side's observations in recorded order.
function siteKey({ process, address, kind }) { return JSON.stringify([process, address, kind]); }

function alignSites(lexical, pagerank) {
  const sites = new Map();
  for (const [arm, events] of Object.entries({ lexical, pagerank })) {
    for (const { process, address, kind, data, origin, predicate, diagnostic } of events) {
      if (kind === 'port-start') continue;
      const key = siteKey({ process, address, kind });
      if (!sites.has(key)) sites.set(key, { process, address, kind, origin, predicate, diagnostic, lexical: [], pagerank: [] });
      const site = sites.get(key);
      const result = data.result;
      const observation = { ...data };
      delete observation.operands;
      delete observation.sourceHash;
      if (result && typeof result === 'object') {
        observation.result = { kind: result.kind, count: result.count ?? null };
      }
      site[arm].push(observation);
    }
  }
  return [...sites.values()];
}

module.exports = { readTrace, readBundle };
