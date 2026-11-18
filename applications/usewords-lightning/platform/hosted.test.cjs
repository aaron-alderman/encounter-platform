'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const cookie = '__Host-encounter_' + createHash('sha256').update('/identity-management').digest('hex');
const pilot = path.resolve(__dirname, '../../ai-collaboration-pilot/server.mjs');
const adapter = path.join(__dirname, 'hosted.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('two authenticated participants share and review one durable Usewords matter', async () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'usewords-hosted-'));
  const identities = createServer((req, res) => {
    const id = req.headers.cookie?.split('=')[1];
    if (!['one', 'two', 'other'].includes(id)) return res.writeHead(401).end();
    res.end(JSON.stringify({ email: id + '@example.invalid', id, remainingSeconds: 180 }));
  });
  await new Promise(resolve => identities.listen(0, '127.0.0.1', resolve));
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const configPath = path.join(directory, 'config.json');
  const database = path.join(directory, 'usewords.db');
  let model;
  if (process.env.USEWORDS_TEST_MODEL) {
    const catalogue = await (await fetch('http://127.0.0.1:11434/api/tags')).json();
    model = catalogue.models.find(item => item.name === process.env.USEWORDS_TEST_MODEL);
    assert.ok(model, 'The requested Ollama model must be installed');
  }
  fs.writeFileSync(configPath, JSON.stringify({
    port, origin, identityPort: identities.address().port, identityAuthorization: 'Basic fixture',
    members: { 'one@example.invalid': 'One', 'two@example.invalid': 'Two' },
    database: path.join(directory, 'pilot.db'),
    usewords: { adapter, database, model: model && { model: model.name, digest: model.digest } },
  }));
  let server;
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  function request(id, fields, bodyOrigin = origin) {
    const headers = id ? { cookie: cookie + '=' + id } : {};
    if (fields) Object.assign(headers, { origin: bodyOrigin, 'content-type': 'application/x-www-form-urlencoded' });
    return fetch(origin + '/usewords/', { method: fields ? 'POST' : 'GET', headers, body: fields && new URLSearchParams(fields), redirect: 'manual' });
  }
  async function start() {
    server = spawn(process.execPath, [pilot, configPath], { stdio: ['ignore', 'ignore', 'inherit'] });
    for (let index = 0; index < 50; index++) {
      const value = await request().catch(() => null);
      if (value?.status === 303) return;
      await wait(100);
    }
    throw new Error('Usewords listener did not start');
  }
  async function page(id) {
    const response = await request(id);
    assert.equal(response.status, 200, 'Member can open Usewords');
    return response.text();
  }
  const hidden = (html, name) => html.match(new RegExp('name="' + name + '" value="([^"]+)"'))?.[1];
  const form = html => ({ head: hidden(html, 'head'), operation: hidden(html, 'operation') });

  try {
    await start();
    const signedOut = await request();
    assert.equal(signedOut.status, 303);
    const signIn = new URL(signedOut.headers.get('location'), origin);
    assert.equal(signIn.pathname, '/identity-management/');
    assert.equal(signIn.searchParams.get('workspace-return'), '/encounter-pilot/open-usewords');
    const refused = await request('other');
    assert.equal(refused.status, 404);
    assert.equal(await refused.text(), 'Not found');
    assert.equal((await request(undefined, { action: 'propose' })).status, 404);
    for (const identity of ['one', 'two', 'other']) {
      const returned = await fetch(origin + signIn.searchParams.get('workspace-return'), {
        headers: { cookie: cookie + '=' + identity }, redirect: 'manual',
      });
      assert.equal(returned.status, identity === 'other' ? 404 : 303);
      if (identity !== 'other') assert.equal(returned.headers.get('location'), '/usewords/');
    }
    const one = await page('one');
    const old = await page('two');
    assert.match(one, /Propose a contribution/);
    assert.match(one, /href="\/usewords\/style.css"/);
    assert.doesNotMatch(one, /<style|<script/);
    const stylesheet = await fetch(origin + '/usewords/style.css', { headers: { cookie: cookie + '=one' } });
    assert.equal(stylesheet.status, 200);
    assert.match(await stylesheet.text(), /grid-template-columns/);
    assert.equal((await fetch(origin + '/usewords/style.css')).status, 404);
    const discovery = await fetch(origin + '/_appdev-private-usewords', { headers: { cookie: cookie + '=one' } });
    assert.equal(discovery.headers.get('x-usewords-visible'), 'yes');
    const hiddenDiscovery = await fetch(origin + '/_appdev-private-usewords', { headers: { cookie: cookie + '=other' } });
    assert.equal(hiddenDiscovery.headers.get('x-usewords-visible'), null);
    const former = await fetch(origin + '/ai-collaboration/', { headers: { cookie: cookie + '=one' }, redirect: 'manual' });
    assert.equal(former.status, 303);
    assert.equal(former.headers.get('location'), '/usewords/');
    const proposal = { ...form(one), action: 'propose', kind: 'issue', title: 'What should AI summarize?', body: 'We need enough context to make a decision.' };
    assert.equal((await request('one', proposal, 'https://wrong.invalid')).status, 403);
    const proposed = await request('one', proposal);
    assert.equal(proposed.status, 303, (await proposed.text()).match(/role="status">([^<]+)</)?.[1]);
    assert.equal((await request('one', proposal)).status, 303, 'Identical retry reuses its outcome');
    assert.equal((await request('two', { ...proposal, ...form(old) })).status, 409, 'A stale form cannot overwrite another participant');
    const two = await page('two');
    assert.match(two, /What should AI summarize/);
    const review = { ...form(two), action: 'approve', proposal: hidden(two, 'proposal'), contentHash: hidden(two, 'contentHash'), comment: 'This is the question I want to work on.' };
    assert.equal((await request('one', review)).status, 422, 'A proposal author cannot review their own proposal');
    assert.equal((await request('two', review)).status, 303);
    const accepted = await page('one');
    assert.equal((await request('one', { ...form(accepted), action: 'accept', proposal: review.proposal, contentHash: review.contentHash })).status, 303);
    const shared = await page('two');
    assert.match(shared, /open question/);
    if (model) {
      const generated = await request('two', { ...form(shared), action: 'ai' });
      assert.equal(generated.status, 303, 'Installed local model returned checked suggestions');
      const suggestions = await page('two');
      assert.match(suggestions, /Propose this suggestion/);
      assert.doesNotMatch(await page('one'), /Propose this suggestion/, 'Model drafts stay with the requesting participant');
      const first = hidden(suggestions, 'suggestion');
      assert.equal((await request('two', { ...form(suggestions), action: 'propose-ai', suggestion: first })).status, 303);
    }
    await stop();
    const db = new DatabaseSync(database, { readOnly: true });
    assert.equal(JSON.parse(db.prepare('SELECT receipt FROM matter').get().receipt).body.events.length, model ? 4 : 3);
    db.close();
    await start();
    assert.match(await page('two'), /open question/, 'The accepted matter survives reopening the deployed process');
  } finally {
    await stop();
    identities.closeAllConnections();
    await new Promise(resolve => identities.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
