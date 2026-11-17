'use strict';

const solutionPath = /^envs\/([0-9a-f]{7})\/Solutions\/[^/]+\.lean$/;
const catalogueModule = /^(Theorems|Definitions)\.([^/\\]+)$/u;
const moduleName = /^(?:[\p{L}\p{N}_'!?.]+|«[^»\r\n]+»)+$/u;

function leanImports(source, truncated = false) {
  const imports = new Set();
  const read = /\s+|--[^\r\n]*|\/-|(?:«[^»\r\n]*»|(?!--|\/-)[^\s«»])+|./guy;
  let importing = false;
  for (let index = 0; index < source.length;) {
    if (source.startsWith('/-', index)) {
      let depth = 1;
      index += 2;
      while (depth && index < source.length) {
        if (source.startsWith('/-', index)) { depth++; index += 2; }
        else if (source.startsWith('-/', index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) throw Error('Unclosed comment in Lean import header');
      continue;
    }
    read.lastIndex = index;
    const token = read.exec(source)[0];
    index = read.lastIndex;
    if (/^\s/.test(token) || token.startsWith('--')) continue;
    if (token === 'module' || token === 'prelude') continue;
    if (!importing && (token === 'public' || token === 'meta')) continue;
    if (token === 'import') {
      if (importing) throw Error('Lean import has no module name');
      importing = true;
      continue;
    }
    if (importing && token === 'all') continue;
    if (importing) {
      if (!moduleName.test(token)) throw Error('Unexpected Lean import module: ' + token);
      imports.add(token);
      importing = false;
      continue;
    }
    return [...imports];
  }
  if (truncated || importing) throw Error('Incomplete Lean import header');
  return [...imports];
}

function initializeProofPaths(db) {
  db.exec(`
    CREATE TABLE proof_sources(path TEXT PRIMARY KEY, sha256 TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE proof_imports(path TEXT NOT NULL, ordinal INTEGER NOT NULL, module TEXT NOT NULL,
      target_path TEXT, PRIMARY KEY(path, ordinal)) WITHOUT ROWID;
    CREATE TABLE module_records(path TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE) WITHOUT ROWID;
  `);
}

function proofPathWriter(db) {
  const clear = db.prepare('DELETE FROM proof_imports WHERE path=?');
  const drop = db.prepare('DELETE FROM proof_sources WHERE path=?');
  const save = db.prepare('INSERT INTO proof_sources VALUES (?,?) ON CONFLICT(path) DO UPDATE SET sha256=excluded.sha256');
  const insert = db.prepare('INSERT INTO proof_imports VALUES (?,?,?,?)');
  return {
    remove(path) { clear.run(path); drop.run(path); },
    write(path, sha256, source, truncated = false) {
      const environment = solutionPath.exec(path)?.[1];
      if (!environment) throw Error('Invalid solution path: ' + path);
      let modules;
      try { modules = leanImports(source, truncated); }
      catch (error) { throw Error(path + ': ' + error.message); }
      clear.run(path);
      save.run(path, sha256);
      for (const [ordinal, module] of modules.entries()) {
        const target = catalogueModule.exec(module);
        const targetPath = target ? 'envs/' + environment + '/' + target[1] + '/' + target[2] + '.lean' : null;
        insert.run(path, ordinal, module, targetPath);
      }
    },
  };
}

function validateProofPaths(db, expected) {
  const count = db.prepare('SELECT count(*) AS n FROM proof_sources').get().n;
  const sourceMismatch = db.prepare(`
    SELECT f.path FROM files f LEFT JOIN proof_sources p ON p.path=f.path
    WHERE f.body_sha256 IS NOT NULL AND (p.path IS NULL OR p.sha256<>f.sha256) LIMIT 1
  `).get();
  const missingRecord = db.prepare(`
    SELECT e.id FROM entries e LEFT JOIN module_records m ON m.id=e.id
    LEFT JOIN files f ON f.path=m.path
    WHERE f.path IS NULL OR f.body_sha256 IS NOT NULL LIMIT 1
  `).get();
  const records = db.prepare('SELECT count(*) AS n FROM module_records').get().n;
  const entries = db.prepare('SELECT count(*) AS n FROM entries').get().n;
  if (count !== expected || sourceMismatch || missingRecord || records !== entries) {
    throw Error('Proof-path coverage differs from snapshot: ' + JSON.stringify({ count, expected, sourceMismatch, missingRecord, records, entries }));
  }
  return db.prepare(`
    SELECT count(*) AS imports, count(CASE WHEN e.status='Open' THEN 1 END) AS openImports,
      count(CASE WHEN p.target_path IS NOT NULL AND e.id IS NULL THEN 1 END) AS unresolvedImports
    FROM proof_imports p LEFT JOIN module_records m ON m.path=p.target_path LEFT JOIN entries e ON e.id=m.id
  `).get();
}

module.exports = { initializeProofPaths, leanImports, proofPathWriter, validateProofPaths };
