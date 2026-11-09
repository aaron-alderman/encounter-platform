'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { start: startJs } = require('../bootstrap/server.cjs');
const start = process.env.ENCOUNTER_RUST_HOST
  ? ({ directory, declarationFile }) => require('../../encounter-runtime/test/host.cjs')
    .start(path.resolve(__dirname, '..'), { directory, declaration: declarationFile })
  : startJs;
const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT ||
  'C:/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function openBoard(t, name, viewport) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'encounter-board-'));
  const declarationFile = path.join(__dirname, '..', 'products', name, 'application.rel');
  let server;
  let browser;
  t.after(async () => {
    try {
      await browser?.close();
    } finally {
      try {
        await server?.close();
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });
  server = await start({ directory, declarationFile });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await page.goto(server.url)).status(), 200);
  return {
    page,
    errors,
    async restart() {
      await server.close();
      server = await start({ directory, declarationFile });
      assert.equal((await page.goto(server.url)).status(), 200);
    },
  };
}

async function submit(page, control) {
  const [response] = await Promise.all([page.waitForNavigation(), control.click()]);
  assert.equal(response.status(), 200, (await page.locator('body').innerText()).slice(0, 300));
}

async function addItem(page, title) {
  await page.getByLabel('New work item', { exact: true }).fill(title);
  await submit(page, page.getByRole('button', { name: 'Add work item', exact: true }));
  assert.equal(await page.getByRole('status').innerText(), 'Work item added.');
}

test('Workgarden adds, completes, retains, and reopens a work item', async t => {
  const board = await openBoard(t, 'workgarden', { width: 390, height: 844 });
  const { page } = board;
  assert.equal(await page.title(), 'Workgarden');
  const entry = page.getByLabel('New work item', { exact: true });
  await entry.fill('  ');
  await submit(page, page.getByRole('button', { name: 'Add work item', exact: true }));
  assert.match(await page.getByRole('alert').innerText(), /nonblank/);
  await addItem(page, 'Prepare <seedlings>');
  const item = page.getByRole('listitem').filter({ hasText: 'Prepare <seedlings>' });
  await submit(page, item.getByRole('button', { name: 'Complete', exact: true }));
  assert.equal(await item.getByText('Completed', { exact: true }).count(), 1);
  await board.restart();
  await submit(page, item.getByRole('button', { name: 'Reopen', exact: true }));
  assert.equal(await item.getByText('Open', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(board.errors, []);
});

test('Harborboard saves planning states, epics, and acyclic dependencies', async t => {
  const board = await openBoard(t, 'harborboard', { width: 1280, height: 850 });
  const { page } = board;
  const card = title => page.getByRole('article', { name: title, exact: true });
  async function edit(title) {
    const item = card(title);
    await item.getByText('Edit plan and dependencies', { exact: true }).click();
    return item;
  }
  async function addDependency(title, blocker) {
    const item = await edit(title);
    await item.getByLabel('Depends on', { exact: true }).selectOption({ label: blocker });
    await submit(page, item.getByRole('button', { name: 'Add dependency', exact: true }));
  }
  async function plan(title, status, epic) {
    const item = await edit(title);
    await item.getByLabel('Status', { exact: true }).selectOption({ label: status });
    if (epic) await item.getByLabel('Epic', { exact: true }).selectOption({ label: epic });
    await submit(page, item.getByRole('button', { name: 'Save plan', exact: true }));
  }
  assert.equal(await page.title(), 'Harborboard');
  await page.getByLabel('New epic', { exact: true }).fill('Spring launch');
  await submit(page, page.getByRole('button', { name: 'Add epic', exact: true }));
  for (const title of ['Publish guide', 'Review guide', 'Draft guide']) await addItem(page, title);
  await plan('Publish guide', 'In progress', 'Spring launch');
  assert.equal(await page.getByRole('region', { name: 'In progress' }).getByRole('article', { name: 'Publish guide' }).count(), 1);
  assert.equal(await card('Publish guide').getByText('Epic: Spring launch').count(), 1);
  await addDependency('Publish guide', 'Review guide');
  await addDependency('Review guide', 'Draft guide');
  assert.equal(await card('Publish guide').getByText('Blocked by: Review guide').count(), 1);
  await addDependency('Draft guide', 'Publish guide');
  assert.match(await page.getByRole('alert').innerText(), /create a cycle/);
  assert.equal(await card('Draft guide').getByText('Depends on: Publish guide').count(), 0);
  await plan('Review guide', 'Done');
  assert.equal(await card('Publish guide').getByText('Blocked by: Review guide').count(), 0);
  await board.restart();
  assert.equal(await card('Publish guide').getByText('Depends on: Review guide').count(), 1);
  assert.equal(await card('Publish guide').getByText('Epic: Spring launch').count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Done' }).getByRole('article', { name: 'Review guide' }).count(), 1);
  const item = await edit('Publish guide');
  await submit(page, item.getByRole('button', { name: 'Remove dependency: Review guide', exact: true }));
  assert.equal(await card('Publish guide').getByText('Depends on: Review guide').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(board.errors, []);
});
