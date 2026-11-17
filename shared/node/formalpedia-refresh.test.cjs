'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { deflateSync, inflateSync } = require('node:zlib');
const { decode, encode, parse } = require('./rel-values.cjs');
const { render } = require('./loader-declarations.cjs');
const { refresh, blobHash } = require('./formalpedia-refresh.cjs');
const { updateResearchQueue } = require('./formalpedia-research-queue.cjs');
const { initializeProofPaths, proofPathWriter, leanImports } = require('./formalpedia-proof-paths.cjs');

const env = '0df444a';
const product = 'products/claimipedia';
const dataDir = product + '/formalpedia';
const sources = 'formalpedia-sources';
const toolchain = 'leanprover/lean4:v4.33.1';
const hex = n => n.toString(16).padStart(12, '0');
const uuid = n => '00000000-0000-4000-8000-' + hex(n);
const coordinate = n => env + '-' + uuid(n);
const hash = b => createHash('sha256').update(b).digest('hex');
const applicationData = value => encode(value, 'ApplicationData');
const readData = file => decode(fs.readFileSync(file, 'utf8'), 'ApplicationData');
const modulePath = (type, module) => 'envs/' + env + '/' + type + '/' + module + '.lean';
const fileBody = text => Buffer.from('-- Export header\n\n' + text);

function proof(n, module, exported, original = exported) {
  return { id: uuid(n), n: 1, path: modulePath('Solutions', module), sha256: hash(original),
    status: 'ACCEPTED', proof_type: 'prove', author: 'fixture' };
}

function entry(n, name, module, solution) {
  return { env, id: uuid(n), theorem_name: name, title: name, status: solution ? 'Proved' : 'Open',
    url: 'https://prove2.me/theorems/' + uuid(n), author: 'fixture', source: '', created_at: '2026-11-10',
    lean_lines: 1, module: 'Theorems.' + module, statement_path: modulePath('Theorems', module),
    solutions: solution ? [solution] : [] };
}

