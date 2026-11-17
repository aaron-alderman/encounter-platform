import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { chromium } from '../../../../bin/browser-profile.mjs';
import { verifyWorkflow } from './workflow.mjs';
import { fileURLToPath } from 'node:url';
import { start } from '../../encounter-runtime/test/host.mjs';
import { decode, encode } from '../../encounter-runtime/test/rel-values.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../..');
const objective = 'I want to set up a timesheet app for my business.';
const answer = 'Managers can view reports, but only employees can edit their own entries.';

async function draftView(context, url, viewport, mobile) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(url);
  const decision = page.getByRole('region', { name: 'Current decision' });
  const disclosure = page.locator('#current-plan-record');
  const bounds = await decision.boundingBox();
  const details = await disclosure.boundingBox();
  assert.ok(bounds && details && details.y >= bounds.y + bounds.height, 'the decision leads the optional plan');
  assert.equal(await disclosure.getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const height = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, window: innerHeight }));
  assert.ok(height.page <= height.window, 'closed notebook fits in one window: ' + JSON.stringify(height));
  assert.equal(await decision.getByText('Why this matters', { exact: true }).count(), 1);
  if (mobile) {
    const longQuestion = 'Can managers edit employee timesheets, or should they only view reports? '.repeat(7).slice(0, 450);
    const long = await decision.locator('.task-question').evaluate((question, text) => {
      const original = question.textContent;
      question.textContent = text;
      try {
        question.scrollTop = question.scrollHeight;
        return {
          fits: document.documentElement.scrollHeight <= innerHeight,
          fullText: question.textContent,
          reachable: question.scrollTop > 0 && question.scrollTop + question.clientHeight === question.scrollHeight,
        };
      } finally {
        question.textContent = original;
        question.scrollTop = 0;
      }
    }, longQuestion);
    assert.deepEqual(long, { fits: true, fullText: longQuestion, reachable: true });
    const context = decision.locator('.task-question-context');
    await context.locator('summary').click();
    assert.ok(await context.locator('p').isVisible(), 'the full explanation remains available');
    await context.locator('summary').click();
  }
  assert.equal(await page.locator('#activity-evidence').getAttribute('open'), null);
  await page.getByText('Activity & evidence', { exact: true }).click();
  await page.getByText('Model receipt · initial', { exact: true }).click();
  const field = page.getByLabel('Your answer');
  const draft = mobile ? 'My mobile answer draft' : 'My desktop answer draft';
  await field.fill(draft);
  await field.evaluate(input => input.setSelectionRange(4, 10));
  await page.evaluate(() => scrollTo(0, 120));
  const position = await page.evaluate(() => scrollY);
  assert.ok(position > 0);
  return { page, field, draft, position, mobile };
}

