import evaluation from '../../../encounter-platform/shared/evaluation/run.cjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { chromium } from '../../../../bin/browser-profile.mjs';
import { line, packet } from './repair-packet.mjs';
import { verifyWorkflow } from './workflow.mjs';
import { fileURLToPath } from 'node:url';
import { decode, encode } from '../../encounter-runtime/test/rel-values.mjs';
import { start } from '../../encounter-runtime/test/host.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../..');
const declaration = 'north-river/application.rel';
const indexPath = path.join(__dirname, 'repair-index.rel');
const model = 'qwen2.5:3b';
const digest = '357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b';
const objective = 'I want to set up a timesheet app for my business.';
const sha = value => createHash('sha256').update(value).digest('hex');
const micros = since => Number((process.hrtime.bigint() - since) / 1000n);
const order = ['lexical', 'pagerank', 'pagerank', 'lexical'];

async function warm() {
  const options = { signal: AbortSignal.timeout(180000) };
  const tags = await fetch('http://127.0.0.1:11434/api/tags', options);
  assert.equal(tags.status, 200);
  assert.ok((await tags.json()).models.some(item => item.name === model && item.digest === digest));
  const start = process.hrtime.bigint();
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    ...options, method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: '10m' })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).done, true);
  return micros(start);
}

async function replay({ browser, index, rankSemanticUnits, arm, directory, imagePin, rejected, expectedReport, applicationRoot = root, scenario, check, generation }) {
  fs.mkdirSync(directory, { mode: 0o700 });
  const username = 'replay-owner';
  const password = randomBytes(32).toString('hex');
  const operatorFile = path.join(directory, 'operators.rel');
  const token = Buffer.from(username + ':' + password).toString('base64');
  fs.writeFileSync(operatorFile, [
    '("operators", "version", "encounter/operators/1")',
    '("' + username + '", "role", "author")',
    '("' + username + '", "basicSha256", "' + sha(token) + '")', ''
  ].join('\n'), { mode: 0o600 });
  const selectionStart = process.hrtime.bigint();
  const ranked = rankSemanticUnits({ ...index, pageRank: arm === 'pagerank' });
  const selected = packet(index, ranked);
  const selectionUs = micros(selectionStart);
  const replayFile = path.join(directory, 'rejected.rel');
  const contextFile = path.join(directory, 'selection.rel');
  fs.writeFileSync(replayFile, encode(rejected, 'EncounterModelReplay'));
  fs.writeFileSync(contextFile, encode(selected.ids, 'EncounterModelContext'));
  process.env.ENCOUNTER_TEST_MODEL_REPLAY = replayFile;
  process.env.ENCOUNTER_TEST_MODEL_CONTEXT = contextFile;
  let server;
  let context;
  try {
    server = await start(applicationRoot, { directory, declaration, operatorFile, liveModel: 'ollama-loopback' });
    assert.equal(sha(fs.readFileSync(path.join(directory, 'application-image.rel'))), imagePin);
    context = await browser.newContext({ httpCredentials: { username, password } });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.getByLabel('Project name').fill('North River Science Labs');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByLabel('What do you want to do?').fill(scenario?.objective ?? objective);
    await page.getByRole('button', { name: 'Create task' }).click();
    await page.getByRole('button', { name: 'Start live agent run' }).click();

    const decision = page.getByRole('region', { name: 'Current decision' });
    await decision.getByText('Critical · Repair required', { exact: true }).waitFor();
    const accepted = decision.getByText('Your answer is needed', { exact: true });
    const failed = decision.getByText('Critical · Blocked', { exact: true });
    await accepted.or(failed).waitFor({ timeout: 185000 });
    const outcome = await accepted.count() ? 'admissible' : 'blocked';
    const phases = server.diagnostics().split('\n').filter(line => line.startsWith('replay-phase '))
      .map(line => JSON.parse(line.slice('replay-phase '.length)));
    assert.deepEqual(phases.map(phase => phase.repair), [false, true], server.diagnostics());
    const [first, repair] = phases;
    if (generation) assert.deepEqual(repair.generation, {
      seed: generation.seed, temperature: generation.temperature, num_predict: generation.numPredict
    });
    await page.getByText('Activity & evidence', { exact: true }).click();
    await page.getByText('Model receipt · initial repair', { exact: true }).click();
    const receipt = page.locator('details').filter({ has: page.getByText('Model receipt · initial repair', { exact: true }) }).last();
    const [prompt, reply] = await receipt.locator('pre').allTextContents();
    assert.ok(prompt.endsWith(selected.text), 'the actual model prompt must contain the fixed and selected packets exactly');
    assert.ok(prompt.includes(scenario?.objective ?? 'render report tables and charts'));
    let unaffectedPreserved = false;
    let dependencyMentioned = false;
    let unaffectedReport = false;
    if (outcome === 'admissible') {
      const raw = JSON.parse(reply);
      if (!scenario) {
        verifyWorkflow('repair-scope', raw);
        const change = raw.model.change;
        dependencyMentioned = /employee/i.test(change) && /referenc/i.test(change) && /report/i.test(change);
      }
      const planRecord = page.locator('details#current-plan-record');
      if (await planRecord.count()) {
        await planRecord.locator(':scope > summary').click();
      } else {
        const navigator = page.getByRole('navigation', { name: 'Notebook navigator' });
        const plan = navigator.getByRole('link', { name: 'Plan', exact: true });
        assert.equal(await plan.getAttribute('href'), '#current-plan-record');
        await plan.click();
        assert.equal(new URL(page.url()).hash, '#current-plan-record');
      }
      if (scenario) {
        const flagged = scenario.patches.map(patch => patch.id);
        for (const [id, step] of Object.entries(rejected.steps)) {
          if (flagged.includes(id)) continue;
          const section = page.locator('#task-current-step-' + id);
          await section.locator('summary').click();
          assert.equal(await section.getByText(step.change, { exact: true }).count(), 1);
          assert.equal(await section.getByText('Planned check: ' + step.check, { exact: true }).count(), 1);
          assert.equal(await section.getByText(step.target + ' · ' + step.checkKind, { exact: true }).count(), 1);
        }
        unaffectedPreserved = true;
        unaffectedReport = !flagged.includes('report');
      } else {
        const report = page.locator('#task-current-step-report');
        await report.locator('summary').click();
        unaffectedReport = (await report.innerText()).includes(expectedReport);
        assert.ok(unaffectedReport);
      }
    }
    const traces = server.diagnostics().split('\n').filter(row => row.startsWith('repair-trace '))
      .map(row => JSON.parse(row.slice('repair-trace '.length)));
    if (process.env.ENCOUNTER_TEST_REPAIR_TRACE) {
      assert.deepEqual(traces.map(trace => trace.repair), [false, true]);
      assert.ok(traces.every(trace => trace.completed && trace.trace.dropped === 0 && trace.trace.events.length), JSON.stringify(traces.map(({ completed, trace }) => ({ completed, events: trace.events.length, dropped: trace.dropped }))));
      assert.equal(traces[1].replySha256, sha(reply));
    }
    const scopeCount = phase => phase.trace.events.find(event =>
      event.kind === 'port-end' && event.data.query === 'nr.liveScope')?.data.result.count ?? null;
    let observation;
    if (scenario) {
      observation = { initialIssues: scopeCount(traces[0]), remainingIssues: scopeCount(traces[1]), unaffectedPreserved };
      await check('heldOut.check', { ...observation, outcome, expectedIssues: new Set(scenario.patches.map(patch => patch.id)).size });
    }
    const terminalUs = selectionUs + repair.committedUs - first.availableUs;
    return {
      arm, outcome, selectionUs, modelUs: repair.modelUs,
      validateCommitUs: first.validateCommitUs + repair.validateCommitUs,
      dispatchUs: terminalUs - selectionUs - repair.modelUs - first.validateCommitUs - repair.validateCommitUs,
      terminalUs, admissibleUs: outcome === 'admissible' ? terminalUs : null,
      promptTokens: repair.promptTokens, replyTokens: repair.replyTokens,
      selected, omitted: ranked.filter(item => !selected.ids.includes(item.id)).map(item => item.id),
      ranked, dependencyMentioned, unaffectedReport, prompt, reply, ...(observation ? { observation } : {}), ...(traces.length ? { traces } : {})
    };
  } finally {
    delete process.env.ENCOUNTER_TEST_MODEL_REPLAY;
    delete process.env.ENCOUNTER_TEST_MODEL_CONTEXT;
    await context?.close();
    await server?.close();
  }
}