function snapshot(rows, edges, bodies, date, overrides = {}) {
  const files = new Map();
  for (const row of rows) {
    files.set(row.statement_path, Buffer.from('theorem ' + row.theorem_name + ' : True := by sorry\n'));
    for (const proof of row.solutions) files.set(proof.path, fileBody(bodies.get(proof.id)));
  }
  const environment = { dir: env, toolchain, mathlib_rev: '0df444a' + '0'.repeat(33),
    theorems: rows.length, definitions: 0, solutions: bodies.size, edges: edges.length, ...overrides };
  const manifest = { generated_at: date, license: 'Apache-2.0', environments: [environment] };
  files.set('MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
  for (const [kind, values] of [['index', rows], ['graph', edges]]) {
    files.set('envs/' + env + '/' + kind + '-000.jsonl', Buffer.from(values.map(x => JSON.stringify(x)).join('\n') + '\n'));
  }
  return { manifest, files, rows, edges, bodies };
}

function write(root, name, bytes) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

async function seed(root, base, commit) {
  const archivePath = sources + '/' + commit + '.tar.gz';
  fs.mkdirSync(path.join(root, sources));
  const archiveInput = path.join(root, 'archive-input');
  for (const [name, bytes] of base.files) write(archiveInput, 'formalpedia-' + commit + '/' + name, bytes);
  execFileSync('tar', ['-czf', path.join(root, archivePath), '-C', archiveInput, 'formalpedia-' + commit]);
  fs.rmSync(archiveInput, { recursive: true });
  const indexSource = dataDir + '/base.sqlite';
  fs.mkdirSync(path.join(root, dataDir), { recursive: true });
  const db = new DatabaseSync(path.join(root, indexSource));
  db.exec(`
    CREATE TABLE files(path TEXT PRIMARY KEY, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, body_sha256 TEXT) WITHOUT ROWID;
    CREATE TABLE entries(id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL, toolchain TEXT NOT NULL,
      status TEXT NOT NULL, environment TEXT NOT NULL, ordinal INTEGER NOT NULL, UNIQUE(environment,name));
    CREATE TABLE documents(id TEXT PRIMARY KEY, payload BLOB NOT NULL) WITHOUT ROWID;
    CREATE VIRTUAL TABLE search USING fts5(text,content='',tokenize='trigram');
  `);
  initializeProofPaths(db);
  const proofPaths = proofPathWriter(db);
  const registerModule = db.prepare('INSERT INTO module_records VALUES (?,?)');
  const ids = new Map(base.rows.map(row => [row.theorem_name, env + '-' + row.id]));
  const insertFile = db.prepare('INSERT INTO files VALUES (?,?,?,?)');
  const insertEntry = db.prepare('INSERT INTO entries VALUES (?,?,?,?,?,?,?)');
  const insertDoc = db.prepare('INSERT INTO documents VALUES (?,?)');
  for (const [name, bytes] of base.files) {
    if (name.endsWith('.lean')) insertFile.run(name, bytes.length, hash(bytes),
      name.includes('/Solutions/') ? hash(bytes.subarray(bytes.indexOf('\n\n') + 2)) : null);
  }
  for (const [ordinal, row] of base.rows.entries()) {
    const id = ids.get(row.theorem_name);
    registerModule.run(row.statement_path, id);
    for (const proof of row.solutions) {
      const bytes = base.files.get(proof.path);
      proofPaths.write(proof.path, hash(bytes), bytes.toString());
    }
    insertEntry.run(id, row.theorem_name, row.title, toolchain, row.status, env, ordinal);
    insertDoc.run(id, deflateSync(applicationData({
      id, upstreamId: row.id, name: row.theorem_name, title: row.title, leanLines: row.lean_lines,
      environment: env, toolchain, mathlib: base.manifest.environments[0].mathlib_rev, module: row.module,
      status: row.status, author: row.author, source: row.source, url: row.url, createdAt: row.created_at,
      statementPath: row.statement_path, statementSha256: hash(base.files.get(row.statement_path)),
      solutions: row.solutions.map(item => ({ ...item, exportSha256: hash(base.files.get(item.path)) })), definitions: [],
      dependencies: base.edges.filter(e => e.parent === row.theorem_name)
        .map(e => ({ child: e.child, via: e.via, target: ids.get(e.child) })),
    })));
  }
  db.exec("INSERT INTO search(rowid,text) SELECT rowid,name||char(10)||title||char(10)||toolchain||char(10)||status||char(10)||environment FROM entries");
  const researchQueue = { ...updateResearchQueue(db, true).summary, previousCommit: null };
  db.close();

  const full = applicationData({ commit, generatedAt: base.manifest.generated_at,
    archiveSource: archivePath, archiveSha256: hash(fs.readFileSync(path.join(root, archivePath))),
    indexSource, indexSha256: hash(fs.readFileSync(path.join(root, indexSource))), largestRecordBytes: 0,
    environments: base.manifest.environments, proofPaths: {}, researchQueue });
  const audit = applicationData({ commit, proofs: {} });
  const fullFile = dataDir + '/full.rel';
  const auditFile = dataDir + '/import-renames.rel';
  write(root, fullFile, full);
  write(root, auditFile, audit);
  const declaration = `process-module "temple/surface-process-module/1"
process loader.declaration:
  let result = {
    sections = list(
      {
        subject = "data.formalpedia-full";
        source = "${fullFile}";
        format = "typed-rel";
        sha256 = "${hash(full)}"
      },
      {
        subject = "data.formalpedia-import-renames";
        source = "${auditFile}";
        format = "typed-rel";
        sha256 = "${hash(audit)}"
      }
    )
  }
`;
  write(root, product + '/application.loader.encounter', declaration);
  write(root, product + '/application.rel', await render('application.loader.encounter', declaration));
  return indexSource;
}

test('refresh updates changed files, records, graph, search and checksum receipts', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formalpedia-refresh-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = '1'.repeat(40), target = '2'.repeat(40), broken = '3'.repeat(40), later = '4'.repeat(40), proved = '5'.repeat(40);
  const body = 'import Theorems.Thm_Dep\ntheorem solution : True := by trivial\n';
  const renamed = body.replace('Thm_Dep', 'Thm_Dep__a1b2c3');
  const unknown = 'theorem solution : True := by exact True.intro\n';
  const original = entry(1, 'Main', 'Thm_Main', proof(11, 'Sol_Main', body));
  const nextMain = { ...original, title: 'Updated Main', source: 'Line\u2028separator\u2029test' };
  const oldDep = entry(2, 'Dep', 'Thm_Dep');
  const newDep = entry(5, 'Dep', 'Thm_Dep__a1b2c3');
  const stable = entry(3, 'Stable', 'Thm_Stable');
  const graph = entry(4, 'Graph', 'Thm_Graph');
  const flagged = entry(6, 'Flagged', 'Thm_Flagged', proof(16, 'Sol_Flagged', unknown, 'unrelated bytes'));
  const edge = (parent, child) => ({ parent, child, via: ['solution'] });
  const baseline = snapshot([original, oldDep, stable, graph], [edge('Main','Dep'), edge('Graph','Main')],
    new Map([[uuid(11), body]]), '2026-11-10');
  const next = snapshot([nextMain, newDep, stable, graph, flagged], [edge('Main','Dep'), edge('Graph','Stable')],
    new Map([[uuid(11), renamed], [uuid(16), unknown]]), '2026-11-11');
  const corrupt = snapshot(next.rows, next.edges, next.bodies, '2026-11-12', { theorems: 99 });
  const metadataOnly = snapshot(next.rows, next.edges, next.bodies, '2026-11-12');
  const closed = { ...newDep, status: 'Proved' };
  const statusOnly = snapshot([nextMain, closed, stable, graph, flagged], next.edges, next.bodies, '2026-11-13');
  const snapshots = new Map([[base, baseline], [target, next], [broken, corrupt], [later, metadataOnly], [proved, statusOnly]]);
  const indexSource = await seed(root, baseline, base);
  const originalDb = fs.readFileSync(path.join(root, indexSource));
  const calls = [];
  const options = commit => ({
    targetCommit: commit,
    readTrees: id => new Map([...snapshots.get(id).files].map(([name, bytes]) => [name, blobHash(bytes)])),
    getBlob: async (id, name) => { calls.push(name); return snapshots.get(id).files.get(name); },
  });

  assert.equal((await refresh(root, options(base))).status, 'current');
  assert.deepEqual(calls, []);
  const result = await refresh(root, options(target));
  assert.deepEqual({ added: result.recordsAdded, updated: result.recordsUpdated, removed: result.recordsRemoved,
    verified: result.verifiedAfterImportRenaming, unresolved: result.unresolvedChecksums },
  { added: 2, updated: 2, removed: 1, verified: 1, unresolved: 1 });
  assert.ok(calls.includes(modulePath('Solutions', 'Sol_Main')));
  assert.ok(!calls.includes(stable.statement_path));
  assert.ok(!calls.includes(oldDep.statement_path));
  assert.deepEqual(fs.readFileSync(path.join(root, indexSource)), originalDb);

  const load = name => {
    const text = fs.readFileSync(path.join(root, product + '/application.rel'), 'utf8');
    const facts = parse(text).filter(f => f.s === 'data.' + name);
    const file = path.join(root, facts.find(f => f.p === 'source').o);
    assert.equal(hash(fs.readFileSync(file)), facts.find(f => f.p === 'sha256').o);
    return readData(file);
  };
  const full = load('formalpedia-full');
  const audit = load('formalpedia-import-renames');
  assert.equal(full.commit, target);
  assert.equal(full.sourceDeltas.length, 1);
  assert.deepEqual(full.unresolvedProofs, [uuid(16)]);
  assert.equal(audit.proofs[uuid(11)].renamedImports, 1);
  assert.equal(audit.proofs[uuid(11)].publishedSha256, hash(body));
  assert.equal(audit.proofs[uuid(11)].exportedBodySha256, hash(renamed));
  assert.equal(audit.proofs[uuid(16)], undefined);

  const db = new DatabaseSync(path.join(root, full.indexSource), { readOnly: true });
  const old = new DatabaseSync(path.join(root, indexSource), { readOnly: true });
  try {
    const payload = (source, n) => source.prepare('SELECT payload FROM documents WHERE id=?').get(coordinate(n))?.payload;
    const detail = n => decode(inflateSync(payload(db, n)).toString(), 'ApplicationData');
    assert.deepEqual(payload(db, 3), payload(old, 3));
    assert.equal(payload(db, 2), undefined);
    assert.equal(detail(1).dependencies[0].target, coordinate(5));
    assert.equal(detail(1).source, nextMain.source);
    assert.equal(detail(4).dependencies[0].target, coordinate(3));
    assert.equal(detail(6).solutions[0].checksumStatus, 'mismatch');
    assert.equal(db.prepare("SELECT count(*) AS n FROM search WHERE search MATCH 'Updated'").get().n, 1);
  } finally { db.close(); old.close(); }

  const archive = path.join(root, full.sourceDeltas[0].path);
  const file = 'formalpedia-' + target + '/' + modulePath('Solutions','Sol_Main');
  assert.deepEqual(execFileSync('tar', ['-xOzf', archive, file]), fileBody(renamed));
  assert.equal(result.deltaArchive, full.sourceDeltas[0].path);
  assert.deepEqual({ ...full.proofPaths }, { imports: 1, openImports: 1, unresolvedImports: 0 });
  const changes = execFileSync('tar', ['-xOzf', archive, result.recordChangesEntry], { encoding: 'utf8' })
    .trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(changes.map(({ change, id }) => [change, id]), [
    ['removed', coordinate(2)], ['updated', coordinate(1)], ['updated', coordinate(4)],
    ['added', coordinate(5)], ['added', coordinate(6)],
  ]);
  assert.equal(result.unresolvedProofs[0].proofId, uuid(16));
  assert.equal(result.unresolvedProofs[0].exportedBodySha256, hash(unknown));
  assert.equal(result.unresolvedProofs[0].publishedSha256, flagged.solutions[0].sha256);
  const committed = fs.readFileSync(path.join(root, product + '/application.rel'));
  await assert.rejects(refresh(root, options(broken)), /Manifest theorems count differs/);
  assert.deepEqual(fs.readFileSync(path.join(root, product + '/application.rel')), committed);
  const unchanged = await refresh(root, options(target));
  assert.equal(unchanged.status, 'current');
  assert.equal(unchanged.recordsUpdated, 0);
  assert.deepEqual(unchanged.unresolvedProofs, result.unresolvedProofs);

  fs.rmSync(path.join(root, sources, '.refresh-cache', 'metadata'), { recursive: true });
  calls.length = 0;
  const final = await refresh(root, options(later));
  assert.deepEqual(calls, ['MANIFEST.json']);
  assert.equal(final.recordsUpdated, 0);
  assert.equal(final.verifiedAfterImportRenaming, 1);
  assert.equal(final.unresolvedChecksums, 1);
  assert.notEqual(load('formalpedia-full').indexSource, full.indexSource); // The previous change view was cleared.
  assert.equal(load('formalpedia-full').sourceDeltas.length, 2);
  assert.deepEqual(load('formalpedia-import-renames').proofs[uuid(11)], audit.proofs[uuid(11)]);
  calls.length = 0;
  const changedStatus = await refresh(root, options(proved));
  assert.ok(!calls.includes(modulePath('Solutions', 'Sol_Main')));
  assert.equal(changedStatus.proofPaths.openImports, 0);
  assert.equal(changedStatus.proofPaths.imports, 1);
  assert.deepEqual(changedStatus.researchQueue, {
    lemmas: 0, paths: 0, changedLemmas: 1, gainedPaths: 0, lostPaths: 1, previousCommit: later,
  });
  assert.equal(result.researchQueue.changedLemmas, 2);
  assert.equal(result.researchQueue.gainedPaths, 1);
  assert.equal(result.researchQueue.lostPaths, 1);
  assert.equal(final.researchQueue.changedLemmas, 0);

});

