import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../../../bin/browser-profile.mjs';
import { verifyWorkflow } from './workflow.mjs';
import { fileURLToPath } from 'node:url';
import { decode, encode } from '../../encounter-runtime/test/rel-values.mjs';
import { start } from '../../encounter-runtime/test/host.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../..');
const declaration = 'north-river/application.rel';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const objective = 'I want to set up a timesheet app for my business.';
const answer = 'Managers can view reports, but only employees can edit their own entries.';

function preparePackage(directory) {
  const source = fs.readFileSync(path.join(root, declaration), 'utf8');
  const fileProperties = new Set(['module', 'source', 'dataSource']);
  const files = new Set([declaration]);
  for (const line of source.split('\n')) {
    const tuple = line.trim();
    if (!tuple.startsWith('(')) continue;
    const [, property, coordinate] = JSON.parse('[' + tuple.slice(1, -1) + ']');
    if (fileProperties.has(property)) files.add(coordinate);
  }
  for (const file of files) {
    assert(typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\')
      && file.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid package coordinate');
    const destination = path.join(directory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL);
  }
  return directory;
}

async function verifyTimesheet({ browser, accounts, url, restart }) {
  const [mayaAccount, samAccount, rileyAccount, managerAccount, unlinkedAccount] = accounts;
  const openAccount = async account => {
    const context = await browser.newContext({ httpCredentials: { username: account.id, password: account.password } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(url() + '/timesheet');
    assert.equal(await page.getByText('Signed in as ' + account.id, { exact: true }).count(), 1);
    return page;
  };
  const [maya, sam, riley, manager, unlinked] = await Promise.all(accounts.map(openAccount));
  const employees = [[maya, 'Maya Chen', 'E-101'], [sam, 'Sam Okafor', 'E-102'], [riley, 'Riley Singh', 'E-103']];
  const dropdown = page => page.getByLabel('Employee', { exact: true });
  for (const [page, name, id] of employees) {
    assert.deepEqual(await dropdown(page).locator('option').allTextContents(), [name], await page.locator('main').innerText());
    assert.equal(await dropdown(page).inputValue(), id);
  }
  assert.match(await manager.locator('main').innerText(), /Manager access is for reports/);
  assert.match(await unlinked.locator('main').innerText(), /no accepted employee assignment/);
  for (const page of [manager, unlinked]) {
    assert.equal(await dropdown(page).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Save time entry' }).count(), 0);
  }

  const date = '2026-11-09';
  const refresh = page => page.goto(url() + '/timesheet');
  const entries = page => page.getByRole('region', { name: 'Your entries' });
  const save = async (page, minutes, correction = false) => {
    await page.getByLabel('Work date').fill(date);
    await page.getByLabel('Minutes worked').fill(String(minutes));
    await page.getByRole('button', { name: correction ? 'Save correction' : 'Save time entry' }).click();
    assert.equal(await page.getByRole('status').innerText(), correction ? 'Time entry corrected.' : 'Time entry saved.');
  };

  await save(maya, 89);
  await maya.getByRole('link', { name: 'Correct ' + date + ' · 89 minutes' }).click();
  assert.equal(await dropdown(maya).inputValue(), 'E-101');
  await save(maya, 90, true);
  await save(maya, 30);
  await refresh(sam);
  await save(sam, 60);
  const samEntry = await sam.getByRole('link', { name: 'Correct ' + date + ' · 60 minutes' }).getAttribute('href');

  const forge = async (page, account, fields) => {
    const coordinate = page.locator('#timesheet-session');
    const result = await page.request.post(url() + '/timesheet', {
      headers: { Origin: url(), Authorization: account.authorization },
      form: { _csrf: await coordinate.getAttribute('data-csrf'), base: await coordinate.getAttribute('data-revision'), date, minutes: '25', ...fields }
    });
    assert.equal(result.status(), 200);
    return result.text();
  };

  await refresh(maya);
  assert.match(await forge(maya, mayaAccount, { action: 'add-time', employee: 'E-102' }), /only save time for your assigned employee/);
  assert.match(await forge(maya, mayaAccount, { action: 'add-time', employee: 'E-101', minutes: '1.5' }), /Enter positive whole minutes/);
  assert.match(await forge(maya, mayaAccount, { action: 'add-time', employee: 'E-101', date: '2026-02-29' }), /Enter a valid work date/);
  await maya.goto(url() + samEntry);
  assert.match(await maya.getByRole('alert').innerText(), /entry is unavailable to your account/);
  assert.equal(await maya.getByRole('button', { name: 'Save correction' }).count(), 0);
  assert.equal(await maya.getByRole('link', { name: /60 minutes/ }).count(), 0);
  const samId = new URL(samEntry, url()).searchParams.get('entry');
  assert.match(await forge(maya, mayaAccount, { action: 'edit-time', employee: 'E-101', entry: samId }), /entry is unavailable to your account/);
  await refresh(manager);
  assert.match(await forge(manager, managerAccount, { action: 'add-time', employee: 'E-101' }), /account cannot save employee time/);
  assert.match(await forge(manager, managerAccount, { action: 'edit-time', employee: 'E-102', entry: samId }), /account cannot save employee time/);
  await refresh(unlinked);
  assert.match(await forge(unlinked, unlinkedAccount, { action: 'add-time', employee: 'E-101' }), /account cannot save employee time/);

  await restart();
  for (const [page, name] of employees) {
    await refresh(page);
    assert.deepEqual(await dropdown(page).locator('option').allTextContents(), [name], await page.locator('main').innerText());
    assert.equal(await page.locator('#timesheet-session').getAttribute('data-revision'), '15');
  }
  assert.deepEqual(await entries(maya).getByRole('link').allTextContents(), [
    'Correct ' + date + ' · 90 minutes', 'Correct ' + date + ' · 30 minutes'
  ]);
  assert.deepEqual(await entries(sam).getByRole('link').allTextContents(), ['Correct ' + date + ' · 60 minutes']);
  assert.match(await entries(riley).innerText(), /no time entries/);
  await maya.goto(url() + samEntry);
  assert.match(await maya.getByRole('alert').innerText(), /entry is unavailable to your account/);
  await refresh(manager);
  assert.equal(await manager.getByRole('region', { name: 'Your entries' }).count(), 0);
  assert.match(await forge(manager, managerAccount, { action: 'add-time', employee: 'E-101' }), /account cannot save employee time/);
  console.log('PASS North River timesheet: employee dropdowns, add and correction, cross-account and manager refusals, cold reopen at revision 15');
  const report = await verifyReport({ manager, employee: maya, url, restart, date });
  await refresh(maya);
  const mayaEntries = await entries(maya).getByRole('link').allTextContents();
  const samEntries = await entries(sam).getByRole('link').allTextContents();
  return [
    { id: 'entry', observed: 'Separate employee sessions reopened after restart. Maya: ' + mayaEntries.join('; ') +
      '. Sam: ' + samEntries.join('; ') + '. Riley: no entries. Cross-account read, add and edit, and manager and unlinked writes were refused.' },
    { id: 'report', observed: report }
  ];
}

async function verifyReport({ manager, employee, url, restart, date }) {
  const all = [['Maya Chen', 2, 120], ['Sam Okafor', 1, 60], ['Riley Singh', 0, 0]];
  const table = manager.getByRole('table', { name: 'Employee totals' });
  const chart = name => manager.getByRole('region', { name });
  const checkChart = async (name, rows) => {
    const region = chart(name);
    const expectedLabels = rows.map(([label, minutes]) => label + ' · ' + minutes + ' minutes');
    const bars = await region.locator('li').evaluateAll(items => items.map(item => {
      const track = item.querySelector('svg rect');
      const bar = item.querySelector('rect[data-plot="minutes"]');
      return {
        label: item.querySelector('p').innerText,
        plotted: bar.getBBox().width / track.getBBox().width,
        rendered: bar.getBoundingClientRect().width / track.getBoundingClientRect().width
      };
    }));
    assert.deepEqual(bars.map(bar => bar.label), expectedLabels);
    const scale = Math.max(1, ...rows.map(([, minutes]) => minutes));
    for (const [index, bar] of bars.entries()) {
      const expected = rows[index][1] / scale;
      assert.ok(Math.abs(bar.plotted - expected) < 0.00001, name + ' SVG value for ' + bar.label);
      assert.ok(Math.abs(bar.rendered - expected) < 0.001, name + ' rendered width for ' + bar.label);
    }
    if (!rows.length) assert.match(await region.innerText(), /No entries in this selection/);
  };
  const checkReport = async (rows, dates) => {
    const count = rows.reduce((sum, [, entries]) => sum + entries, 0);
    const minutes = rows.reduce((sum, [, , value]) => sum + value, 0);
    assert.equal(await manager.getByRole('heading', { name: minutes + ' minutes across ' + count + ' entries' }).count(), 1);
    const observed = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.innerText)));
    assert.deepEqual(observed, [...rows, ['Total', count, minutes]].map(row => row.map(String)));
    await checkChart('Minutes by employee', rows.map(([label, , value]) => [label, value]));
    await checkChart('Minutes by date', dates);
    assert.equal(await manager.getByText('Signed in as demo-manager', { exact: true }).count(), 1);
    return observed;
  };
  const choose = async (employeeId, from, through) => {
    await manager.getByLabel('Employee', { exact: true }).selectOption(employeeId);
    await manager.getByLabel('From', { exact: true }).fill(from);
    await manager.getByLabel('Through', { exact: true }).fill(through);
    await manager.getByRole('button', { name: 'Apply filters' }).click();
  };

  await manager.getByRole('link', { name: 'Open timesheet report' }).click();
  assert.equal(await manager.getByLabel('Employee', { exact: true }).inputValue(), '');
  assert.equal(await manager.getByLabel('From', { exact: true }).inputValue(), '');
  assert.equal(await manager.getByLabel('Through', { exact: true }).inputValue(), '');
  await checkReport(all, [[date, 180]]);
  await choose('', '', date);
  await checkReport(all, [[date, 180]]);
  await choose('', date, '');
  await checkReport(all, [[date, 180]]);
  await choose('E-101', date, date);
  await checkReport([all[0]], [[date, 120]]);
  await choose('E-103', date, date);
  await checkReport([all[2]], []);
  await choose('', '2026-11-10', '2026-11-10');
  await checkReport(all.map(([name]) => [name, 0, 0]), []);
  await choose('', '2026-11-10', date);
  assert.match(await manager.getByRole('alert').innerText(), /From must be on or before Through/);
  assert.equal(await table.count(), 0);
  assert.equal(await chart('Minutes by employee').count(), 0);
  await choose('', date, date);
  await checkReport(all, [[date, 180]]);
  const reportUrl = new URL(manager.url());
  const assertEmployeeRefusal = async () => {
    await employee.goto(url() + reportUrl.pathname + reportUrl.search);
    assert.match(await employee.getByRole('alert').innerText(), /available only to managers/);
    assert.equal(await employee.getByRole('table').count(), 0);
    assert.equal(await employee.getByRole('region', { name: 'Minutes by employee' }).count(), 0);
    assert.doesNotMatch(await employee.locator('main').innerText(), /Sam Okafor|Riley Singh|180 minutes/);
  };
  await assertEmployeeRefusal();

  await restart();
  await manager.goto(url() + reportUrl.pathname + reportUrl.search);
  assert.equal(await manager.getByLabel('From', { exact: true }).inputValue(), date);
  assert.equal(await manager.getByLabel('Through', { exact: true }).inputValue(), date);
  assert.match(await manager.locator('main').innerText(), /Data revision\s+15\b/);
  const observed = await checkReport(all, [[date, 180]]);
  await manager.getByText('Calculation and evidence', { exact: true }).click();
  const mayaBreakdown = manager.locator('details').filter({ has: manager.locator('summary').getByText('Maya Chen · 120 minutes', { exact: true }) }).last();
  await mayaBreakdown.locator('summary').click();
  assert.deepEqual(await mayaBreakdown.locator('li').allTextContents(), [date + ' · 90 minutes', date + ' · 30 minutes']);
  const traceLink = await manager.getByRole('link', { name: 'Review the report trace (owner account)' }).getAttribute('href');
  assert.equal(traceLink, '/approval?trace=report');
  await assertEmployeeRefusal();
  console.log('PASS North River report: manager filters, table and rendered chart agreement, employee refusal and cold reopen at revision 15');
  return 'After restart the manager observed ' + observed.slice(0, 3).map(([name, count, minutes]) => name + ' ' + minutes +
    ' minutes (' + count + ' entries)').join('; ') + '. The daily chart showed 180 minutes. Maya matched 90 + 30 minutes. ' +
    'Table cells, SVG values and rendered widths agreed. Employee report access was refused.';
}

async function verifyApproval({ browser, page, manager, proposer, verifier, directory, url, plan, observations, restart }) {
  const artifact = fs.readFileSync(path.join(directory, 'application-image.rel'));
  const image = decode(artifact.toString('utf8'), 'EncounterApplicationImage');
  const imageHash = sha256(artifact);
  const endpoint = '/review-evidence';
  const discover = actor => fetch(url() + endpoint, { headers: { Authorization: actor.authorization } });
  const read = async response => decode(await response.text(), 'NorthRiverVerificationContext');

  await page.getByRole('link', { name: 'Review North River demo image' }).click();
  const approve = page.getByRole('button', { name: 'Approve this North River demo image' });
  assert.equal(await approve.count(), 0);
  assert.match(await page.locator('main').innerText(), /Browser evidence is missing/);
  assert.equal((await read(await discover(proposer))).status, 'refused');
  const response = await discover(verifier);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const context = await read(response);
  assert.equal(context.status, 'ok', context.notice);
  assert.equal(context.revision, 15);
  assert.equal(context.coordinates.plan, plan);
  assert.equal(context.coordinates.image.sha256, imageHash);
  assert.equal(context.coordinates.image.runtimeSha256, sha256(fs.readFileSync(process.env.ENCOUNTER_RUST_HOST)));
  assert.equal(context.coordinates.image.programmeSha256, image.programmeSha256);
  assert.equal(context.coordinates.image.files.length, Object.keys(image.files).length);

  const submit = async (action, evidence) => read(await fetch(url() + endpoint, {
    method: 'POST',
    headers: { Authorization: verifier.authorization, Cookie: cookie, Origin: url(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: context.csrf, base: context.revision, action, evidence: encode(evidence, 'NorthRiverBrowserEvidence') })
  }));
  const evidence = { context: context.coordinates, revision: context.revision, suite: 'north-river/browser/1', cases: observations.map(item => ({ ...item, passed: true })) };
  assert.match((await submit('approve-demo', evidence)).notice, /cannot approve the image/);
  const missing = await submit('record-evidence', { ...evidence, cases: evidence.cases.slice(0, 3) });
  assert.match(missing.notice, /Every reviewed behavior needs a browser result/);
  const failed = { ...evidence, cases: evidence.cases.map(item => item.id === 'entry' ? { ...item, passed: false } : item) };
  assert.match((await submit('record-evidence', failed)).notice, /required browser check did not pass/);
  const wrong = { ...evidence, context: { ...evidence.context, image: { ...evidence.context.image, sha256: '0'.repeat(64) } } };
  assert.match((await submit('record-evidence', wrong)).notice, /exact running image/);
  const accepted = await submit('record-evidence', evidence);
  assert.equal(accepted.status, 'ok', accepted.notice);
  assert.equal(accepted.revision, 16);

  await page.reload();
  assert.equal(await page.getByText(objective, { exact: true }).count(), 1);
  assert.ok((await page.locator('main').innerText()).includes(imageHash));
  const compiled = 'nr.reportCalculate';
  await page.getByRole('link', { name: 'Manager table and charts' }).click();
  const behavior = page.getByRole('region', { name: 'Behavior trace' });
  assert.match(await behavior.innerText(), /The table and chart use one calculation/);
  assert.match(await behavior.innerText(), /Maya Chen 120 minutes.*Sam Okafor 60 minutes.*Riley Singh 0 minutes/);
  assert.equal(await behavior.getByRole('link', { name: /Open the running report/ }).getAttribute('href'), '/report');
  await behavior.getByRole('link', { name: 'north-river/report.encounter', exact: true }).first().click();
  const source = page.getByRole('region', { name: 'Selected source' });
  assert.equal(await source.locator('pre').textContent(), image.files['north-river/report.encounter'].text);
  await behavior.getByRole('link', { name: compiled, exact: true }).click();
  const lowering = page.getByRole('region', { name: 'Selected lowering' });
  await lowering.getByText('Exact compiled instructions in REL', { exact: true }).click();
  assert.deepEqual(decode(await lowering.locator('pre').textContent(), 'EncounterCompiledProcessInspection'), image.programme[compiled]);

  await approve.click();
  const receipt = page.getByRole('region', { name: 'Demo approval receipt' });
  const committed = await receipt.innerText();
  assert.match(committed, /Approved by north-river-owner.*Decision revision 17/);
  assert.ok(committed.includes(imageHash) && committed.includes(accepted.release.evidence.sha256));
  await restart();
  await page.goto(url() + '/approval?trace=report&process=' + compiled);
  assert.equal(await receipt.innerText(), committed);
  assert.deepEqual(decode(await lowering.locator('pre').textContent(), 'EncounterCompiledProcessInspection'), image.programme[compiled]);
  assert.match(await behavior.innerText(), /Maya matched 90 \+ 30 minutes/);
  const reportPath = await behavior.getByRole('link', { name: /Open the running report/ }).getAttribute('href');
  const managerContext = await browser.newContext({ httpCredentials: { username: manager.id, password: manager.password } });
  try {
    const live = await managerContext.newPage();
    await live.goto(url() + reportPath);
    assert.equal(await live.getByRole('heading', { name: '180 minutes across 3 entries' }).count(), 1);
  } finally {
    await managerContext.close();
  }
  const reopened = await read(await discover(verifier));
  assert.equal(reopened.revision, 17);
  assert.equal(reopened.release.receipt.image, imageHash);
  assert.equal(reopened.release.receipt.evidence, accepted.release.evidence.sha256);
  const { sha256: decisionHash, ...decision } = reopened.release.receipt;
  assert.equal(sha256(encode(decision, 'NorthRiverDemoDecision')), decisionHash);
  console.log('PASS North River final gate: source and AOT lowering trace, image-bound browser evidence, human receipt and cold reopen at revision 17');
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'north-river-'));
  const operatorFile = path.join(directory, 'operators.rel');
  const roles = [
    { id: 'north-river-owner', role: 'author' },
    { id: 'north-river-agent', role: 'proposer' },
    { id: 'other-agent', role: 'proposer' },
    { id: 'demo-maya', role: 'employee' },
    { id: 'demo-sam', role: 'employee' },
    { id: 'demo-riley', role: 'employee' },
    { id: 'demo-manager', role: 'manager' },
    { id: 'demo-unlinked', role: 'employee' },
    { id: 'north-river-browser-verifier', role: 'verifier' }
  ].map(actor => {
    const password = randomBytes(32).toString('hex');
    const token = Buffer.from(actor.id + ':' + password).toString('base64');
    return { ...actor, password, authorization: 'Basic ' + token, pin: sha256(token) };
  });
  fs.writeFileSync(operatorFile, [
    '("operators", "version", "encounter/operators/1")',
    ...roles.flatMap(actor => [
      '("' + actor.id + '", "role", "' + actor.role + '")',
      '("' + actor.id + '", "basicSha256", "' + actor.pin + '")'
    ]), ''
  ].join('\n'), { mode: 0o600 });
  const [owner, proposer, other] = roles;
  const packageRoot = preparePackage(path.join(directory, 'source-package'));
  const open = () => start(packageRoot, { directory, declaration, operatorFile });
  let server;
  let browser;
  try {
    server = await open();
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ httpCredentials: { username: owner.id, password: owner.password } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(server.url);
    await page.getByLabel('Project name').fill('North River Science Labs');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByLabel('What do you want to do?').fill(objective);
    await page.getByRole('button', { name: 'Create task' }).click();
    assert.equal(await page.getByRole('heading', { name: 'North River Science Labs' }).count(), 1);
    assert.match(await page.locator('main').innerText(), /Waiting for the assigned proposer/);

    const readAgent = (actor, cookie = '') => fetch(server.url + '/agent', {
      headers: { Authorization: actor.authorization, Cookie: cookie }
    });
    const decodeAgent = async response => decode(await response.text(), 'NorthRiverAgentContext');
    assert.equal((await decodeAgent(await readAgent(other))).status, 'refused');
    const discovery = await readAgent(proposer);
    assert.match(discovery.headers.get('content-type'), /^text\/plain/);
    const cookie = discovery.headers.get('set-cookie').split(';')[0];
    const initial = await decodeAgent(discovery);
    verifyWorkflow('assigned', { task: initial.task, objective, grants: initial.grants });
    assert.equal(initial.reference.sha256, sha256(fs.readFileSync(path.join(root, initial.reference.path))));
    const fixture = decode(fs.readFileSync(path.join(__dirname, 'proposal.rel'), 'utf8'), 'NorthRiverPlanFixture');
    const plan = { ...fixture, evidence: initial.reference.sha256 };
    const submit = async (state, values, route = '/agent') => decodeAgent(await fetch(server.url + route, {
      method: 'POST',
      headers: { Authorization: proposer.authorization, Cookie: cookie, Origin: server.url, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: state.csrf, base: state.revision, basis: state.basis, ...values })
    }));
    const propose = (state, candidate) => submit(state, { action: 'propose', plan: encode(candidate, 'NorthRiverPlan') });
    const badEvidence = await propose(initial, { ...plan, evidence: 'wrong' });
    assert.match(badEvidence.notice, /^EVIDENCE:/);
    const first = await propose(initial, plan);
    assert.equal(first.status, 'ok', first.notice);
    assert.equal(first.task.phase, 'question');
    assert.equal((await submit(first, { action: 'approve', candidate: first.task.candidate.hash }, '/')).status, 'refused');
    await page.getByRole('link', { name: 'Refresh task' }).click();
    assert.equal(await page.getByRole('button', { name: 'Approve this plan' }).count(), 0);
    const current = page.getByRole('region', { name: 'Current plan' });
    assert.equal(await current.getByRole('listitem').count(), 12);
    await current.getByText('Define the model', { exact: true }).click();
    assert.match(await current.innerText(), /DemoAccountLink/);
    assert.equal(await page.getByText(plan.question.text, { exact: true }).count(), 1);
    await page.getByLabel('Your answer').fill(answer);
    await page.getByRole('button', { name: 'Save answer' }).click();
    assert.match(await page.getByRole('status').innerText(), /Answer saved/);
    assert.equal(await page.getByRole('button', { name: 'Approve this plan' }).count(), 0);
    assert.match((await propose(first, plan)).notice, /^STALE:/);

    const answered = await decodeAgent(await readAgent(proposer, cookie));
    assert.equal(answered.task.answer.text, answer);
    assert.equal(answered.task.answer.actor, owner.id);
    assert.match((await propose(answered, plan)).notice, /^PLAN:/);
    const revisedPlan = {
      ...plan,
      assumptions: plan.assumptions.map(item => item.id === 'access' ? { ...item, text: answer, origin: 'human-answer' } : item),
      steps: plan.steps.map(step => step.id === 'sessions' ? { ...step, check: step.check + ' A manager attempt to edit employee time is refused.' } : step)
    };
    const revised = await propose(answered, revisedPlan);
    assert.equal(revised.status, 'ok', revised.notice);
    assert.equal(revised.task.phase, 'review');
    assert.equal((await submit(revised, { action: 'approve', candidate: revised.task.candidate.hash })).status, 'refused');
    await page.getByRole('link', { name: 'Refresh task' }).click();
    assert.match(await current.innerText(), new RegExp(answer.replace('.', '\\.')));
    assert.equal(await page.getByText('Previous candidate', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Approve this plan' }).click();
    const receipt = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Approval receipt', exact: true }) });
    const receiptText = await receipt.innerText();
    assert.match(receiptText, /Approved by north-river-owner · Task revision 6 · Answer revision 4/);
    assert.ok(receiptText.includes(revised.task.candidate.hash));
    assert.ok(receiptText.includes(initial.reference.sha256));
    assert.match(receiptText, /Decision SHA-256: [0-9a-f]{64}/);
    assert.match(receiptText, /Committed task SHA-256: [0-9a-f]{64}/);
    assert.equal(await page.getByRole('button', { name: 'Approve this plan' }).count(), 0);

    assert.equal((await server.close()).code, 0);
    server = await open();
    await page.goto(server.url);
    assert.equal(await receipt.innerText(), receiptText);
    const reopened = await decodeAgent(await readAgent(proposer));
    verifyWorkflow('approval', { task: reopened.task, revision: reopened.revision,
      plan: revised.task.candidate.hash, owner: owner.id });
    const { sha256: decisionHash, ...decision } = reopened.task.approval;
    assert.ok(receiptText.includes(decisionHash));
    assert.equal(sha256(encode(decision, 'NorthRiverPlanDecision')), decisionHash);
    const { candidate, objective: recordedObjective, project, answer: recordedAnswer } = reopened.task;
    const review = { agent: candidate.actor, answer: recordedAnswer, base: candidate.base,
      basis: candidate.basis, objective: recordedObjective, plan: candidate.plan, project };
    assert.equal(sha256(encode(review, 'NorthRiverPlanReview')), candidate.hash);
    console.log('PASS North River: scoped proposal, human answer, revised plan, approval receipt and cold reopen at revision 6');

    const upload = async (name, text) => {
      await page.getByLabel('Employee CSV', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
      await page.getByRole('button', { name: 'Attach employee CSV' }).click();
      assert.match(await page.getByRole('status').innerText(), /CSV attached/);
    };
    const csv = 'employee_id,display_name,account_ref\r\nE-101,Maya Chen,demo-maya\r\nE-102,Sam Okafor,demo-sam\r\nE-103,Riley Singh,demo-riley\r\n';
    const duplicate = csv.replace('E-103,Riley Singh,demo-riley', 'E-102,Riley Singh,demo-sam');
    const discoverImport = async () => {
      const response = await readAgent(proposer);
      const session = response.headers.get('set-cookie').split(';')[0];
      return { session, state: await decodeAgent(response) };
    };
    const submitImport = async ({ session, state }, fields) => decodeAgent(await fetch(server.url + '/agent', {
      method: 'POST',
      headers: { Authorization: proposer.authorization, Cookie: session, Origin: server.url, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: state.csrf, base: state.revision, basis: state.basis, ...fields })
    }));
    const mapping = state => ({ action: 'preview-import', file: state.attachment.sha256, employee: 'employee_id', name: 'display_name', account: 'account_ref' });

    await upload('duplicate.csv', duplicate);
    assert.equal((await decodeAgent(await readAgent(other))).status, 'refused');
    const blockedAgent = await discoverImport();
    assert.equal(blockedAgent.state.attachment.text, duplicate);
    assert.equal(blockedAgent.state.attachment.sha256, sha256(duplicate));
    assert.deepEqual(blockedAgent.state.grants, ['read-assigned-task', 'read-import-attachment', 'propose-import-mapping']);
    const blocked = await submitImport(blockedAgent, mapping(blockedAgent.state));
    assert.equal(blocked.status, 'ok', blocked.notice);
    assert.equal(blocked.attachment, null);
    await page.getByRole('link', { name: 'Refresh task' }).click();
    const importPanel = page.getByRole('region', { name: 'Employee CSV import' });
    assert.match(await importPanel.innerText(), /Batch blocked\. 0 records will be written/);
    for (const line of [3, 4]) {
      const row = importPanel.locator('#csv-line-' + line);
      assert.match(await row.innerText(), /Blocked/);
      assert.match(await row.innerText(), /Duplicate employee ID/);
      assert.match(await row.innerText(), /Duplicate demo account reference/);
    }
    assert.equal(await importPanel.getByRole('button', { name: /^Approve import/ }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Import receipt' }).count(), 0);
    const blockedPreview = /Preview: ([a-f0-9]{64})/.exec(await importPanel.innerText())[1];
    const uploadForm = page.getByRole('button', { name: 'Attach employee CSV' }).locator('xpath=ancestor::form');
    const uploadCoordinates = await uploadForm.locator('input[type=hidden]').evaluateAll(inputs => Object.fromEntries(inputs.map(input => [input.name, input.value])));
    const forced = await page.request.post(server.url, {
      headers: { Origin: server.url },
      form: { ...uploadCoordinates, action: 'approve-import', preview: blockedPreview }
    });
    assert.match(await forced.text(), /The batch is blocked or the destination has changed/);
    assert.equal((await discoverImport()).state.revision, 8);

    await upload('employees.csv', csv);
    const validAgent = await discoverImport();
    assert.equal(validAgent.state.attachment.text, csv);
    assert.equal((await submitImport(blockedAgent, mapping(blockedAgent.state))).status, 'refused');
    const previewed = await submitImport(validAgent, mapping(validAgent.state));
    assert.equal(previewed.status, 'ok', previewed.notice);
    assert.equal(previewed.revision, 10);
    assert.equal(previewed.attachment, null);
    assert.equal((await submitImport({ ...validAgent, state: previewed }, { action: 'approve-import' })).status, 'refused');

    await page.getByRole('link', { name: 'Refresh task' }).click();
    for (const [line, employee, name, reference] of [[2,'E-101','Maya Chen','demo-maya'], [3,'E-102','Sam Okafor','demo-sam'], [4,'E-103','Riley Singh','demo-riley']]) {
      const row = await importPanel.locator('#csv-line-' + line).innerText();
      assert.ok(row.includes('Ready') && row.includes(employee) && row.includes(name) && row.includes(reference));
    }
    const approvalButton = importPanel.getByRole('button', { name: 'Approve import of 3 employees and 3 demo links' });
    const form = approvalButton.locator('xpath=ancestor::form');
    const fields = await form.locator('input[type=hidden]').evaluateAll(inputs => Object.fromEntries(inputs.map(input => [input.name, input.value])));
    await approvalButton.click();
    const importReceipt = page.getByRole('region', { name: 'Import receipt' });
    const committed = await importReceipt.innerText();
    assert.match(committed, /Imported 3 employees and 3 demo account links/);
    assert.match(committed, /Approved by north-river-owner/);
    assert.match(committed, /Revision 10 → 11 · Validation: passed/);
    assert.ok(committed.includes(sha256(csv)) && committed.includes(revised.task.candidate.hash));
    assert.match(committed, /Committed change SHA-256: [0-9a-f]{64}/);
    const replay = await page.request.post(server.url, { headers: { Origin: server.url }, form: fields });
    assert.match(await replay.text(), /This import was already committed/);
    assert.equal((await discoverImport()).state.revision, 11);

    assert.equal((await server.close()).code, 0);
    server = await open();
    await page.goto(server.url);
    assert.equal(await importReceipt.innerText(), committed);
    const employees = await importReceipt.getByRole('list', { name: 'Imported employee records' }).getByRole('listitem').allTextContents();
    const links = await importReceipt.getByRole('list', { name: 'Imported demo account links' }).getByRole('listitem').allTextContents();
    assert.deepEqual(employees, ['E-101 · Maya Chen · CSV line 2', 'E-102 · Sam Okafor · CSV line 3', 'E-103 · Riley Singh · CSV line 4']);
    assert.deepEqual(links, ['demo-maya → E-101 · Demo reference only', 'demo-sam → E-102 · Demo reference only', 'demo-riley → E-103 · Demo reference only']);
    const finished = await discoverImport();
    assert.equal(finished.state.revision, 11);
    assert.equal(finished.state.attachment, null);
    assert.equal(finished.state.task.import, null);
    console.log('PASS North River CSV: blocked duplicate batch, approved six records, exact retry and cold reopen at revision 11');

    const observations = await verifyTimesheet({
      browser, accounts: roles.slice(3, 8), url: () => server.url,
      restart: async () => {
        assert.equal((await server.close()).code, 0);
        server = await open();
      }
    });
    await page.goto(server.url);
    assert.equal(await importReceipt.innerText(), committed);
    assert.equal(await receipt.innerText(), receiptText);
    assert.doesNotMatch(await page.getByRole('heading', { name: 'Task activity' }).locator('..').innerText(), /Time entry/);
    await verifyApproval({
      browser, page, manager: roles[6], proposer, verifier: roles[8], directory, url: () => server.url,
      plan: revised.task.candidate.hash, observations: [
        { id: 'plan', observed: 'The human answered the manager-access question, approved the revised plan, and reopened the same receipt at revision 6. A proposer approval attempt was refused.' },
        { id: 'import', observed: 'Duplicate employee and demo reference blocked both rows and the batch. The corrected import reopened with ' + employees.length + ' employee records and ' + links.length + ' demo links at revision 11.' },
        ...observations
      ],
      restart: async () => {
        assert.equal((await server.close()).code, 0);
        server = await open();
      }
    });
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (server?.diagnostics().trim()) console.error(server.diagnostics().trim());
    if (page) console.error((await page.locator('body').innerText().catch(() => '')).slice(-6500));
    throw error;
  } finally {
    await browser?.close();
    await server?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
