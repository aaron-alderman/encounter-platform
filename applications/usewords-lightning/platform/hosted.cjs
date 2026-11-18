'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { loadHostedRuntime } = require('./hosted-runtime.cjs');
const { generateMatterSuggestions } = require('../bootstrap/matter-model.cjs');

const path = '/usewords/';
const matterId = 'working_with_ai';
const actions = new Set(['propose', 'propose-ai', 'approve', 'request-changes', 'accept', 'ai']);

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function createHostedMatter(config, members) {
  const actors = Object.entries(members).map(([principal, name], index) => ({
    principal, name, actor: index === 0 ? 'alice' : 'bob',
  }));
  if (actors.length !== 2) throw new Error('Usewords requires two configured participants');
  const trustedMembers = actors.map(({ principal, actor }) => ({ principal, actor }));
  const names = Object.fromEntries(actors.map(({ actor, name }) => [actor, name]));
  const { run, programHash, receiverHash } = await loadHostedRuntime();
  const db = new DatabaseSync(config.database);
  db.exec(`
    CREATE TABLE IF NOT EXISTS matter (id INTEGER PRIMARY KEY CHECK(id=1), receipt TEXT NOT NULL, head TEXT NOT NULL, binding TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operation (principal TEXT NOT NULL, id TEXT NOT NULL, request TEXT NOT NULL, PRIMARY KEY(principal,id));
    CREATE TABLE IF NOT EXISTS draft (principal TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pilot_context (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
  `);
  const binding = hash({ trustedMembers, programHash, receiverHash });
  const get = db.prepare('SELECT receipt, head, binding FROM matter WHERE id=1');
  if (!get.get()) {
    const initial = await run('hosted.initial', {
      id: matterId, title: 'Working together with AI',
      description: 'Choose a real piece of work. Bring what you want to achieve, what you can contribute, and what context the other person needs. Work through an open question together and record where you agree or still differ.',
    });
    db.prepare('INSERT OR IGNORE INTO matter VALUES (1, ?, ?, ?)').run(JSON.stringify(initial), initial.sha256, binding);
  }
  if (get.get().binding !== binding) throw new Error('Hosted matter needs its saved policy and participant binding');
  await run('cw.reconstruct', JSON.parse(get.get().receipt));

  const prior = db.prepare('SELECT request FROM operation WHERE principal=? AND id=?');
  const remember = db.prepare('INSERT INTO operation VALUES (?, ?, ?)');
  const save = db.prepare('UPDATE matter SET receipt=?,head=? WHERE id=1 AND head=?');
  const getDraft = db.prepare('SELECT value FROM draft WHERE principal=?');
  const saveDraft = db.prepare('INSERT INTO draft VALUES (?,?) ON CONFLICT(principal) DO UPDATE SET value=excluded.value');
  const context = db.prepare('SELECT value FROM pilot_context WHERE id=1').get();
  const styles = await run('hosted.styles', {});

  function current() {
    const row = get.get();
    return { matterId, head: row.head, value: JSON.parse(row.receipt) };
  }
  function receive(member, slot, action, operationId, payload) {
    return run('pr.prepare', {
      request: { action, matterId, operationId, expectedHead: slot.head, payload },
      trusted: {
        applicationId: 'app.usewords', programHash, authenticated: true, csrfVerified: true,
        principal: member.principal, matterId, members: trustedMembers, sharedSlot: slot, priorOperation: null,
      },
    });
  }
  async function render(member, send, notice = '', status = 200) {
    const slot = current();
    const authorized = await receive(member, slot, 'read-shared', 'read_matter', {});
    const board = await run('cw.reconstruct', authorized.value);
    const saved = getDraft.get(member.principal);
    const draft = saved && JSON.parse(saved.value);
    const markup = await run('hosted.page', {
      board, draft: draft?.brief.request.sourceHash === board.head.documentHash ? draft : null,
      head: slot.head, operation: 'op_' + randomBytes(10).toString('hex'), names, actor: member.actor, name: member.name, notice,
      context: context ? JSON.parse(context.value) : null,
    });
    send(status, markup, 'text/html; charset=utf-8');
  }

  return async ({ request, response, signedIn, recheck, readForm, send }) => {
    const member = actors.find(actor => actor.principal === signedIn.email);
    if (!member) return send(404, 'Not found');
    if (request.method === 'GET' && request.url === '/usewords/style.css') return send(200, styles, 'text/css; charset=utf-8');
    if (request.method === 'GET') return render(member, send);
    if (request.method !== 'POST' || request.headers.origin !== config.origin) return send(403, 'Request refused');
    if (request.headers['content-type'] !== 'application/x-www-form-urlencoded') return send(415, 'Expected form data');
    const form = Object.fromEntries(await readForm(request));
    if (!actions.has(form.action) || !/^op_[a-f0-9]{20}$/.test(form.operation ?? '')) return send(400, 'Check the form and try again');
    const requestHash = hash(form);
    const redirect = () => response.writeHead(303, { Location: path, 'Cache-Control': 'private, no-store' }).end();
    const existing = prior.get(member.principal, form.operation);
    if (existing) return existing.request === requestHash ? redirect() : render(member, send, 'This form was already used. Try again with the fresh form below.', 409);
    const slot = current();
    if (form.head !== slot.head) return render(member, send, 'The shared matter changed. Review the latest revision and try again.', 409);
    const authorized = await receive(member, slot, 'read-shared', 'read_matter', {});
    const board = await run('cw.reconstruct', authorized.value);
    let draft;
    let receipt;
    try {
      if (form.action === 'ai') {
        const brief = await run('mw.brief', board.head);
        const output = await generateMatterSuggestions('fast', { fast: config.model }, brief);
        draft = { brief, response: output.response, run: output.run };
        await run('mw.checkSuggestions', draft);
        await run('mw.checkModelRun', { package: draft, run: draft.run });
      } else {
        const saved = getDraft.get(member.principal);
        const command = await run('hosted.command', { form, board, actor: member.actor, operation: form.operation, draft: saved ? JSON.parse(saved.value) : null });
        receipt = (await receive(member, slot, 'shared-command', form.operation, command)).value;
      }
    } catch (error) {
      const policyMessage = /^(?:CW-|MW-|MM-|PR-|PC-|WS-|Hosted matter changed)/.test(error.message) ? error.message : '';
      return render(member, send, policyMessage || 'That operation could not be completed. Review the current matter and try again.', 422);
    }
    if ((await recheck())?.email !== member.principal) return send(404, 'Not found');
    db.exec('BEGIN IMMEDIATE');
    try {
      const concurrent = prior.get(member.principal, form.operation);
      if (concurrent || get.get().head !== slot.head) {
        db.exec('ROLLBACK');
        if (concurrent?.request === requestHash) return redirect();
        return render(member, send, 'The shared matter changed. Review the latest revision and try again.', 409);
      }
      if (receipt && save.run(JSON.stringify(receipt), receipt.sha256, slot.head).changes !== 1) throw new Error('Matter head changed');
      if (draft) saveDraft.run(member.principal, JSON.stringify(draft));
      remember.run(member.principal, form.operation, requestHash);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return redirect();
  };
}

module.exports = { createHostedMatter };
