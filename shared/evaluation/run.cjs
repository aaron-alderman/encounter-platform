'use strict';

const { createHash } = require('node:crypto');
const { replyPairs } = require('./reply-differences.cjs');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const applications = path.resolve(__dirname, '../../applications');
const { computationalPorts } = require(path.join(applications, 'encounter/bootstrap/ports/browser-effects.cjs'));
const { createFrontDoor } = require(path.join(applications, 'encounter/bootstrap/encounter-source-front.cjs'));
const rel = require('../node/rel-values.cjs');
const { valuePorts } = require('../node/ports/value.cjs');
const kind = 'EncounterEvaluationReceipt';
const hash = text => createHash('sha256').update(text).digest('hex');
const valueHash = (value, type) => hash(rel.encode(value, type));
const readRel = (file, type) => rel.decode(readFileSync(file, 'utf8'), type);
const writeRel = (file, value, type) => writeFileSync(file, rel.encode(value, type), { flag: 'wx', mode: 0o600 });

async function loadPolicy() {
  const front = createFrontDoor({ basis: 'encounter-evaluation-pilot', profiles: { evaluation: [] }, ports: {} });
  const sources = ['suite.encounter', 'receipt.encounter'].map(file =>
    front.hydrate('evaluation/' + file, readFileSync(path.join(__dirname, file), 'utf8')));
  const handle = front.admit(front.link(sources), { profile: 'evaluation', entries: ['evaluation.suite', 'evaluation.receipt'] });
  const run = async (entry, input) => (await front.run(handle, entry, { input })).value;
  const suite = await run('evaluation.suite', null);
  const rubricSha256 = valueHash(suite.rubric, 'EncounterEvaluationRubric');
  const policySha256 = hash(handle.receipt);
  async function qualify(packet) {
    if (packet.policySha256 !== policySha256 || valueHash(packet.suite, 'EncounterEvaluationSuite') !== valueHash(suite, 'EncounterEvaluationSuite') ||
        packet.rubricSha256 !== rubricSha256) throw Error('Evaluation policy, suite or rubric changed.');
    for (const { sha256, ...trial } of packet.trials) {
      if (valueHash(trial, 'EncounterEvaluationTrial') !== sha256) throw Error('Trial bytes changed.');
    }
    return run('evaluation.receipt', packet);
  }
  return { suite, rubricSha256, policySha256, qualify };
}

function loadHeldOut() {
  const front = createFrontDoor({ basis: 'north-river-held-out', profiles: { benchmark: ['record.put', 'number.calculate'] }, ports: {
    'record.put': valuePorts()['record.put'], 'number.calculate': computationalPorts()['number.calculate']
  } });
  const source = front.hydrate('evaluation/held-out.encounter', readFileSync(path.join(__dirname, 'held-out.encounter'), 'utf8'));
  const entries = ['heldOut.suite', 'heldOut.index', 'heldOut.check', 'heldOut.reject', 'heldOut.pins', 'heldOut.review', 'heldOut.assign', 'heldOut.rubric', 'heldOut.judgment', 'heldOut.experiment', 'heldOut.experimentAssignment', 'heldOut.experimentSummary', 'feedback.plan', 'feedback.score', 'feedback.summary', 'feedback.compare'];
  const feedback = front.hydrate('evaluation/feedback.encounter', readFileSync(path.join(__dirname, 'feedback.encounter'), 'utf8'));
  const handle = front.admit(front.link([source, feedback]), { profile: 'benchmark', entries });
  return async (entry, input) => (await front.run(handle, entry, { input })).value;
}

function benchmarkAssignment({ caseId, trialId }) {
  const evaluate = loadHeldOut();
  return trialId ? evaluate('heldOut.experimentAssignment', { caseId, trialId }) : evaluate('heldOut.assign', caseId);
}