async function verifyDraftView(view, cursor, revisionCursor) {
  const { page, field, draft, position, mobile } = view;
  await page.waitForFunction(({ key, latest }) => sessionStorage.getItem(key) === latest, { key: cursor, latest: revisionCursor });
  await page.getByText('New activity is ready. Your answer draft is still here.', { exact: true }).waitFor();
  assert.equal(await field.inputValue(), draft);
  assert.equal(await page.getByRole('button', { name: 'Save answer' }).isDisabled(), true);
  assert.deepEqual(await field.evaluate(input => [input.selectionStart, input.selectionEnd, document.activeElement === input]), [4, 10, true]);
  assert.equal(await page.evaluate(() => scrollY), position);
  await page.getByRole('button', { name: 'Show latest' }).click();
  const decision = page.getByRole('region', { name: 'Current decision' });
  await decision.getByRole('heading', { name: 'What your answer changed' }).waitFor();
  assert.equal(await decision.evaluate(region => document.activeElement === region), true);
  assert.ok((await decision.innerText()).includes(answer));
  assert.equal(await decision.getByRole('heading', { name: 'New access check' }).count(), 1);
  assert.equal(await page.evaluate(() => scrollY), position);
  assert.notEqual(await page.locator('#activity-evidence').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.ENCOUNTER_UI_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.ENCOUNTER_UI_SCREENSHOTS, mobile ? 'mobile.png' : 'desktop.png'), fullPage: true });
  }
  await page.getByText('Your unsent answer', { exact: true }).click();
  assert.equal(await page.getByLabel('Unsent answer', { exact: true }).inputValue(), draft);
  await page.close();
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'north-river-live-'));
  const operatorFile = path.join(directory, 'operators.rel');
  const replay = process.env.ENCOUNTER_NORTH_RIVER_REPLAY === '1';
  const validDependency = process.env.ENCOUNTER_NORTH_RIVER_REPLAY === 'valid';
  if (replay || validDependency) {
    const proposal = decode(fs.readFileSync(path.join(__dirname, 'scoped-proposal.rel'), 'utf8'), 'ApplicationData');
    const misplaced = { ...proposal.steps.model, change: 'render report tables and charts' };
    const fixture = replay ? { ...proposal, steps: { ...proposal.steps, model: misplaced } } : proposal;
    process.env.ENCOUNTER_TEST_MODEL_REPLAY = path.join(directory, 'model-replay.rel');
    fs.writeFileSync(process.env.ENCOUNTER_TEST_MODEL_REPLAY, encode(fixture, 'EncounterModelReplay'), { mode: 0o600 });
  }
  const accounts = [
    ['north-river-owner', 'author'], ['north-river-agent', 'proposer']
  ].map(([id, role]) => {
    const password = randomBytes(32).toString('hex');
    const token = Buffer.from(id + ':' + password).toString('base64');
    return { id, role, password, authorization: 'Basic ' + token, hash: createHash('sha256').update(token).digest('hex') };
  });
  fs.writeFileSync(operatorFile, [
    '("operators", "version", "encounter/operators/1")',
    ...accounts.flatMap(account => [
      '("' + account.id + '", "role", "' + account.role + '")',
      '("' + account.id + '", "basicSha256", "' + account.hash + '")'
    ]), ''
  ].join('\n'), { mode: 0o600 });
  const [owner, proposer] = accounts;
  const open = () => start(root, { directory, declaration: 'north-river/application.rel', operatorFile, liveModel: 'ollama-loopback' });
  let server;
  let browser;
  let page;
  try {
    server = await open();
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ httpCredentials: { username: owner.id, password: owner.password } });
    page = await context.newPage();
    const sockets = [];
    const events = [];
    page.on('websocket', socket => {
      sockets.push(socket.url());
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload === 'string') events.push(JSON.parse(payload));
      });
    });
    page.on('pageerror', error => console.error('Browser script:', error.message));
    await page.goto(server.url);
    await page.getByLabel('Project name').fill('North River Science Labs');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByLabel('What do you want to do?').fill(objective);
    await page.getByRole('button', { name: 'Create task' }).click();
    await page.getByRole('button', { name: 'Start live agent run' }).click();
    console.log('Live run requested.');
    const live = page.getByRole('region', { name: 'Live agent run' });
    const stream = await live.getAttribute('data-encounter-events');
    const runId = new URL(stream, server.url).searchParams.get('run');
    assert.match(runId, /^ollama-[0-9a-f]+$/);
    const decision = page.getByRole('region', { name: 'Current decision' });
    if (replay) {
      const blocker = page.locator('[data-attention="critical"][data-standing="blocked"]');
      await blocker.getByText('Critical · Repair required', { exact: true }).waitFor();
      assert.equal(await blocker.evaluate(card => getComputedStyle(card).borderTopColor), 'rgb(153, 27, 27)');
      assert.match(await blocker.getByRole('alert').innerText(), /Define the model.*render report tables and charts/);
      assert.equal(await page.getByRole('button', { name: 'Approve this plan' }).count(), 0);
    }
    await page.getByLabel('Your answer').waitFor({ timeout: 185000 });
    assert.equal(sockets.length >= 1, true);
    const initialEvents = events.map(item => item.kind);
    const repaired = initialEvents.includes('repair-requested');
    verifyWorkflow('initial-events', { events: initialEvents, requiresRepair: replay });
    assert.equal(await decision.getAttribute('data-attention'), 'decision');
    assert.equal(await decision.getAttribute('data-standing'), 'waiting');
    assert.equal(await page.locator('[data-attention="critical"]').count(), 0);
    if (replay) {
      assert.equal(await decision.getByText('Your answer is needed', { exact: true }).count(), 1);
      assert.match(await decision.locator('[data-attention="checked"]').innerText(), /Repair checked/);
      assert.ok(await decision.evaluate(card => card.parentElement.firstElementChild === card));
    }
    if (validDependency) {
      assert.equal(repaired, false);
      const model = page.locator('#task-current-step-model');
      await model.locator('summary').click();
      assert.match(await model.innerText(), /The report will group by that reference/);
      assert.equal(await model.getAttribute('data-attention'), 'ordinary');
      assert.equal(await model.evaluate(step => getComputedStyle(step).color), 'rgb(24, 47, 53)');
      assert.equal(await page.locator('#activity-evidence').getAttribute('data-attention'), 'reference');
      assert.equal(await page.locator('[data-attention="critical"]').count(), 0);
      console.log('PASS attention: valid report dependency remains ordinary in the browser.');
      return;
    }
    const question = await page.getByRole('region', { name: 'Current decision' }).locator('.task-question').innerText();
    assert.match(question, /manager/i);
    assert.match(question, /\?/);
    assert.equal(await page.getByRole('button', { name: 'Approve this plan' }).count(), 0);
    const outsider = await fetch(server.url, { headers: { Authorization: proposer.authorization } });
    const outsiderCookie = outsider.headers.get('set-cookie').split(';')[0];
    const denied = await new Promise((resolve, reject) => {
      const origin = new URL(server.url);
      const socket = net.createConnection(Number(origin.port), origin.hostname, () => {
        socket.write([
          'GET ' + stream + '&after=0 HTTP/1.1', 'Host: ' + origin.host, 'Origin: ' + origin.origin,
          'Cookie: ' + outsiderCookie, 'Connection: Upgrade', 'Upgrade: websocket',
          'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: ' + randomBytes(16).toString('base64'), '', ''
        ].join('\r\n'));
      });
      let reply = '';
      socket.on('data', data => { reply += data; });
      socket.on('end', () => resolve(reply));
      socket.on('error', reject);
      socket.setTimeout(5000, () => socket.destroy(Error('WebSocket refusal timed out')));
    });
    assert.match(denied, /^HTTP\/1\.1 403 Forbidden/);
    assert.doesNotMatch(denied, /run-started|question/);
    console.log('Question arrived over WebSocket: ' + question);

    const cursor = 'encounter-events:' + stream;
    const questionCursor = String(initialEvents.length);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), cursor), questionCursor);
    const mobileContext = await browser.newContext({
      httpCredentials: { username: owner.id, password: owner.password },
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1
    });
    const desktopDraft = await draftView(context, server.url, { width: 1280, height: 850 }, false);
    const mobileDraft = await draftView(mobileContext, server.url, { width: 390, height: 844 }, true);
    const passive = await context.newPage();
    await passive.goto(server.url);
    await passive.getByText('Activity & evidence', { exact: true }).click();
    await passive.getByText('Model receipt · initial', { exact: true }).click();
    await passive.evaluate(() => scrollTo(0, 120));
    const passiveScroll = await passive.evaluate(() => scrollY);
    assert.ok(passiveScroll > 0);
    await page.goto('about:blank');
    const answerPage = await context.newPage();
    await answerPage.route('**/encounter-events.js', route => route.abort());
    await answerPage.goto(server.url);
    await answerPage.getByLabel('Your answer').fill(answer);
    await answerPage.getByRole('button', { name: 'Save answer' }).click();
    assert.match(await answerPage.locator('.feedback').innerText(), /Answer saved/);
    await answerPage.close();
    console.log('Answer committed while the subscribed tab was disconnected.');

    const waitUntil = Date.now() + 185000;
    let revisionCursor = null;
    while (Date.now() < waitUntil) {
      const response = await context.request.get(server.url, { headers: { Authorization: owner.authorization } });
      const html = await response.text();
      assert.doesNotMatch(html, /Run failed:/);
      if (html.includes('Approve this plan')) {
        revisionCursor = /data-rendered="(\d+)"/.exec(html)?.[1];
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    assert.ok(revisionCursor, 'model did not complete the resumed run');
    await passive.getByRole('heading', { name: 'What your answer changed' }).waitFor();
    assert.equal(await passive.evaluate(() => scrollY), passiveScroll);
    assert.notEqual(await passive.locator('#activity-evidence').getAttribute('open'), null);
    await passive.close();
    await verifyDraftView(desktopDraft, cursor, revisionCursor);
    await verifyDraftView(mobileDraft, cursor, revisionCursor);
    await mobileContext.close();
    console.log('PASS desktop and mobile: decision layout, live draft and caret, retained answer and scroll position.');
    await page.goto(server.url);
    await page.waitForFunction(({ key, latest }) => sessionStorage.getItem(key) === latest, { key: cursor, latest: revisionCursor });
    assert.ok(sockets.some(socket => socket.includes('after=' + questionCursor)));
    verifyWorkflow('resumed-events', { initial: initialEvents,
      resumeRepair: Number(revisionCursor) > initialEvents.length + 3, events: events.map(item => item.kind) });
    assert.equal(await live.getAttribute('data-encounter-events'), stream);
    assert.equal(await decision.getAttribute('data-standing'), 'reviewable');
    assert.equal(await decision.getAttribute('data-attention'), 'decision');
    assert.equal(await decision.getByRole('button', { name: 'Approve this plan' }).count(), 1);
    await page.locator('#current-plan-record > summary').click();
    const current = page.getByRole('region', { name: 'Current plan' });
    await current.getByText('Assumptions', { exact: true }).click();
    assert.ok((await current.innerText()).includes(answer));
    const revisedAccess = current.locator('details').filter({ hasText: 'Exercise separate sessions' });
    await revisedAccess.locator('summary').click();
    const accessText = await revisedAccess.innerText();
    assert.match(accessText, /manager/i);
    assert.match(accessText, /refus|den(y|ied)|cannot|prohibit|block|prevent|only/i);
    await live.getByText('Activity & evidence', { exact: true }).click();
    assert.equal(await live.getByText('Model receipt · initial', { exact: true }).count(), 1);
    assert.equal(await live.getByText('Model receipt · resume', { exact: true }).count(), 1);
    if (replay) {
      await live.getByText('Model receipt · initial', { exact: true }).click();
      const original = live.locator('details').filter({ has: page.getByText('Model receipt · initial', { exact: true }) }).last();
      assert.match(await original.innerText(), /suspected-prose-mismatch/);
      assert.match(await original.innerText(), /render report tables and charts/);
      await live.getByText('Model receipt · initial repair', { exact: true }).click();
      const repair = live.locator('details').filter({ has: page.getByText('Model receipt · initial repair', { exact: true }) }).last();
      assert.match(await repair.innerText(), /Validated/);
      const raw = JSON.parse(await repair.locator('pre').last().textContent());
      verifyWorkflow('repair-scope', raw);
      const model = current.locator('details').filter({ hasText: 'Define the model' });
      await model.locator('summary').click();
      assert.ok((await model.innerText()).includes(raw.model.change));
      const report = current.locator('details').filter({ hasText: 'Build the report' });
      await report.locator('summary').click();
      const baseline = decode(fs.readFileSync(path.join(__dirname, 'scoped-proposal.rel'), 'utf8'), 'ApplicationData');
      assert.ok((await report.innerText()).includes(baseline.steps.report.change));
      console.log('PASS browser repair: original report wording flagged, targeted Ollama reply retained, unaffected report step unchanged.');
    }

    const attempted = await fetch(server.url + '/agent', { headers: { Authorization: proposer.authorization } });
    assert.match(await attempted.text(), /no grant for this task surface/);
    await page.getByRole('button', { name: 'Approve this plan' }).click();
    const openReceipt = () => page.getByRole('link', { name: 'Inspect approval receipt', exact: true }).click();
    const receipt = page.getByRole('region', { name: 'Approval receipt', exact: true });
    await openReceipt();
    const approved = await receipt.innerText();
    assert.ok(approved.includes('Approved by north-river-owner'));
    assert.ok(approved.includes('Approved task revision ' + (Number(revisionCursor) + 2)));
    assert.ok(approved.includes('Answer revision: ' + (Number(questionCursor) + 3)));
    assert.match(approved, /Decision SHA-256: [0-9a-f]{64}/);
    assert.match(approved, /Committed task SHA-256: [0-9a-f]{64}/);
    assert.equal(await page.getByRole('button', { name: 'Attach employee CSV' }).count(), 0);
    assert.equal((await server.close()).code, 0);
    server = await open();
    await page.goto(server.url);
    await openReceipt();
    assert.equal(await receipt.innerText(), approved);
    const finalEvent = await page.evaluate(({ stream, revisionCursor }) => new Promise((resolve, reject) => {
      const endpoint = new URL(stream, location.href);
      endpoint.protocol = 'ws:';
      endpoint.searchParams.set('after', revisionCursor);
      const socket = new WebSocket(endpoint);
      const timeout = setTimeout(() => { socket.close(); reject(Error('Approval event replay timed out')); }, 5000);
      socket.onmessage = event => {
        clearTimeout(timeout);
        socket.close();
        resolve(JSON.parse(event.data));
      };
    }), { stream, revisionCursor });
    assert.equal(finalEvent.kind, 'plan-approved');
    assert.equal(finalEvent.sequence, Number(revisionCursor) + 1);
    console.log('PASS live Ollama run: same run resumed, WebSocket replay from ' + questionCursor + ' to ' + revisionCursor + ', human-only approval retained after restart');
  } catch (error) {
    if (page) console.error((await page.locator('body').innerText().catch(() => '')).slice(-5000));
    throw error;
  } finally {
    await browser?.close();
    await server?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