test('Lean import headers preserve exact aliases, quoted names and order', () => {
  assert.deepEqual(leanImports([
    '/- commented import Fake /- nested -/ -/', 'module', 'prelude', 'public meta import',
    '  all Mathlib -- trailing comment', 'import Theorems.Thm_X__a1b2c3/- inline -/',
    'import Definitions.«quoted name»', 'import Mathlib', 'theorem solution : True := by trivial',
    '-- import Ignored',
  ].join('\n')), ['Mathlib', 'Theorems.Thm_X__a1b2c3', 'Definitions.«quoted name»']);
  assert.throws(() => leanImports('import'), /Incomplete/);
  assert.throws(() => leanImports('import Mathlib', true), /Incomplete/);
});

test('research changes track route swaps and exclude unresolved and multi-open imports', () => {
  const { captureResearchQueue } = require('./formalpedia-research-queue.cjs');
  const db = new DatabaseSync(':memory:');
  try {
    initializeProofPaths(db);
    db.exec(`
      CREATE TABLE entries(id TEXT PRIMARY KEY,name TEXT,toolchain TEXT,status TEXT);
      INSERT INTO entries VALUES ('a','A','Lean','Open'),('b','B','Lean','Open');
      INSERT INTO module_records VALUES ('a.lean','a'),('b.lean','b');
      INSERT INTO proof_imports VALUES
        ('old',0,'A','a.lean'),('old',1,'Mathlib',NULL),
        ('two',0,'A','a.lean'),('two',1,'B','b.lean'),
        ('unresolved',0,'A','a.lean'),('unresolved',1,'Missing','missing.lean');
    `);
    assert.equal(updateResearchQueue(db, true).summary.paths, 1);
    captureResearchQueue(db);
    db.exec("UPDATE proof_imports SET path='new' WHERE path='old'");
    const result = updateResearchQueue(db);
    assert.deepEqual(result.summary, { lemmas: 1, paths: 1, changedLemmas: 1, gainedPaths: 1, lostPaths: 1 });
    assert.deepEqual({ ...db.prepare('SELECT previous,current,gained,lost FROM research_changes').get() },
      { previous: 1, current: 1, gained: 1, lost: 1 });
  } finally { db.close(); }
});
