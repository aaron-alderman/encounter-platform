'use strict';

// Mechanical, read-only transport for a declared index of inert REL records.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { inflateSync } = require('node:zlib');
const { decode } = require('./rel-values.cjs');

const fields = 'entries.id, name, title, toolchain, status, environment';
const recordLimit = 8_000_000;

function openIndexedData(root, descriptor) {
  const { indexSource, indexSha256 } = descriptor;
  if (typeof indexSource !== 'string' || !/^[A-Za-z0-9._/-]+\.sqlite$/.test(indexSource) ||
      indexSource.split('/').some(part => !part || part === '.' || part === '..') ||
      typeof indexSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(indexSha256)) {
    throw Error('Invalid declared indexed data source');
  }
  const file = path.join(root, indexSource);
  if (fs.realpathSync(file) !== file || fs.existsSync(file + '-wal') || fs.existsSync(file + '-journal')) {
    throw Error('Indexed data must be a contained standalone snapshot');
  }
  const handle = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let db;
  try {
    const stat = fs.fstatSync(handle);
    if (!stat.isFile()) throw Error('Indexed data must be a regular file');
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let count;
    while ((count = fs.readSync(handle, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, count));
    if (digest.digest('hex') !== indexSha256) throw Error('Indexed data hash differs from its pin');
    db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
    const current = fs.statSync(file);
    if (current.ino !== stat.ino || current.dev !== stat.dev || current.mtimeMs !== stat.mtimeMs || current.size !== stat.size) {
      throw Error('Indexed data changed while opening');
    }
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON; PRAGMA cache_size=-32768');
    const byId = db.prepare('SELECT payload FROM documents WHERE id=?');
    const proofSource = descriptor.proofPaths && db.prepare('SELECT sha256 FROM proof_sources WHERE path=?');
    const proofImports = descriptor.proofPaths && db.prepare(`
      SELECT p.module, e.id AS target, e.status,
        CASE WHEN p.target_path IS NOT NULL AND e.id IS NULL THEN 1 ELSE 0 END AS unresolved
      FROM proof_imports p LEFT JOIN module_records m ON m.path=p.target_path
      LEFT JOIN entries e ON e.id=m.id WHERE p.path=? ORDER BY p.ordinal
    `);
    const research = descriptor.researchQueue && db.prepare(`
      SELECT e.id,e.name,e.title,e.toolchain,count(*) AS paths
      FROM research_routes r JOIN entries e ON e.id=r.lemma
      GROUP BY r.lemma ORDER BY paths DESC,e.name,e.environment,e.id LIMIT ? OFFSET ?
    `);
    const researchChanges = descriptor.researchQueue && db.prepare(`
      SELECT lemma AS id,name,toolchain,status,previous,current,gained,lost
      FROM research_changes ORDER BY gained+lost DESC,name,toolchain,lemma LIMIT ? OFFSET ?
    `);
    const byBrowse = db.prepare('SELECT ' + fields + ' FROM entries ORDER BY rowid LIMIT ? OFFSET ?');
    const byMatch = db.prepare('SELECT ' + fields +
      ' FROM search JOIN entries ON entries.rowid=search.rowid WHERE search MATCH ? ORDER BY search.rowid LIMIT ? OFFSET ?');
    const matchCount = db.prepare('SELECT count(*) AS total FROM search WHERE search MATCH ?');
    const condition = "instr(lower(name||char(10)||title||char(10)||toolchain||char(10)||status||char(10)||environment),?) > 0";
    const byShort = db.prepare('SELECT ' + fields + ' FROM entries WHERE ' + condition + ' ORDER BY rowid LIMIT ? OFFSET ?');
    const shortCount = db.prepare('SELECT count(*) AS total FROM entries WHERE ' + condition);
    const all = db.prepare('SELECT count(*) AS total FROM entries').get().total;
    return {
      close: () => db.close(),
      read({ key, query, offset, limit, view }) {
        if (key !== undefined) {
          if (typeof key !== 'string' || key.length > 128) return null;
          const document = byId.get(key);
          if (!document) return null;
          const text = new TextDecoder('utf-8', { fatal: true }).decode(
            inflateSync(document.payload, { maxOutputLength: recordLimit }));
          const row = decode(text, 'ApplicationData');
          if (!proofSource) return row;
          const solutionImports = Object.create(null);
          for (const proof of row.solutions) {
            if (proofSource.get(proof.path)?.sha256 !== proof.exportSha256) {
              throw Error('Proof import index differs from solution: ' + proof.path);
            }
            solutionImports[proof.id] = proofImports.all(proof.path);
          }
          return { ...row, solutionImports };
        }
        if (view !== undefined) {
          if (!research || !['research', 'research-changes'].includes(view) ||
              !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid indexed research request');
          const changes = view === 'research-changes';
          const total = changes ? descriptor.researchQueue.changedLemmas : descriptor.researchQueue.lemmas;
          const requested = typeof offset === 'string' && /^[0-9]{1,9}$/.test(offset) ? Number(offset) : 0;
          const start = Math.min(requested, Math.max(0, Math.floor((total - 1) / limit) * limit));
          return { total, offset: start, rows: (changes ? researchChanges : research).all(limit, start) };
        }
        if (typeof query !== 'string' || query.length > 180 || query.includes('\0') ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid indexed data query');
        const start = typeof offset === 'string' && /^[0-9]{1,9}$/.test(offset) ? Number(offset) : 0;
        if (!query) return { total: all, offset: Math.min(start, all), rows: byBrowse.all(limit, start) };
        const [page, size, match] = [...query].length >= 3
          ? [byMatch, matchCount, '"' + query.replaceAll('"', '""') + '"']
          : [byShort, shortCount, query.toLowerCase()];
        const { total } = size.get(match);
        return { total, offset: Math.min(start, total), rows: page.all(match, limit, start) };
      },
    };
  } catch (error) {
    db?.close();
    throw error;
  } finally {
    fs.closeSync(handle);
  }
}

module.exports = { openIndexedData };
