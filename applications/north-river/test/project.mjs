import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../../../bin/browser-profile.mjs';
import { verifyWorkflow } from './workflow.mjs';
import { fileURLToPath } from 'node:url';
import { start, startImage } from '../../encounter-runtime/test/host.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../..');
const project = 'North River Science Labs';
const original = 'Set up a timesheet app for my business.';
const additional = 'Plan a second timesheet app for the field team.';
const firstAnswer = 'Managers can view reports. Employees alone can edit their own time.';
const secondAnswer = 'Managers can view reports. Field employees can edit only their own entries.';

function observe(page) {
  const runs = new Map();
  page.on('websocket', socket => {
    const id = new URL(socket.url()).searchParams.get('run');
    const events = runs.get(id) || [];
    runs.set(id, events);
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') events.push(JSON.parse(payload));
    });
  });
  return runs;
}

async function main() {
  const previousImage = path.resolve(process.argv[2]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'north-river-project-'));
  const operatorFile = path.join(directory, 'operators.rel');
  const username = 'north-river-owner';
  const password = randomBytes(32).toString('hex');
  const credential = Buffer.from(username + ':' + password).toString('base64');
  const hash = createHash('sha256').update(credential).digest('hex');
  fs.writeFileSync(operatorFile, [
    '("operators", "version", "encounter/operators/1")',
    '("north-river-owner", "role", "author")',
    '("north-river-owner", "basicSha256", "' + hash + '")',
    '("north-river-agent", "role", "proposer")',
    '("north-river-agent", "basicSha256", "' + randomBytes(32).toString('hex') + '")',
  ].join('\n') + '\n', { mode: 0o600 });
  const open = () => start(root, { directory, declaration: 'north-river/application.rel', operatorFile, liveModel: 'ollama-loopback' });
  let server, browser;
  try {
    const previousHost = process.env.ENCOUNTER_PREVIOUS_RUST_HOST || process.env.ENCOUNTER_RUST_HOST;
    const pin = createHash('sha256').update(fs.readFileSync(previousImage)).digest('hex');
    server = await startImage(previousHost, { file: previousImage, pin }, directory, { operatorFile });
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ httpCredentials: { username, password } });
    const home = await context.newPage();
    await home.goto(server.url);
    await home.getByLabel('Project name').fill(project);
    await home.getByRole('button', { name: 'Create project' }).click();
    await home.getByLabel('What do you want to do?').fill(original);
    await home.getByRole('button', { name: 'Create task' }).click();
    await home.getByText(/Revision 2.*Task created/).waitFor();
    await server.close();

    server = await open();
    await home.goto(server.url);
    await home.getByText(/Revision 2.*Task created/).waitFor();
    await home.getByRole('link', { name: 'Project home' }).click();
    await home.getByRole('link', { name: original, exact: true }).waitFor();
    await home.getByRole('link', { name: 'New task' }).click();
    await home.getByLabel('What do you want to do?').fill(additional);
    await home.getByRole('button', { name: 'Create task' }).click();
    const taskRoute = async title => {
      await home.getByRole('link', { name: title, exact: true }).click();
      return home.locator('#next-decision').getByRole('link', { name: 'Open task', exact: true }).getAttribute('href');
    };
    const firstLink = await taskRoute(original);
    const secondLink = await taskRoute(additional);
    assert.equal(firstLink, '/');
    assert.match(secondLink, /^\/\?task=task-[a-f0-9]+$/);
    const first = await context.newPage();
    const second = await context.newPage();
    const firstEvents = observe(first);
    const secondEvents = observe(second);
    await first.goto(server.url + firstLink);
    await second.goto(server.url + secondLink);
    await first.getByRole('button', { name: 'Start live agent run' }).click();
    await second.getByRole('button', { name: 'Start live agent run' }).click();
    await Promise.all([first, second].map(page => page.getByLabel('Your answer').waitFor({ timeout: 200_000 })));
    const stream = async page => new URL(await page.getByRole('region', { name: 'Live agent run' })
      .getAttribute('data-encounter-events'), server.url).searchParams.get('run');
    const firstRun = await stream(first);
    const secondRun = await stream(second);
    const observed = (run, streams) => ({
      run, streams: [...streams.keys()], events: (streams.get(run) || []).map(event => event.kind),
    });
    verifyWorkflow('isolated-runs', { first: observed(firstRun, firstEvents), second: observed(secondRun, secondEvents) });
    console.log('PASS both tasks have separate live runs and WebSocket questions');

    await first.getByLabel('Your answer').fill(firstAnswer);
    await first.getByRole('button', { name: 'Save answer' }).click();
    await second.getByLabel('Your answer').fill(secondAnswer);
    await second.getByRole('button', { name: 'Save answer' }).click();
    const approval = page => page.getByRole('button', { name: 'Approve this plan' });
    await Promise.all([first, second].map(page => approval(page).waitFor({ timeout: 200_000 })));
    const candidate = page => approval(page).locator('..').locator('input[name=candidate]').inputValue();
    const firstHash = await candidate(first);
    const secondHash = await candidate(second);
    verifyWorkflow('distinct-plans', { first: firstHash, second: secondHash });
    await approval(second).locator('..').locator('input[name=candidate]').evaluate((input, value) => { input.value = value; }, firstHash);
    await approval(second).click();
    await second.getByRole('alert').filter({ hasText: 'Open the exact current candidate' }).waitFor();
    await approval(first).click();
    await first.getByRole('heading', { name: 'Approval receipt' }).waitFor();
    await approval(second).waitFor();
    assert.equal(await second.getByRole('heading', { name: 'Approval receipt' }).count(), 0);
    await approval(second).click();
    await second.getByRole('heading', { name: 'Approval receipt' }).waitFor();
    console.log('PASS each plan requires its own approval; a candidate from the other task was refused');

    await server.close();
    server = await open();
    await home.goto(server.url + '/project');
    const decided = home.getByRole('region', { name: 'Decided tasks' });
    await decided.getByRole('link', { name: original, exact: true }).waitFor();
    await decided.getByRole('link', { name: additional, exact: true }).waitFor();
    for (const [page, link, run, plan] of [[first, firstLink, firstRun, firstHash], [second, secondLink, secondRun, secondHash]]) {
      await page.goto(server.url + link);
      await page.getByRole('heading', { name: 'Approval receipt' }).waitFor();
      await page.getByText('Approved plan: ' + plan, { exact: true }).waitFor();
      assert.equal(await stream(page), run);
    }
    console.log('PASS original task history retained and both run and approval identities survive restart');
  } finally {
    await browser?.close();
    await server?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
