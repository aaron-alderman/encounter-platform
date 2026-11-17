'use strict';

const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT);
const { decode, encode } = require('../bootstrap/rel-values.cjs');
const { start } = require('../../encounter-runtime/test/host.cjs');

const root = path.resolve(__dirname, '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const password = () => randomBytes(32).toString('hex');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-author-'));
  const operatorFile = path.join(directory, 'operators.rel');
  const author = password();
  const proposer = password();
  const token = (id, secret) => Buffer.from(id + ':' + secret).toString('base64');
  const agentAuth = 'Basic ' + token('agent', proposer);
  fs.writeFileSync(operatorFile, [
    '("operators", "version", "encounter/operators/1")',
    '("operator", "role", "author")',
    '("operator", "basicSha256", "' + sha256(token('operator', author)) + '")',
    '("agent", "role", "proposer")',
    '("agent", "basicSha256", "' + sha256(token('agent', proposer)) + '")',
    ''
  ].join('\n'), { mode: 0o600 });
  const open = () => start(root, { directory, declaration: 'bootstrap/application.rel', operatorFile });
  let server;
  let browser;
  try {
    server = await open();
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ httpCredentials: { username: 'operator', password: author } });
    const page = await context.newPage();
    const revision = async expected => assert.match(await page.locator('.revision').innerText(), new RegExp('^Accepted revision ' + expected + ' ·'));
    const accept = async () => {
      await page.getByRole('button', { name: 'Accept this change', exact: true }).click();
      assert.match(await page.getByRole('status').innerText(), /^Saved revision /);
    };
    await page.goto(server.url);
    const intent = page.locator('form').filter({ has: page.getByRole('heading', { name: 'What would you like to make?' }) });
    await intent.getByLabel('I want to… because…').fill('A checked label formatter');
    await intent.getByLabel('Why this change?').fill('Retain the original purpose');
    await intent.getByLabel('What should it help achieve?').fill('An inspectable action');
    await intent.getByRole('button', { name: 'Review one change' }).click();
    await accept();
    await revision(1);

    const discovery = await fetch(server.url + '/authoring', { headers: { Authorization: agentAuth } });
    assert.equal(discovery.status, 200);
    assert.match(discovery.headers.get('content-type'), /^text\/plain/);
    const cookie = discovery.headers.get('set-cookie').split(';')[0];
    const contract = decode(await discovery.text(), 'EncounterAuthoringContract');
    assert.equal(contract.base, 1);
    assert.equal(contract.operation, 'check-action');
    assert.deepEqual(contract.actionGrants, []);
    const submit = (fields, route = contract.route) => fetch(server.url + route, {
      method: 'POST',
      headers: { Authorization: agentAuth, Cookie: cookie, Origin: server.url, 'Content-Type': contract.encoding },
      body: new URLSearchParams({ _csrf: contract.csrf, ...fields })
    });
    const source = 'process-module "temple/surface-process-module/1"\nprocess run:\n  let result = concat("Label: ", $eventInput)\n';
    const fields = {
      base: contract.base, basis: contract.basis, sourceSetSha256: contract.sourceSetSha256,
      reason: 'Keep label formatting inspectable',
      target: 'actions/label.encounter', goal: 'Add a pure formatter', id: 'label',
      label: 'Format label', input: 'Text', output: 'Text', code: source
    };
    const check = async changes => decode(await (await submit({ ...fields, ...changes })).text(), 'EncounterAuthoringCheck');
    const wrongType = await check({ output: 'Number' });
    assert.equal(wrongType.status, 'refused');
    assert.match(wrongType.diagnostic, /inferred result/);
    const port = await check({ code: 'process-module "temple/surface-process-module/1"\nprocess run:\n  port storage.snapshot {} → result\n' });
    assert.equal(port.status, 'refused');
    const wrongBasis = await check({ basis: 'wrong-basis' });
    assert.match(wrongBasis.diagnostic, /^BASIS:/);
    const wrongSourceSet = await check({ sourceSetSha256: 'wrong-source-set' });
    assert.match(wrongSourceSet.diagnostic, /^SOURCE:/);
    const proposal = await check({});
    assert.equal(proposal.status, 'reviewable');
    assert.equal(proposal.actionSha256, sha256(source));
    const candidate = decode(proposal.candidate, 'EncounterActionCandidate');
    assert.equal(candidate.code, source);
    const denied = decode(await (await submit({ command: 'accept', review: 'forged' }, '/')).text(), 'EncounterAuthoringRefusal');
    assert.equal(denied.status, 'refused');
    assert.equal((await check({ command: 'accept' })).status, 'refused');
    await page.goto(server.url + contract.review);
    await revision(1);
    const importCandidate = async text => {
      await page.getByLabel('Action candidate REL').fill(text);
      await page.getByRole('button', { name: 'Review proposal' }).click();
    };
    await importCandidate(encode({ ...candidate, output: 'Number' }, 'EncounterActionCandidate'));
    assert.match(await page.getByRole('status').innerText(), /inferred result/);
    await importCandidate(proposal.candidate);
    assert.equal(await page.getByRole('heading', { name: 'Review one change', exact: true }).count(), 1);
    await revision(1);
    await accept();
    await revision(2);
    await importCandidate(proposal.candidate);
    assert.match(await page.getByRole('status').innerText(), /^STALE:/);
    assert.equal((await check({})).status, 'refused');

    assert.equal((await server.close()).code, 0);
    server = await open();
    await page.goto(server.url + '/?view=history');
    await revision(2);
    assert.match(await page.locator('main').innerText(), /Keep label formatting inspectable/);
    await page.goto(server.url + '/?view=actions');
    const edit = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Edit action — Format label', includeHidden: true }) });
    assert.equal(await edit.getByLabel('Encounter source').inputValue(), source);
    console.log('ok - discovery, source/type/effect refusals, proposer authority, exact browser review, stale refusal and cold history');
  } finally {
    await browser?.close();
    await server?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
