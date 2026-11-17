'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFile, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { execFile, spawn } = require('node:child_process');
const net = require('node:net');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { preview } = require('./surface.cjs');
const { loadEncounter } = require('./run.cjs');
const { readBundle } = require('./decompiler.cjs');
const { readIdentityTrace } = require('./identity-trace.cjs');
const { traceDocuments } = require('./trace-source.cjs');
const { verifyTrace } = require('./offline-replay.cjs');
const rel = require('../node/rel-values.cjs');
const file = path.join(__dirname, 'evidence/pilot.rel');

test('the evaluation surface, decompiler and replay work through Front Gate and a localhost tunnel', async () => {
  const server = await preview({ file, port: 0 });
  const { chromium } = await import('../../../../bin/browser-profile.mjs');
  let browser;
  let gate;
  let tunnel;
  const sockets = new Set();
  const gatewayRoot = await mkdtemp(path.join(os.tmpdir(), 'decompiler-gateway-'));
  try {
    if (!server.listening) await once(server, 'listening');
    const gatewaySource = path.resolve(__dirname, '../../applications/front-gate');
    for (const name of ['directory.rel', 'directory.encounter', 'front-gate.css', 'front-gate.js']) {
      await writeFile(path.join(gatewayRoot, name), await readFile(path.join(gatewaySource, name)));
    }
    const registry = await readFile(path.join(gatewaySource, 'services.encounter'), 'utf8');
    const evaluation = registry.split('\n').find(line => line.includes('id = "evaluation"'))
      .trim().replace(/,$/, '').replace('port = 24228', 'port = ' + server.address().port);
    assert.ok(evaluation.includes('id = "evaluation"'));
    await writeFile(path.join(gatewayRoot, 'services.encounter'),
      'process-module "temple/surface-process-module/1"\n\nprocess gate.apps:\n  let result = list(' + evaluation + ')\n');
    gate = spawn(process.env.ENCOUNTER_RUST_HOST, ['directory', gatewayRoot, 'directory.rel', '0'],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    const [ready] = await once(createInterface({ input: gate.stdout }), 'line', { signal: AbortSignal.timeout(5000) });
    const gatePort = Number(new URL(ready.replace('Encounter ', '')).port);
    tunnel = net.createServer(client => {
      const upstream = net.connect(gatePort, '127.0.0.1');
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => { client.destroy(); upstream.destroy(); });
      }
      client.pipe(upstream).pipe(client);
    }).listen(0, '127.0.0.1');
    await once(tunnel, 'listening');
    const origin = 'http://localhost:' + tunnel.address().port;
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const response = await page.goto(origin + '/evaluation');
    assert.equal(response.status(), 200);
    assert.equal(await page.getByRole('heading', { name: 'Model evaluation', exact: true }).count(), 1);
    assert.equal(await page.getByRole('article').count(), 8);
    const comparison = page.getByRole('region', { name: 'Selector comparison' });
    assert.match(await comparison.innerText(), /PageRank · 2 of 2 admissible · judge scores 6\/6, 6\/6/);
    assert.match(await comparison.innerText(), /Lexical · 2 of 2 admissible · judge scores 4\/6, 4\/6/);
    const trial = page.locator('#north-river-repair-2');
    await trial.getByText('Reconstruct recorded meaning', { exact: true }).click();
    const meaning = trial.locator('details').filter({ hasText: 'Reconstruct recorded meaning' });
    assert.match(await meaning.innerText(), /model → model-definition/);
    assert.match(await meaning.innerText(), /render report tables and charts/);
    assert.match(await meaning.innerText(), /The report step was preserved/);
    assert.match(await meaning.innerText(), /Selected · reference-example/);
    assert.match(await meaning.innerText(), /Mandatory · repair-boundary/);
    assert.match(await meaning.innerText(), /nr\.reportWording/);
    const suggestions = page.locator('#usewords-workshop-fast');
    await suggestions.getByText('Reconstruct recorded meaning', { exact: true }).click();
    assert.match(await suggestions.innerText(), /Unconfirmed position/);
    assert.match(await suggestions.innerText(), /Responds to issue/);
    await trial.getByText('Prompt and reply', { exact: true }).click();
    assert.equal(await trial.locator('pre:visible').count(), 2);
    await trial.getByText('Judge’s rubric and evidence', { exact: true }).click();
    assert.equal(await trial.locator('blockquote:visible').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download receipt' }).click()]);
    assert.deepEqual(await readFile(await download.path()), await readFile(file));
    assert.equal((await fetch(origin + '/unknown')).status, 404);
    await page.getByRole('link', { name: 'North River semantic decompiler' }).click();
    assert.equal(await page.getByRole('heading', { name: 'Semantic decompiler', exact: true }).count(), 1);
    const identityCase = origin + '/decompiler?case=identity-management';
    await page.getByRole('link', { name: 'Identity Management trace' }).click();
    await page.getByRole('heading', { name: 'Identity Management', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 6);
    assert.equal(await page.getByText(/Mapping · Matches.*Browser boundary · Matches/).count(), 6);
    for (const path of ['/account/identity/', '/administration/identity/', '/settings/identity/']) {
      const caseRow = page.getByRole('article').filter({ has: page.getByRole('heading', { name: path, exact: true }) });
      assert.equal(await caseRow.getByText(/133 of 133 references covered/).count(), 1);
    }
    assert.match(await page.locator('.decision').innerText(), /0 HTTP requests/);
    const proposal = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '/account/identity/', exact: true }) });
    await proposal.getByText('Contract IDs and browser effects').click();
    assert.match(await proposal.innerText(), /home\.sign-in\.sourcery-google/);
    assert.match(await proposal.innerText(), /ingress\.identity\.bare-get-alias/);
    assert.match(await proposal.innerText(), /ingress\.identity\.finish-destination/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    const [traceDownload] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('link', { name: 'Download trace (.rel)' }).click()
    ]);
    assert.equal(traceDownload.suggestedFilename(), 'identity-management-trace.rel');
    assert.deepEqual(await readFile(await traceDownload.path()), readIdentityTrace().bytes);
    assert.equal((await fetch(identityCase, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(identityCase, { method: 'POST' })).status, 405);
    assert.equal((await fetch(identityCase + '&download=unknown')).status, 404);
    await page.getByRole('link', { name: 'North River evidence' }).click();
    const desk = page.locator('main.notes');
    const select = page.getByLabel('Document');
    const button = name => page.getByRole('button', { name, exact: true });
    const reading = page.locator('#reading');
    const noScroll = () => page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth === innerWidth && root.scrollHeight === innerHeight &&
        [...document.querySelectorAll('.column:not([hidden]) pre')].every(node => node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth);
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await select.selectOption('session-check');
    assert.match(await reading.innerText(), /SESSION ACCESS-REFUSAL INVARIANT\s+Passed/);
    assert.match(await page.locator('#left').innerText(), /3\.37 s · 530 prompt/);
    assert.match(await page.locator('#left strong.rich-positive').first().innerText(), /Admitted/);
    assert.ok(await page.locator('#left em.rich-note').count());
    await page.locator('#left').getByRole('link', { name: 'Optional context' }).click();
    assert.equal(new URL(page.url()).hash, '#context');
    assert.ok(await page.locator('#left code.rich-code').count());
    assert.equal(await noScroll(), true);
    assert.equal(await reading.getByRole('heading', { name: 'Lexical' }).count(), 1);
    assert.equal(await reading.getByRole('heading', { name: 'PageRank' }).count(), 1);
    await button('Trace').click();
    const instruction = page.getByLabel('Instruction', { exact: true });
    const choose = async pattern => {
      const options = await instruction.locator('option').allTextContents();
      const index = options.findIndex(label => pattern.test(label));
      assert.ok(index >= 0, 'missing recorded instruction ' + pattern);
      await instruction.selectOption({ index });
    };
    const filter = page.getByLabel('Show');
    await filter.selectOption('when');
    await choose(/nr\.liveScope/);
    await page.locator('#left pre').getByText(/Branch (taken|skipped)/).first().waitFor();
    await filter.selectOption('assert');
    await choose(/mw\.exact/);
    await page.locator('#left pre').getByText(/Check passed/).first().waitFor();
    assert.match(await page.locator('#right').innerText(), /Check passed/);
    await filter.selectOption('port-end');
    await choose(/storage\.cas/);
    await page.locator('#left pre').getByText(/Stored-document SHA-256 [0-9a-f]{64}/).first().waitFor();
    const effectCount = await instruction.locator('option').count();
    await page.getByLabel('Find instruction').fill('nr.sessionRepairCheck');
    assert.ok(await instruction.locator('option').count() < effectCount);
    await choose(/nr\.sessionRepairCheck/);
    await page.locator('#left pre').getByText(/Recorded result true/).waitFor();
    assert.match(await page.locator('#left strong.rich-positive').first().innerText(), /Returned/);
    for (const pane of ['#left', '#right']) {
      assert.match(await page.locator(pane).innerText(), /Returned · kernel\.invoke → nr\.sessionRepairCheck/);
      assert.match(await page.locator(pane).innerText(), /Recorded result true/);
    }
    const source = page.locator('#trace-source');
    const coordinate = await source.innerText();
    assert.match(coordinate, /north-river\/live-scope\.encounter:\d+:\d+/);
    const selectedInstruction = await instruction.inputValue();
    await page.setViewportSize({ width: 375, height: 480 });
    await source.click();
    await page.getByRole('button', { name: /Back to Trace/ }).waitFor();
    assert.match(await reading.innerText(), /▶ \d+ +│ +port kernel\.invoke.*nr\.sessionRepairCheck/);
    assert.equal(await reading.locator('.executed.keyword').first().innerText(), 'port');
    assert.ok(await reading.locator('.executed.string').count());
    await page.getByLabel('Line', { exact: true }).fill('1');
    await button('Go').click();
    assert.match(await reading.innerText(), /1 +│ process-module/);
    await page.getByLabel('Find in source', { exact: true }).fill('nr.sessionRefusalChecks');
    await button('Find next').click();
    assert.match(await reading.locator('.match').first().innerText(), /nr.sessionRefusalChecks/);
    await button('Executed statement').click();
    assert.equal(await reading.locator('.executed.keyword').first().innerText(), 'port');
    assert.equal(await noScroll(), true);
    assert.equal(new URL(page.url()).pathname, '/decompiler');
    const sourceUrl = page.url();
    assert.match(new URL(sourceUrl).hash, /\/[0-9a-f]{64}\/\d+$/);
    const traceIndex = await (await fetch(origin + '/decompiler/trace-data?case=session-check')).json();
    const recorded = traceIndex[1].find(site => site.query === 'nr.sessionRepairCheck');
    assert.equal(Object.hasOwn(recorded, 'lexical'), false);
    const sourcePayload = await (await fetch(origin + '/decompiler/source-data?pin=' + recorded.source.sha256)).json();
    assert.equal(sourcePayload.pin, recorded.source.sha256);
    assert.match(sourcePayload.text.slice(recorded.source.start, recorded.source.end), /^port kernel\.invoke/);
    assert.equal((await fetch(origin + '/decompiler/source-data?pin=' + '0'.repeat(64))).status, 404);
    await page.reload();
    await page.getByRole('button', { name: /Back to Trace/ }).click();
    assert.equal(await instruction.inputValue(), selectedInstruction);
    assert.notEqual(page.url(), sourceUrl);
    await filter.selectOption('all');
    await page.getByLabel('Differences only', { exact: true }).check();
    await page.locator('#left strong.rich-change').first().waitFor();
    const firstDifference = await instruction.inputValue();
    const nextDifference = page.getByRole('button', { name: 'Next difference' });
    await nextDifference.click();
    assert.notEqual(await instruction.inputValue(), firstDifference);
    await page.getByRole('button', { name: 'Previous difference' }).click();
    assert.equal(await instruction.inputValue(), firstDifference);
    assert.match(await page.locator('#trace-position').innerText(), /1 \/ \d+ differing/);
    await page.locator('#trace-source').click();
    await page.getByRole('button', { name: /Back to Trace/ }).click();
    assert.equal(await instruction.inputValue(), firstDifference);
    assert.equal(await page.getByLabel('Differences only', { exact: true }).isChecked(), true);
    assert.equal(await noScroll(), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await select.selectOption('before-session-check');
    await button('Overview').click();
    assert.match(await reading.innerText(), /REPLY REVIEW · Missed/);
    await select.selectOption('regression');
    await button('Context').click();
    assert.match(await page.locator('#left').innerText(), /chart-renderer, daily-report/);
    assert.match(await page.locator('#right').innerText(), /reference-example, model-constraint/);
    assert.equal(await noScroll(), true);
    await page.setViewportSize({ width: 375, height: 480 });
    await button('Replies').click();
    const replyDiff = page.getByLabel('Reply differences only');
    await replyDiff.check();
    assert.equal(await page.locator('#reply-position').innerText(), '1 / 2');
    for (const pane of ['#left', '#right']) {
      assert.match(await page.locator(pane).innerText(), /\/model\/change/);
      assert.ok(await page.locator(pane + ' mark.reply-change .rich-json-string').count());
    }
    assert.equal(await noScroll(), true);
    await button('Next field').click();
    assert.equal(await page.locator('#reply-position').innerText(), '2 / 2');
    assert.match(await page.locator('#left').innerText(), /\/model\/check/);
    assert.equal(await button('Next field').isDisabled(), true);
    await button('Previous field').click();
    assert.match(await page.locator('#left').innerText(), /\/model\/change/);
    await replyDiff.uncheck();
    assert.equal(await page.locator('#reply-position').innerText(), 'Full replies');
    await select.selectOption('import-and-entry');
    await button('Replies').click();
    await page.waitForFunction(() => !document.querySelector('#next').disabled);
    const parts = [[], []];
    do {
      assert.equal(await noScroll(), true);
      parts[0].push(await page.locator('#left pre').textContent());
      parts[1].push(await page.locator('#right pre').textContent());
      if (await button('Next ▶').isDisabled()) break;
      await button('Next ▶').click();
    } while (parts[0].length < 20);
    for (const [index, arm] of ['lexical', 'pagerank'].entries()) {
      assert.ok(parts[index].length > 1);
      assert.equal(parts[index].join(''), await page.locator('[data-sheet="import-and-entry"] [data-arm="' + arm + '"] [data-field="reply"]').textContent());
    }
    await button('◀ Previous').click();
    assert.equal(await page.locator('#left pre').textContent(), parts[0].at(-2));
    await button('Files').click();
    const judgedControls = ['benchmark-download', 'benchmark-review', 'benchmark-compare', 'benchmark-review-download'];
    await page.evaluate(ids => {
      for (const id of ids) document.getElementById(id).hidden = false;
      document.getElementById('benchmark-status').textContent = 'import-and-entry · Attributed model judgment available.';
    }, judgedControls);
    assert.equal(await page.locator('#files').evaluate(panel => {
      const bounds = panel.getBoundingClientRect();
      return [...panel.querySelectorAll('a,button')].filter(node => node.getClientRects().length)
        .every(node => node.getBoundingClientRect().bottom <= bounds.bottom);
    }), true);
    await page.evaluate(ids => {
      for (const id of ids) document.getElementById(id).hidden = true;
      document.getElementById('benchmark-status').textContent = '';
    }, judgedControls);
    const [bundle] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Offline replay bundle' }).click()]);
    assert.equal(bundle.suggestedFilename(), 'import-and-entry-north-river-offline-replay.tar');
    await page.setViewportSize({ width: 1280, height: 900 });
    await button('Verify offline replay').click();
    await reading.getByText(/Both arms matched their recorded traces/).waitFor();
    assert.equal(new URL(page.url()).pathname, '/decompiler');
    assert.equal(await desk.count(), 1);
    assert.equal(await noScroll(), true);
    for (const name of ['Overview', 'Effects', 'Pins']) {
      const tab = page.locator('[data-tab]').filter({ hasText: name });
      if (await tab.count()) {
        await tab.click();
        assert.equal(await noScroll(), true);
      }
    }
    await page.getByRole('link', { name: 'Evaluation', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/evaluation');
    assert.equal(await page.getByRole('heading', { name: 'Model evaluation', exact: true }).count(), 1);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(origin + '/decompiler/pagerank');
    assert.match(await page.locator('#refusal > p').innerText(), /1 issue.*render report tables and charts/);
    assert.match(await page.locator('#repair > p').innerText(), /returned no issues/);
    assert.ok(await page.getByText(/Returned · storage\.cas/).count());
    const decision = page.locator('#refusal .event').filter({ hasText: 'Branch taken' }).first();
    await decision.locator('summary').click();
    assert.match(await decision.innerText(), /compiled address/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    const evidence = page.getByRole('link', { name: 'Download admitted image' });
    const [image] = await Promise.all([page.waitForEvent('download'), evidence.click()]);
    assert.equal(image.suggestedFilename(), 'repair-image.rel.gz');
    for (const [name, fileName] of [
      ['Download pinned runtime (Linux)', 'encounter.gz'],
      ['Download capture manifest', 'manifest.rel']
    ]) {
      const [artifact] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name, exact: true }).click()]);
      assert.equal(artifact.suggestedFilename(), fileName);
      assert.deepEqual(await readFile(await artifact.path()), await readFile(path.join(__dirname, 'evidence/decompiler', fileName)));
    }
    assert.equal((await fetch(origin + '/decompiler/verify')).status, 405);
    assert.equal((await fetch(origin + '/decompiler/verify', { method: 'POST', headers: { Origin: 'http://elsewhere.localhost' } })).status, 403);
    const invalidJob = await fetch(origin + '/decompiler/benchmark?job=missing');
    assert.equal(invalidJob.status, 404);
    assert.match(invalidJob.headers.get('content-type'), /application\/json/);
    const rejectedAction = await fetch(origin + '/decompiler/benchmark-action?action=judge&job=missing', {
      method: 'POST', headers: { Origin: origin }
    });
    assert.equal(rejectedAction.status, 400);
    assert.match(rejectedAction.headers.get('content-type'), /application\/json/);
    assert.ok(requests.every(url => new URL(url).origin === origin));

  } finally {
    await browser?.close();
    for (const socket of sockets) socket.destroy();
    if (tunnel) await new Promise(resolve => tunnel.close(resolve));
    if (gate && gate.exitCode === null) {
      const exited = once(gate, 'exit');
      gate.kill();
      await exited;
    }
    await rm(gatewayRoot, { recursive: true, force: true });
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('the Identity Management reader checks the reviewed trace pin before decoding', () => {
  const { bytes } = readIdentityTrace();
  assert.throws(() => readIdentityTrace(Buffer.concat([bytes, Buffer.from('\n')])), /reviewed pin/);
});

test('Encounter escapes both reviewer evidence and model reply text', async () => {
  const packet = structuredClone(rel.decode(await readFile(file, 'utf8'), 'EncounterEvaluationReceipt'));
  const hostile = '<img src=x onerror="alert(1)">';
  packet.trials[0].reply = hostile;
  const judgment = packet.judgments.find(row => row.trialSha256 === packet.trials[0].sha256);
  judgment.scores[0].evidence = hostile;
  const result = await loadEncounter()('evaluation.page', packet);
  assert.equal(result.includes(hostile), false);
  assert.ok(result.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  const { capture } = readBundle(path.join(__dirname, 'evidence/decompiler/repair-image.rel.gz'),
    path.join(__dirname, 'evidence/decompiler/repair-run.rel.gz'));
  capture.comparison.arms[0].reply = JSON.stringify({
    change: '<a href=javascript:alert(1)>' + hostile + '</a>', count: 1.25, accepted: true, note: null
  }, null, 2);
  const desk = await loadEncounter()('desk.sheet', {
    ...capture, runs: [], phases: [], id: 'fixture', title: 'Fixture', expectation: null, digest: '',
    comparison: { ...capture.comparison, phases: [] }
  });
  assert.match(desk, /<code class="rich-json-key">&quot;change&quot;<\/code>/);
  assert.match(desk, /<code class="rich-json-string">&quot;&lt;a href=/);
  assert.match(desk, /<code class="rich-json-number">1\.25<\/code>/);
  assert.match(desk, /<code class="rich-json-literal">true<\/code>/);
  assert.match(desk, /<code class="rich-json-literal">null<\/code>/);
  assert.ok(desk.includes('&lt;a href=javascript:alert(1)&gt;'));
  assert.equal(desk.includes(hostile), false);
});

test('reply comparison follows JSON paths without rounding numbers or confusing null with missing', async () => {
  const evaluate = loadEncounter();
  const compare = (lexical, pagerank) => evaluate('desk.compareReplies', { lexical, pagerank });
  const diff = await compare('{"a/b~c":[{"n":9007199254740993},null],"stable":1e1}',
    '{"stable":10.0,"a/b~c":[{"n":9007199254740992}],"added":true}');
  assert.deepEqual(diff.fields, [
    { path: '/a~1b~0c/0/n', lexical: { present: true, text: '9007199254740993' },
      pagerank: { present: true, text: '9007199254740992' } },
    { path: '/a~1b~0c/1', lexical: { present: true, text: 'null' }, pagerank: { present: false, text: '' } },
    { path: '/added', lexical: { present: false, text: '' }, pagerank: { present: true, text: 'true' } }
  ]);
  assert.deepEqual(await compare('{"a":1,"b":"x"}', '{ "b":"x", "a":1.0 }'), { invalid: [], fields: [] });
  assert.deepEqual(await compare('invalid', '{}'), { invalid: ['Lexical'], fields: [] });
});

test('trace projection keeps separate observations and maps nested sites to pinned statement spans', async () => {
  const directory = path.join(__dirname, 'evidence/decompiler');
  const { capture, imageFiles } = readBundle(path.join(directory, 'repair-image.rel.gz'), path.join(directory, 'repair-run.rel.gz'));
  const runs = structuredClone(capture.runs);
  const branch = runs[0].phases[0].events.find(event => event.kind === 'when' && event.address.length > 1);
  const atSite = event => event.process === branch.process && event.kind === branch.kind &&
    event.address.join('.') === branch.address.join('.');
  runs[1].phases[0].events = runs[1].phases[0].events.filter(event => !atSite(event));
  const projection = traceDocuments(loadEncounter());
  const [phase] = await projection.phases(runs, imageFiles);
  const row = phase.find(site => site.process === branch.process && site.kind === 'when' && site.address === branch.address.join('.'));
  assert.equal(row.lexical[0].sequence, branch.sequence);
  assert.equal(row.lexical[0].taken, branch.data.taken);
  assert.deepEqual(row.pagerank, []);
  const { file, line, start, end, sha256 } = row.source;
  const pinned = imageFiles[file];
  assert.equal(sha256, pinned.sha256);
  assert.equal(pinned.text.slice(0, start).split('\n').length, line);
  assert.match(pinned.text.slice(start, end), /^when /);
});

test('the downloadable archive replays both recorded repairs from scratch', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'offline-replay-download-'));
  let server;
  try {
    server = await preview({ file, port: 0 });
    if (!server.listening) await once(server, 'listening');
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/decompiler/offline-replay.tar');
    assert.equal(response.status, 200);
    await writeFile(path.join(directory, 'bundle.tar'), Buffer.from(await response.arrayBuffer()));
    const exec = promisify(execFile);
    await exec('/usr/bin/tar', ['-xf', 'bundle.tar'], { cwd: directory });
    const { stdout } = await exec(process.execPath, ['replay.cjs'], { cwd: directory, timeout: 40000 });
    assert.match(stdout, /lexical: matched \d+ \+ \d+ events/);
    assert.match(stdout, /pagerank: matched \d+ \+ \d+ events/);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('the first changed branch is reported with recorded and replayed values', async () => {
  const original = [{ entry: 'app.agentResult', repair: false, basis: 'basis', replySha256: 'reply', completed: true,
    trace: { dropped: 0, events: [
      { process: 'example', address: [0], kind: 'when', data: { taken: true } },
      { process: 'example', address: [1], kind: 'when', data: { taken: true } }
    ] } }];
  const replayed = structuredClone(original);
  replayed[0].trace.events[1].data.taken = false;
  const result = verifyTrace(original, replayed, 'lexical');
  assert.equal(result.status, 'mismatch');
  assert.equal(result.mismatch.event, 2);
  assert.equal(result.deliveries[0].matched, 1);
  const html = await loadEncounter()('decompiler.verification', { results: [result], manifestPin: 'test pin' });
  assert.match(html, /Instruction event.*Delivery 1 · Event 2/);
  assert.match(html, /&quot;taken&quot;:true/);
  assert.match(html, /&quot;taken&quot;:false/);
});