async function usewordsTransport(bindingsFile) {
  const root = path.join(applications, 'usewords-lightning');
  const { loadRuntime } = require(path.join(root, 'bootstrap/runtime.cjs'));
  const { generateMatterSuggestions } = require(path.join(root, 'bootstrap/matter-model.cjs'));
  const adapterSha256 = hash(readFileSync(path.join(root, 'bootstrap/matter-model.cjs')));
  const sourceSha256 = hash(readFileSync(path.join(root, 'source/owners/local-model.encounter')));
  const bindings = JSON.parse(readFileSync(bindingsFile, 'utf8'));
  const runtime = await loadRuntime();
  const prepare = async ({ scenario }) => {
    const board = (await runtime.run('mw.create', scenario)).value;
    return (await runtime.run('mw.brief', board.head)).value;
  };
  async function trial({ brief, arm }) {
    const model = bindings[arm];
    let prompt = JSON.stringify(brief.request);
    let requestSha256 = null, reply = '', record = null, metrics = {};
    let generationError = null, validationError = null;
    const start = performance.now();
    try {
      const result = await generateMatterSuggestions(arm, bindings, brief, async (url, init) => {
        const response = await fetch(url, init);
        if (url.endsWith('/generate')) {
          requestSha256 = hash(init.body);
          const request = JSON.parse(init.body);
          prompt = request.system + '\n\n' + request.prompt;
          if (response.ok) {
            const { response: raw, ...body } = await response.clone().json();
            reply = typeof raw === 'string' ? raw : '';
            metrics = Object.fromEntries(['done_reason', 'total_duration', 'load_duration', 'prompt_eval_count',
              'prompt_eval_duration', 'eval_count', 'eval_duration'].filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
          }
        }
        return response;
      });
      record = result.run;
      const validationStart = performance.now();
      try {
        const { value: checked } = await runtime.run('mw.checkSuggestions', { brief, response: result.response });
        await runtime.run('mw.checkModelRun', { run: record, package: checked });
      } catch (error) {
        validationError = error.message;
      }
      metrics.validationMs = Math.round(performance.now() - validationStart);
    } catch (error) {
      generationError = error.message;
    }
    metrics.totalMs = Math.round(performance.now() - start);
    return {
      model, comparison: { briefSha256: brief.sha256, program: runtime.identity, adapterSha256, sourceSha256 },
      prompt, requestSha256, reply, record, generationError, validationError, metrics
    };
  }
  return { prepare, trial };
}

function observeReplay(file) {
  const bytes = readFileSync(file, 'utf8');
  const evidence = rel.decode(bytes, 'NorthRiverPageRankReplay');
  return { evidence, sha256: hash(bytes), rejectedSha256: valueHash(evidence.rejected, 'EncounterRejectedReply') };
}

function northTrials(file, scenario) {
  return loadEncounter()('evaluation.north', { file, scenario });
}

function pinTrial(trial) {
  return { ...trial, sha256: valueHash(trial, 'EncounterEvaluationTrial') };
}

function replyTokens(text) {
  const tokens = [];
  let offset = 0;
  const pattern = /"(?:[^"\\\r\n]|\\[^\r\n])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) tokens.push({ text: text.slice(offset, match.index), role: 'plain' });
    const token = match[0];
    offset = match.index + token.length;
    const role = token.startsWith('"') ? (/^\s*:/.test(text.slice(offset)) ? 'json-key' : 'json-string')
      : /^[-0-9]/.test(token) ? 'json-number' : 'json-literal';
    tokens.push({ text: token, role });
  }
  if (offset < text.length) tokens.push({ text: text.slice(offset), role: 'plain' });
  return tokens;
}