async function main() {
  const [output, option, traceDirectory, caseId, trialId] = process.argv.slice(2);
  assert.ok(!option || (['--trace', '--held-out'].includes(option) && traceDirectory), 'use --trace or --held-out with an evidence directory');
  const heldOut = option === '--held-out';
  assert.ok(!caseId || heldOut, 'case selection requires --held-out');
  assert.ok(!trialId || caseId, 'trial selection requires a case');
  delete process.env.ENCOUNTER_TEST_MODEL_SEED;
  const check = heldOut ? evaluation.loadHeldOut() : null;
  if (traceDirectory) process.env.ENCOUNTER_TEST_REPAIR_TRACE = '1';
  assert.ok(output, 'provide a new receipt path');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'north-river-rank-'));
  let browser;
  try {
    const selector = path.join(root, 'context-hub/tooling/search/search_corpus.mjs');
    const { rankSemanticUnits } = await import(selector);
    let indexBytes = fs.readFileSync(indexPath);
    let index = decode(indexBytes.toString('utf8'), 'ApplicationData');
    const control = rankSemanticUnits({ ...index, pageRank: false });
    const treatment = rankSemanticUnits({ ...index, pageRank: true });
    verifyWorkflow('ranking', { ranked: treatment, repeated: rankSemanticUnits({ ...index, pageRank: true }),
      control: packet(index, control), treatment: packet(index, treatment) });

    let binary = process.env.ENCOUNTER_RUST_HOST;
    const runtimeBytes = traceDirectory ? fs.readFileSync(binary) : null;
    if (runtimeBytes) {
      binary = path.join(scratch, 'encounter');
      fs.writeFileSync(binary, runtimeBytes, { mode: 0o700 });
      process.env.ENCOUNTER_RUST_HOST = binary;
    }
    const imagePath = path.join(scratch, 'pinned.rel');
    let imagePin = execFileSync(binary, ['build', root, declaration, imagePath], { encoding: 'utf8' }).trim();
    let imageBytes = fs.readFileSync(imagePath);
    let image = decode(imageBytes.toString('utf8'), 'EncounterApplicationImage');
    let applicationRoot = root;
    const assignment = trialId ? await check('heldOut.experimentAssignment', { caseId, trialId })
      : caseId ? await check('heldOut.assign', caseId) : null;
    const generation = assignment?.generation;
    if (generation) {
      assert.equal(generation.temperature, 0.2);
      assert.equal(generation.numPredict, 1100);
      process.env.ENCOUNTER_TEST_MODEL_SEED = String(generation.seed);
    }
    const suite = heldOut ? await check('heldOut.suite', null) : null;
    if (suite) {
      assert.equal(suite.model, model);
      assert.equal(suite.digest, digest);
      applicationRoot = path.join(scratch, 'applications');
      for (const file of new Set([...Object.keys(image.files), declaration])) {
        const target = path.join(applicationRoot, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
      }
      index = await check('heldOut.index', index);
      indexBytes = Buffer.from(encode(index, 'ApplicationData'));
      fs.writeFileSync(path.join(applicationRoot, 'north-river/test/repair-index.rel'), indexBytes);
      fs.unlinkSync(imagePath);
      imagePin = execFileSync(binary, ['build', applicationRoot, declaration, imagePath], { encoding: 'utf8' }).trim();
      imageBytes = fs.readFileSync(imagePath);
      image = decode(imageBytes.toString('utf8'), 'EncounterApplicationImage');
    }
    assert.equal(sha(imageBytes), imagePin);
    if (runtimeBytes) assert.equal(sha(runtimeBytes), image.runtimeSha256);
    assert.equal(image.files['north-river/test/repair-index.rel'].sha256, sha(indexBytes));
    const sourcePins = index.units.map(unit => {
      assert.ok(image.files[unit.path]?.text.includes('process ' + unit.process + ':'));
      assert.ok(image.programme[unit.process]);
      return { id: unit.id, path: unit.path, process: unit.process, sha256: image.files[unit.path].sha256 };
    });
    const baseline = decode(fs.readFileSync(path.join(__dirname, 'scoped-proposal.rel'), 'utf8'), 'ApplicationData');
    const regression = { ...baseline, steps: { ...baseline.steps, model: { ...baseline.steps.model, change: 'render report tables and charts' } } };
    const warmupUs = await warm();
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const cases = assignment ? [assignment.scenario] : suite?.cases ?? [null];
    for (const scenario of cases) {
      const rejected = scenario ? await check('heldOut.reject', { baseline, patches: scenario.patches }) : regression;
      const arms = scenario?.order ?? (traceDirectory ? order.slice(0, 2) : order);
      const selectorIndex = scenario ? { ...index, query: scenario.query, seeds: scenario.seeds } : index;
      const captureDir = scenario ? path.join(traceDirectory, scenario.id) : traceDirectory;
      const runs = [];
      for (const [i, arm] of arms.entries()) {
        const run = await replay({ browser, index: selectorIndex, rankSemanticUnits, arm, directory: path.join(scratch, (scenario?.id ?? 'regression') + '-' + i),
          imagePin, rejected, expectedReport: baseline.steps.report.change, applicationRoot, scenario, check, generation });
        runs.push(run);
        console.log([arm, run.outcome, 'total ' + (run.terminalUs / 1e6).toFixed(3) + ' s',
          'Ollama ' + (run.modelUs / 1e6).toFixed(3) + ' s', 'prompt ' + run.promptTokens + ' tokens',
          run.selected.ids.join(', ')].join(' | '));
      }
      const required = index.units.filter(unit => !unit.optional).map(line).join('\n');
      const receipt = encode({
        format: 'encounter/north-river-pagerank-replay/1', order: arms, model, digest,
        image: imagePin, runtime: image.runtimeSha256, programme: image.programmeSha256,
        selector: sha(fs.readFileSync(selector)), index: sha(indexBytes), mandatory: sha(required),
        required, sourcePins, budgetBytes: index.budgetBytes, warmupUs, ...(generation ? { generation } : {}), objective: scenario?.objective ?? objective, rejected, runs,
        ...(scenario ? { scenario, query: selectorIndex.query, seeds: selectorIndex.seeds } : {})
      }, 'NorthRiverPageRankReplay');
      const exclusive = { flag: 'wx', mode: 0o600 };
      const receiptPath = scenario ? output + '-' + scenario.id + '.rel' : output;
      fs.writeFileSync(receiptPath, receipt, exclusive);
      if (traceDirectory) {
        fs.mkdirSync(captureDir, { recursive: true, mode: 0o700 });
        if (!scenario || scenario === cases[0]) {
          fs.writeFileSync(path.join(traceDirectory, 'repair-image.rel.gz'), gzipSync(imageBytes), exclusive);
          fs.writeFileSync(path.join(traceDirectory, 'encounter.gz'), gzipSync(runtimeBytes), exclusive);
        }
        fs.writeFileSync(path.join(captureDir, 'repair-run.rel.gz'), gzipSync(receipt), exclusive);
        const manifest = encode({
          image: imagePin, runtime: image.runtimeSha256, trace: sha(receipt),
          eventCounts: runs.map(run => run.traces.map(phase => phase.trace.events.length))
        }, 'NorthRiverTraceManifest');
        fs.writeFileSync(path.join(captureDir, 'manifest.rel'), manifest, exclusive);
        console.log('Capture manifest SHA-256 ' + sha(manifest));
      }
      console.log('Receipt ' + receiptPath);
    }
  } finally {
    await browser?.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
