import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../../../../bin/browser-profile.mjs';

const { origin, certificate, port, steward, apiApp, stateful, member, manager } =
  JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(new URL(origin).hostname, 'appdev-assurance.test');
assert.equal(new URL(origin).protocol, 'https:');
const publicKey = new X509Certificate(await readFile(certificate)).publicKey.export({ type: 'spki', format: 'der' });
const pin = createHash('sha256').update(publicKey).digest('base64');
const [name, value] = steward.split('=');
const browser = await chromium.launch({
  headless: true, args: ['--no-sandbox', '--no-proxy-server',
    '--host-resolver-rules=MAP appdev-assurance.test 127.0.0.1:' + port,
    '--ignore-certificate-errors-spki-list=' + pin],
});
let page;
try {
  const visitor = await browser.newContext();
  const guest = await visitor.newPage();
  const deniedUrl = origin + '/workspace/platform?view=app-build&app=' + apiApp;
  const denied = await guest.goto(deniedUrl);
  assert.equal(denied.status(), 403);
  await guest.getByRole('heading', { name: 'Sign in to Platform' }).waitFor();
  assert.equal(await guest.getByRole('link', { name: 'Open Home to sign in' }).getAttribute('href'), '/workspace/home');
  await Promise.all([guest.waitForNavigation(), guest.getByRole('link', { name: 'Try again' }).click()]);
  assert.equal(guest.url(), deniedUrl);
  await visitor.close();
  const context = await browser.newContext();
  await context.addCookies([{ name, value, url: origin, secure: true, httpOnly: true }]);
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(origin + '/workspace/platform');
  await page.getByRole('heading', { name: 'Choose a Temple' }).waitFor();
  await page.getByLabel('Existing Temple address').fill(origin);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const launcher = page.getByRole('navigation', { name: 'Platform apps' });
  await launcher.getByRole('link', { name: /^App Build / }).click();
  const frame = page.frameLocator('iframe[title="Platform workspace"]');
  const panelUrl = async () => frame.locator('html').evaluate(element => element.ownerDocument.location.href);
  await frame.getByRole('heading', { name: 'App Build', exact: true }).waitFor();
  assert.equal(new URL(await panelUrl()).searchParams.get('view'), 'app-build');
  await frame.getByRole('region', { name: 'Create an app' }).getByLabel('App name').waitFor();
  const appTable = frame.getByRole('table', { name: 'Your isolated apps' });
  await appTable.getByRole('columnheader', { name: 'Release status' }).waitFor();
  assert.equal(await appTable.getByRole('cell', { name: 'Active release', exact: true }).count(), 2);
  const panels = frame.locator('#app-build-panel > .manager-panes > .desktop-scroll-pane');
  const measure = async () => panels.evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  const desktop = await measure();
  const shell = frame.locator('main[data-window-type="document"][data-desktop-layout="document"]');
  assert.equal(await shell.locator(':scope > .desktop-app-content > .manager-panel').count(), 1);
  const surfaces = await shell.evaluate(window => {
    const style = element => getComputedStyle(element);
    const index = style(window.querySelector('.manager-tree'));
    const paper = style(window.querySelector('.manager-panel'));
    return { frame: style(window).backgroundColor, paper: paper.backgroundColor,
      index: index.backgroundColor, border: index.borderInlineEndWidth };
  });
  assert.notEqual(surfaces.frame, surfaces.paper);
  assert.notEqual(surfaces.index, surfaces.paper);
  assert.equal(surfaces.border, '1px');
  assert.equal(desktop[0], desktop[1], 'app list and create form share the desktop row');
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await measure();
  assert.ok(narrow[1] > narrow[0], 'app list and create form stack on a narrow viewport');
  await page.setViewportSize({ width: 1280, height: 720 });
  await frame.getByLabel('App name').fill('North River Manual');
  const [creation] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url() === origin + '/workspace/app-build'),
    frame.getByRole('button', { name: 'Create isolated app' }).click()
  ]);
  assert.equal(creation.status(), 303, 'create response');
  await frame.getByRole('heading', { name: 'North River Manual', exact: true }).waitFor();
  const app = new URL(await panelUrl()).searchParams.get('app');
  assert.match(app, /^[a-f0-9]{64}$/);
  assert.notEqual(app, apiApp);
  const openViews = () => frame.locator('details[name="app-build-view"][open] > summary').allTextContents();
  assert.deepEqual(await openViews(), ['Source']);
  assert.equal(await frame.locator('main').evaluate(main => {
    const style = getComputedStyle(main.querySelector('.manager-panel'));
    const paper = style.getPropertyValue('--sourcery-paper').trim();
    return Boolean(paper && style.backgroundColor !== 'rgba(0, 0, 0, 0)');
  }), true, 'shared Sourcery OS theme applied under CSP');
  await frame.getByLabel('Application declaration (application.rel)', { exact: true }).fill(stateful['application.rel']);
  await frame.getByLabel('Main source (main.encounter)', { exact: true }).fill(stateful['main.encounter']);
  await frame.getByLabel('Assurance source (checks.encounter)', { exact: true }).fill(stateful['checks.encounter']);
  await frame.locator('summary#receipts').click();
  assert.deepEqual(await openViews(), ['Receipts']);
  assert.equal(await frame.getByLabel('Main source (main.encounter)', { exact: true }).isVisible(), false);
  await frame.locator('summary#source').click();
  assert.deepEqual(await openViews(), ['Source']);
  assert.equal(await frame.getByLabel('Main source (main.encounter)', { exact: true }).inputValue(), stateful['main.encounter']);
  await frame.getByRole('button', { name: 'Submit candidate' }).click();
  await frame.getByText('Assurance pending', { exact: true }).waitFor();
  const candidate = new URL(await panelUrl()).searchParams.get('candidate');
  assert.match(candidate, /^[a-f0-9]{64}$/);
  assert.deepEqual(await openViews(), ['Assurance']);
  await frame.locator('summary#source').press('Enter');
  assert.deepEqual(await openViews(), ['Source']);
  assert.equal(await frame.getByLabel('Main source (main.encounter)', { exact: true }).inputValue(), stateful['main.encounter']);
  assert.equal(new URL(await panelUrl()).searchParams.get('candidate'), candidate);
  await frame.locator('summary#assurance').press('Enter');
  assert.deepEqual(await openViews(), ['Assurance']);
  await frame.getByRole('button', { name: 'Run Assurance' }).click();
  await frame.getByText('Assurance passed', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Approve candidate' }).click();
  await frame.getByText('Approved', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Activate candidate' }).click();
  await frame.getByRole('link', { name: 'Open activation receipt' }).click();
  const receiptUrl = new URL(await panelUrl());
  assert.match(receiptUrl.searchParams.get('receipt'), /^[a-f0-9]{64}$/);
  assert.equal(receiptUrl.searchParams.get('app'), app);
  await page.goto(receiptUrl.href);
  await frame.getByText('Activated', { exact: true }).waitFor();
  assert.deepEqual(await openViews(), ['Receipts']);
  assert.equal(await frame.getByText('Assurance passed', { exact: true }).isVisible(), false);
  assert.equal(await frame.getByRole('link', { name: 'Open activation receipt' }).isVisible(), true);
  assert.equal(await frame.getByRole('region', { name: 'Selected candidate' }).locator('code').textContent(), candidate);
  await frame.getByRole('link', { name: 'Open active app' }).click();
  await frame.getByText('No requests yet.', { exact: true }).waitFor();
  await page.goto(receiptUrl.href);
  await frame.getByLabel('New app name').fill('North River Replay');
  await frame.getByRole('button', { name: 'Start guided replay' }).click();
  await frame.getByRole('heading', { name: 'Guided replay', exact: true }).waitFor();
  const replayApp = new URL(await panelUrl()).searchParams.get('app');
  assert.match(replayApp, /^[a-f0-9]{64}$/);
  assert.notEqual(replayApp, app);
  for (const [label, name] of [
    ['Application declaration', 'application.rel'],
    ['Main source', 'main.encounter'],
    ['Assurance source', 'checks.encounter'],
  ]) {
    const field = frame.getByLabel(label + ' (' + name + ')', { exact: true });
    assert.equal(await field.inputValue(), stateful[name]);
    assert.equal(await field.getAttribute('readonly'), '');
  }
  await frame.getByRole('button', { name: 'Submit candidate' }).click();
  await frame.getByText('Assurance pending', { exact: true }).waitFor();
  await page.reload();
  await frame.getByRole('button', { name: 'Run Assurance' }).click();
  await frame.getByText('Assurance passed', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Approve candidate' }).click();
  await frame.getByText('Approved', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Activate candidate' }).click();
  await frame.getByRole('link', { name: 'Open activation receipt' }).waitFor();
  const replayReceiptUrl = new URL(await panelUrl());
  const replayReceipt = replayReceiptUrl.searchParams.get('receipt');
  assert.match(replayReceipt, /^[a-f0-9]{64}$/);
  assert.notEqual(replayReceipt, receiptUrl.searchParams.get('receipt'));
  await frame.getByRole('link', { name: 'Open activation receipt' }).click();
  await frame.getByText('Activated', { exact: true }).waitFor();
  await frame.getByRole('link', { name: 'Open active app' }).click();
  await frame.getByText('No requests yet.', { exact: true }).waitFor();

  const openRole = async (cookie) => {
    const roleContext = await browser.newContext();
    const [roleName, roleValue] = cookie.split('=');
    await roleContext.addCookies([{ name: roleName, value: roleValue, url: origin, secure: true, httpOnly: true }]);
    return roleContext.newPage();
  };
  const employee = await openRole(member);
  const reviewer = await openRole(manager);
  const paths = {
    manual: { app: app, receipt: receiptUrl.searchParams.get('receipt'), request: 'NR-MANUAL' },
    replay: { app: replayApp, receipt: replayReceipt, request: 'NR-REPLAY' },
  };
  for (const path of Object.values(paths)) {
    await page.goto(origin + '/workspace/platform?view=app-build&' + new URLSearchParams({
      app: path.app, receipt: path.receipt,
    }));
    await frame.getByText('Activated', { exact: true }).waitFor();
    for (const [email, role] of [['member@example.test', 'employee'], ['other-customer@example.test', 'manager']]) {
      const emailField = frame.getByLabel('Temple account email');
      if (!(await emailField.isVisible())) {
        await frame.getByText('App access', { exact: true }).click();
      }
      await emailField.fill(email);
      await frame.getByLabel('App role').selectOption(role);
      const [grant] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/workspace/app-build'),
        frame.getByRole('button', { name: 'Save app access', exact: true }).click(),
      ]);
      assert.equal(grant.status(), 303);
      await frame.getByText(email + ' · ' + role, { exact: true }).waitFor({ state: 'attached' });
    }
    const target = origin + '/workspace/app-build/run?app=' + path.app;
    const id = path.request;
    await employee.goto(target);
    await employee.getByText('No requests yet.', { exact: true }).waitFor();
    await employee.getByLabel('Request reference').fill(id);
    await employee.getByLabel('Request details').fill('Review a timesheet');
    const [submittedRequest] = await Promise.all([
      employee.waitForResponse(response => response.request().method() === 'POST'),
      employee.getByRole('button', { name: 'Submit request' }).click()
    ]);
    assert.equal(submittedRequest.status(), 303, 'employee form submission');
    await employee.getByText(id + ' · Review a timesheet · Pending', { exact: true }).waitFor();
    await reviewer.goto(target);
    await reviewer.getByText(id + ' · Review a timesheet · Pending', { exact: true }).waitFor();
    const [approvedRequest] = await Promise.all([
      reviewer.waitForResponse(response => response.request().method() === 'POST'),
      reviewer.getByRole('button', { name: 'Approve ' + id }).click()
    ]);
    assert.equal(approvedRequest.status(), 303, 'manager form submission');
    await reviewer.getByText(id + ' · Review a timesheet · Approved', { exact: true }).waitFor();
    await employee.reload();
    await employee.getByText(id + ' · Review a timesheet · Approved', { exact: true }).waitFor();
  }
  await writeFile(process.argv[3], JSON.stringify(paths), { mode: 0o600, flag: 'wx' });
  console.log('PASS: North River manual UI and guided replay built fresh apps and used employee and manager forms');
} catch (error) {
  if (page) console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  throw error;
} finally {
  await browser.close();
}