function loadEncounter(bindingsFile) {
  const values = valuePorts();
  const ports = Object.fromEntries(['record.put', 'value.string', 'text.indexOf', 'text.slice', 'text.join', 'text.replaceAll']
    .map(name => [name, values[name]]));
  let usewords;
  function app() { return usewords ??= usewordsTransport(bindingsFile); }
  Object.assign(ports, {
    'evaluation.replay': ({ file }) => observeReplay(file),
    'evaluation.sha': ({ text }) => hash(text),
    'evaluation.split': ({ text, separator }) => text.split(separator),
    'evaluation.ends': ({ text, suffix }) => text.endsWith(suffix),
    'evaluation.bytes': ({ text }) => Buffer.byteLength(text),
    'evaluation.bounded': ({ size, limit }) => size <= limit,
    'evaluation.milliseconds': ({ us }) => us / 1000,
    'evaluation.brief': async input => (await app()).prepare(input),
    'evaluation.usewords': async input => (await app()).trial(input),
    'evaluation.pin': ({ trials }) => trials.map(pinTrial),
    'decompiler.literal': ({ value }) => JSON.stringify(value),
    'evaluation.replyPairs': ({ lexical, pagerank }) => replyPairs(lexical, pagerank),
    'evaluation.jsonTokens': ({ text }) => replyTokens(text),
    'evaluation.decodeReply': ({ text }) => JSON.parse(text),
    'evaluation.sortReview': ({ trials }) => [...trials].sort((a, b) => a.trialSha256.localeCompare(b.trialSha256)),
    'evaluation.formatMs': ({ milliseconds }) => (milliseconds / 1000).toFixed(2) + ' s'
  });
  const front = createFrontDoor({
    basis: 'encounter-evaluation-surface',
    profiles: {
      presentation: ['kernel.invoke', 'value.string', 'text.indexOf', 'text.slice', 'text.join', 'text.replaceAll', 'evaluation.split',
        'evaluation.sortReview', 'evaluation.formatMs', 'evaluation.milliseconds', 'evaluation.jsonTokens', 'evaluation.replyPairs', 'evaluation.decodeReply', 'decompiler.literal'],
      workflow: ['record.put', 'kernel.invoke', 'evaluation.replay', 'evaluation.sha', 'evaluation.split',
        'evaluation.ends', 'evaluation.bytes', 'evaluation.bounded', 'evaluation.milliseconds',
        'evaluation.brief', 'evaluation.usewords', 'evaluation.pin']
    },
    ports
  });
  const hydrate = file => front.hydrate('evaluation/' + file, readFileSync(path.join(__dirname, file), 'utf8'));
  const surface = hydrate('surface.encounter');
  const workflow = hydrate('workflow.encounter');
  const semantics = hydrate('semantics.encounter');
  const decompiler = hydrate('decompiler.encounter');
  const comparison = hydrate('comparison.encounter');
  const desk = ['documents', 'workspace', 'styles', 'trace', 'source', 'rich-text', 'reply-diff', 'identity-trace']
    .map(module => hydrate('decompiler/' + module + '.encounter'));
  const notes = front.hydrate('encounter-libraries/semantic/notes.encounter', readFileSync(path.resolve(__dirname,
    '../../applications/encounter-libraries/semantic/notes.encounter'), 'utf8'));
  const notebookPresentation = front.hydrate('encounter-libraries/workflows/notebook-presentation.encounter',
    readFileSync(path.resolve(__dirname, '../../applications/encounter-libraries/workflows/notebook-presentation.encounter'), 'utf8'));
  const { readApplicationModules } = require('../node/application-modules.cjs');
  const [renderer] = readApplicationModules(path.join(applications, 'encounter'), ['algebra/css/css.renderPlan.encounter']);
  const css = front.hydrate('encounter/' + renderer.file, renderer.text);
  const decompilerEntries = ['decompiler.page', 'decompiler.identityTrace', 'decompiler.styles', 'decompiler.verification', 'decompiler.benchmarkReview', 'decompiler.experiment', 'decompiler.contextFeedback', 'desk.compareReplies', 'desk.compareVisits', 'desk.sheet', 'desk.traceSite', 'desk.syntax', 'desk.page', 'desk.styles'];
  const presentation = front.admit(front.link([surface, workflow, semantics, decompiler, comparison, notes, notebookPresentation, css, ...desk], {
    roots: ['evaluation.rows', 'evaluation.review', 'evaluation.page', 'evaluation.styles', 'evaluation.report', ...decompilerEntries]
  }), { profile: 'presentation', entries: ['evaluation.review', 'evaluation.page', 'evaluation.styles', 'evaluation.report', ...decompilerEntries] });
  const operations = front.admit(front.link([surface, workflow], {
    roots: ['evaluation.collect', 'evaluation.compare', 'evaluation.seal', 'evaluation.north']
  }), { profile: 'workflow', entries: ['evaluation.collect', 'evaluation.compare', 'evaluation.seal', 'evaluation.north'] });
  return async (entry, input) => (await front.run(
    ['evaluation.collect', 'evaluation.compare', 'evaluation.seal', 'evaluation.north'].includes(entry) ? operations : presentation,
    entry, { input }
  )).value;
}

async function readJudgments(file) {
  const source = readFileSync(file, 'utf8');
  if (path.extname(file) !== '.encounter') return JSON.parse(source);
  const front = createFrontDoor({ basis: 'encounter-evaluation-review', profiles: { review: [] }, ports: {} });
  const module = front.hydrate('evaluation/judgments.encounter', source);
  const handle = front.admit(front.link([module]), { profile: 'review', entries: ['evaluation.judgments'] });
  return (await front.run(handle, 'evaluation.judgments')).value;
}

async function main(args) {
  const policy = await loadPolicy();
  const [command, input, extra, output] = args;
  const evaluate = loadEncounter(command === 'collect' ? extra : undefined);
  if (command === 'collect' && output) {
    const { suite, rubricSha256, policySha256 } = policy;
    const packet = await evaluate('evaluation.collect', { north: input, suite, rubricSha256, policySha256 });
    writeRel(output, await policy.qualify(packet), kind);
  } else if (command === 'compare' && output) {
    const packet = await policy.qualify(readRel(input, kind));
    const next = await evaluate('evaluation.compare', { packet, north: extra });
    writeRel(output, await policy.qualify(next), kind);
  } else if (command === 'seal' && output) {
    const packet = await policy.qualify(readRel(input, kind));
    const review = await readJudgments(extra);
    const next = await evaluate('evaluation.seal', { packet, review });
    writeRel(output, await policy.qualify(next), kind);
  } else if (['review', 'report'].includes(command) && input && !extra) {
    const packet = await policy.qualify(readRel(input, kind));
    const value = await evaluate('evaluation.' + command, packet);
    console.log(command === 'review' ? JSON.stringify(value, null, 2) : value);
  } else if (command === 'check' && input && !extra) {
    const packet = await policy.qualify(readRel(input, kind));
    console.log(packet.phase + ' receipt verified, ' + packet.trials.length + ' trials and ' + packet.judgments.length + ' judgments');
  } else {
    throw Error('Use collect NORTH_REL BINDINGS OUTPUT, compare RECEIPT NORTH_REL OUTPUT, review RECEIPT, seal RECEIPT JUDGMENTS OUTPUT, report RECEIPT, or check RECEIPT.');
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { benchmarkAssignment, loadHeldOut, loadPolicy, loadEncounter, northTrials, pinTrial, readJudgments };
