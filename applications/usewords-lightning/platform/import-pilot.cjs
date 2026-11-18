'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { loadHostedRuntime } = require('./hosted-runtime.cjs');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function importPilot(config) {
  const previous = require(join(dirname(config.usewords.adapter), 'hosted-runtime.cjs'));
  const old = await previous.loadHostedRuntime();
  const next = await loadHostedRuntime();
  if (old.programHash !== next.programHash) throw new Error('Usewords source identity changed during the presentation cutover');
  const trustedMembers = Object.keys(config.members).map((principal, index) => ({ principal, actor: index === 0 ? 'alice' : 'bob' }));
  const binding = runtime => hash({ trustedMembers, programHash: runtime.programHash, receiverHash: runtime.receiverHash });
  const legacy = new DatabaseSync(config.database, { readOnly: true });
  const db = new DatabaseSync(config.usewords.database);
  try {
    const entries = legacy.prepare('SELECT id, author, kind, body, created FROM entries ORDER BY id').all();
    const context = { brief: await next.run('hosted.startingBrief', {}), entries };
    const get = db.prepare('SELECT receipt, head, binding FROM matter WHERE id=1');
    const current = get.get();
    if (!current || current.binding !== binding(old)) throw new Error('The saved matter differs from the previous deployment binding');
    const board = await next.run('cw.reconstruct', JSON.parse(current.receipt));
    const description = await next.run('hosted.importDescription', context);
    const incorporated = board.revision === 0 && description.length <= 6000;
    let receipt = JSON.parse(current.receipt);
    if (incorporated) {
      const matter = board.head.document.matter;
      receipt = await next.run('hosted.initial', { id: matter.id, title: matter.title, description });
      const replayed = await next.run('cw.reconstruct', receipt);
      if (replayed.head.document.matter.description !== description) throw new Error('Imported narrative failed exact replay');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TABLE IF NOT EXISTS pilot_context (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
      db.prepare('INSERT INTO pilot_context VALUES (1,?)').run(JSON.stringify(context));
      const saved = db.prepare('UPDATE matter SET receipt=?,head=?,binding=? WHERE id=1 AND head=? AND binding=?')
        .run(JSON.stringify(receipt), receipt.sha256, binding(next), current.head, current.binding);
      if (saved.changes !== 1) throw new Error('Shared matter changed during the import');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { entries: entries.length, incorporated, preservedEvents: board.revision };
  } finally {
    legacy.close();
    db.close();
  }
}

if (require.main === module) {
  importPilot(JSON.parse(readFileSync(process.argv[2], 'utf8'))).then(result => {
    console.log(JSON.stringify(result));
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { importPilot };
