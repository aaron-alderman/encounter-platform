'use strict';

// Snapshot maintenance. Encounter consumes the resulting pinned REL receipts and index.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { deflateSync, inflateSync } = require('node:zlib');
const { decode, encode, parse } = require('./rel-values.cjs');
const { render } = require('./loader-declarations.cjs');
const { initializeProofPaths, proofPathWriter, validateProofPaths } = require('./formalpedia-proof-paths.cjs');
const { captureResearchQueue, updateResearchQueue } = require('./formalpedia-research-queue.cjs');

const remote = 'https://github.com/prove2me/formalpedia.git';
const app = path.resolve(__dirname, '../../../applications/encounter-claimipedia');
const product = 'products/claimipedia';
const loader = product + '/application.loader.encounter';
const active = product + '/application.rel';
const archiveRoot = 'formalpedia-sources';
const recordChanges = '.claimipedia-record-changes.jsonl';
const hex = /^[0-9a-f]{40}$/;
const sha = /^[0-9a-f]{64}$/;
const metadata = /^envs\/([0-9a-f]{7})\/(index|graph)-\d+\.jsonl$/;
const lean = /^envs\/([0-9a-f]{7})\/(Theorems|Definitions|Solutions)\/[^/]+\.lean$/;
const header = Buffer.from('\n\n');
const rename = /^(import (?:Theorems|Definitions)\.[^\r\n \t]+?)__[a-f0-9]{6}(?=[ \t\r\n]|$)/gm;
const hash = value => createHash('sha256').update(value).digest('hex');
const blobHash = value => createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
const need = (condition, message) => { if (!condition) throw Error(message); };
const json = value => JSON.stringify(value);
const data = value => encode(value, 'ApplicationData');
const readData = file => decode(fs.readFileSync(file, 'utf8'), 'ApplicationData');
const run = (bin, args, options = {}) => execFileSync(bin, args, { maxBuffer: 256 * 1024 * 1024, ...options });
const git = (repo, ...args) => run('git', ['-C', repo, ...args]);
const fileHash = async file => {
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};

function readActive(root) {
  const declaration = fs.readFileSync(path.join(root, active), 'utf8');
  const facts = parse(declaration);
  const dataset = name => {
    const fields = facts.filter(f => f.s === 'data.' + name);
    const source = fields.find(f => f.p === 'source')?.o;
    const pin = fields.find(f => f.p === 'sha256')?.o;
    const content = fs.readFileSync(path.join(root, source));
    need(hash(content) === pin, 'Active dataset pin differs: ' + name);
    return { source, pin, value: decode(content.toString('utf8'), 'ApplicationData') };
  };
  const full = dataset('formalpedia-full');
  const audit = dataset('formalpedia-import-renames');
  need(hex.test(full.value.commit) && full.value.commit === audit.value.commit, 'Active Formalpedia receipts disagree');
  return { declaration, full, audit };
}

function tree(repo, commit) {
  const files = new Map();
  for (const item of git(repo, 'ls-tree', '-r', '-z', '--full-tree', commit).toString('utf8').split('\0').filter(Boolean)) {
    const tab = item.indexOf('\t');
    const [mode, type, oid] = item.slice(0, tab).split(' ');
    const name = item.slice(tab + 1);
    need((mode === '100644' || mode === '100755') && type === 'blob' && hex.test(oid) &&
      !/[\\\x00-\x1f\x7f]/.test(name) && !name.split('/').some(part => !part || part === '.' || part === '..') &&
      !files.has(name), 'Unsupported snapshot tree entry: ' + name);
    files.set(name, oid);
  }
  return files;
}

function proofBody(raw, name) {
  const split = raw.indexOf(header);
  need(split !== -1, 'Missing solution provenance header: ' + name);
  return raw.subarray(split + header.length);
}

function checksumEvidence(proof, stored) {
  return { path: proof.path, publishedSha256: proof.sha256, exportedBodySha256: stored.body_sha256,
    exportedFileSha256: stored.sha256 };
}

function sameChecksum(previous, evidence) {
  return previous && Object.entries(evidence).every(([key, value]) => previous[key] === value);
}

function auditRename(proof, stored, bytes) {
  need(hash(bytes) === stored.sha256, 'Proof file differs from catalogue: ' + proof.path);
  const body = proofBody(bytes, proof.path);
  need(hash(body) === stored.body_sha256, 'Proof body differs from catalogue: ' + proof.path);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
  let renamedImports = 0;
  const restored = text.replace(rename, (_, original) => { renamedImports++; return original; });
  if (!renamedImports || hash(restored) !== proof.sha256) return null;
  return { ...checksumEvidence(proof, stored), renamedImports };
}

function cacheBlob(cache, oid, bytes) {
  need(blobHash(bytes) === oid, 'Export blob does not match its pinned Git object: ' + oid);
  const destination = path.join(cache, oid);
  if (!fs.existsSync(destination)) fs.writeFileSync(destination, bytes, { flag: 'wx' });
  return destination;
}

async function restoreMetadata(root, full, before, cache, stage) {
  let missing = [...before].filter(([file, oid]) => metadata.test(file) && !fs.existsSync(path.join(cache, oid)));
  for (const source of [...(full.sourceDeltas ?? [])].reverse().concat({
    path: full.archiveSource, sha256: full.archiveSha256, commit: full.sourceArchiveCommit ?? full.commit,
  })) {
    if (!missing.length) break;
    if (source.metadataFiles === 0) continue;
    const archive = path.join(root, source.path);
    need(await fileHash(archive) === source.sha256, 'Source archive differs from its pin: ' + source.path);
    const out = fs.mkdtempSync(path.join(stage, 'metadata-'));
    // Snapshot archives are already pinned. Only select inert, conventionally named metadata shards.
    run('tar', ['-xzf', archive, '-C', out, '--wildcards', '--no-anchored', '--no-same-owner',
      '--no-same-permissions', '*/envs/*/*.jsonl'], { stdio: ['ignore', 'ignore', 'pipe'] });
    for (const [file, oid] of missing) {
      const candidate = path.join(out, 'formalpedia-' + source.commit, file);
      if (fs.existsSync(candidate)) {
        const bytes = fs.readFileSync(candidate);
        if (blobHash(bytes) === oid) cacheBlob(cache, oid, bytes);
      }
    }
    fs.rmSync(out, { recursive: true, force: true });
    missing = missing.filter(([, oid]) => !fs.existsSync(path.join(cache, oid)));
  }
  need(!missing.length, 'Missing metadata from previous source archives: ' + missing[0]?.[0]);
}

async function download(commit, name, oid) {
  const url = 'https://raw.githubusercontent.com/prove2me/formalpedia/' + commit + '/' +
    name.split('/').map(encodeURIComponent).join('/');
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      need(blobHash(bytes) === oid, 'Downloaded blob differs from the pinned Git tree');
      return bytes;
    } catch (error) {
      if (attempt === 3) throw Error('Unable to read ' + name + ': ' + error.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

async function concurrent(items, operation) {
  let next = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(12, items.length) }, async () => {
    while (!failure && next < items.length) {
      try { await operation(items[next++]); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}

async function* lines(file, name) {
  // JSON permits Unicode line and paragraph separators inside strings. Only LF frames JSONL.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let tail = '';
  let number = 0;
  const parseLine = line => {
    number++;
    try { return line.trim() ? JSON.parse(line) : undefined; }
    catch (error) { throw Error(name + ':' + number + ': ' + error.message); }
  };
  for await (const chunk of fs.createReadStream(file)) {
    const parts = (tail + decoder.decode(chunk, { stream: true })).split('\n');
    tail = parts.pop();
    for (const part of parts) {
      const value = parseLine(part);
      if (value !== undefined) yield value;
    }
  }
  const last = parseLine(tail + decoder.decode());
  if (last !== undefined) yield last;
}

function setupStage(db, metadataDb) {
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE; PRAGMA cache_size=-65536');
  db.prepare('ATTACH DATABASE ? AS target').run(metadataDb);
  db.exec(`
    CREATE TABLE target.rows(id TEXT PRIMARY KEY, env TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL,
      toolchain TEXT NOT NULL, status TEXT NOT NULL, ordinal INTEGER NOT NULL, sourcePath TEXT NOT NULL,
      payload TEXT NOT NULL, changed INTEGER NOT NULL, UNIQUE(env,name));
    CREATE TABLE target.edges(env TEXT NOT NULL, parent TEXT NOT NULL, child TEXT NOT NULL, via TEXT NOT NULL,
      changed INTEGER NOT NULL, PRIMARY KEY(env,parent,child)) WITHOUT ROWID;
    CREATE TABLE target.oldEdges(env TEXT NOT NULL, parent TEXT NOT NULL, child TEXT NOT NULL, via TEXT NOT NULL,
      PRIMARY KEY(env,parent,child)) WITHOUT ROWID;
    CREATE TABLE target.touched(id TEXT PRIMARY KEY) WITHOUT ROWID;
    CREATE TABLE target.remove(id TEXT PRIMARY KEY) WITHOUT ROWID;
    CREATE TABLE target.reindex(id TEXT PRIMARY KEY, rowidBefore INTEGER) WITHOUT ROWID;
  `);
}

function summary(row) { return [row.name, row.title, row.toolchain, row.status, row.environment ?? row.env].join('\n'); }

async function applyDelta({ root, stage, before, after, previous, commit, cache, getBlob }) {
  const full = previous.full.value;
  const audit = previous.audit.value;
  const changed = [...after].filter(([name, oid]) => before.get(name) !== oid);
  const deleted = [...before.keys()].filter(name => !after.has(name));
  const changedNames = new Set(changed.map(([name]) => name));
  const leanChanges = new Set(changed.filter(([name]) => lean.test(name)).map(([name]) => name));
  need(after.has('MANIFEST.json'), 'Snapshot has no manifest');
  fs.mkdirSync(cache, { recursive: true });
  await restoreMetadata(root, full, before, cache, stage);
  const deltaRoot = path.join(stage, 'delta', 'formalpedia-' + commit);
  fs.mkdirSync(deltaRoot, { recursive: true });
  await concurrent(changed, async ([name, oid]) => {
    const existing = path.join(cache, oid);
    const bytes = fs.existsSync(existing) ? fs.readFileSync(existing) : await getBlob(commit, name, oid);
    need(blobHash(bytes) === oid, 'Changed file differs from its Git object: ' + name);
    const output = path.join(deltaRoot, name);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    if (metadata.test(name)) cacheBlob(cache, oid, bytes);
  });
  fs.writeFileSync(path.join(deltaRoot, '.claimipedia-deleted-paths'), deleted.sort().join('\n') + (deleted.length ? '\n' : ''), { flag: 'wx' });
  const manifestBytes = changedNames.has('MANIFEST.json') ? fs.readFileSync(path.join(deltaRoot, 'MANIFEST.json')) :
    await getBlob(commit, 'MANIFEST.json', after.get('MANIFEST.json'));
  need(blobHash(manifestBytes) === after.get('MANIFEST.json'), 'Manifest differs from its Git object');
  const manifest = JSON.parse(manifestBytes);
  need(manifest.license === 'Apache-2.0' && Number.isFinite(Date.parse(manifest.generated_at)),
    'Expected a dated Apache-2.0 snapshot');
  const environments = new Map(manifest.environments.map(env => [env.dir, env]));
  need(environments.size === manifest.environments.length, 'Duplicate Lean environment');
  const priorEnvs = new Map(full.environments.map(env => [env.dir, env]));

  const dbFile = path.join(stage, 'catalogue.sqlite');
  const oldFile = path.join(root, full.indexSource);
  need(await fileHash(oldFile) === full.indexSha256, 'Active catalogue differs from its pin');
  fs.copyFileSync(oldFile, dbFile, fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(dbFile, 0o600);
  const db = new DatabaseSync(dbFile);
  let changes;
  try {
    changes = fs.openSync(path.join(deltaRoot, recordChanges), 'wx');
    const noteChange = (change, id, environment, name) => {
      fs.writeSync(changes, json({ change, id, environment, name }) + '\n');
    };
    setupStage(db, path.join(stage, 'metadata.sqlite'));
    const getFile = db.prepare('SELECT * FROM files WHERE path=?');
    const setFile = db.prepare('INSERT INTO files VALUES (?,?,?,?) ON CONFLICT(path) DO UPDATE SET bytes=excluded.bytes, sha256=excluded.sha256, body_sha256=excluded.body_sha256');
    const proofPaths = full.proofPaths ? proofPathWriter(db) : null;
    db.exec('BEGIN');
    if (full.researchQueue) captureResearchQueue(db);
    const dropFile = db.prepare('DELETE FROM files WHERE path=?');
    for (const name of deleted) {
      const match = lean.exec(name);
      if (!match) continue;
      dropFile.run(name);
      if (match[2] === 'Solutions') proofPaths?.remove(name);
    }
    for (const [name] of changed) {
      const match = lean.exec(name);
      if (!match) continue;
      const bytes = fs.readFileSync(path.join(deltaRoot, name));
      const fileHash = hash(bytes);
      const solution = match[2] === 'Solutions';
      setFile.run(name, bytes.length, fileHash, solution ? hash(proofBody(bytes, name)) : null);
      if (solution && proofPaths) {
        proofPaths.write(name, fileHash, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      }
    }

    const metaFile = (name, oid) => {
      const filename = path.join(cache, oid);
      need(blobHash(fs.readFileSync(filename)) === oid, 'Cached metadata differs from its Git object: ' + name);
      return filename;
    };
    const earlier = new Map();
    const oldEdge = db.prepare('INSERT INTO target.oldEdges VALUES (?,?,?,?)');
    const roles = edge => {
      need(Array.isArray(edge.via) && edge.via.length && new Set(edge.via).size === edge.via.length &&
        edge.via.every(v => v === 'statement' || v === 'solution'), 'Unsupported dependency edge');
      return edge.via.slice().sort().join(',');
    };
    const oldDefinitionChanges = new Set();
    for (const [name, oid] of before) {
      const match = metadata.exec(name);
      if (!match || after.get(name) === oid) continue;
      for await (const row of lines(metaFile(name, oid), name)) {
        if (match[2] === 'index') earlier.set(match[1] + '-' + row.id, {
          raw: json(row), definition: row.status === 'Definition' ? row.statement_path : null,
        });
        else oldEdge.run(match[1], row.parent, row.child, roles(row));
      }
    }

    const insert = db.prepare('INSERT INTO target.rows VALUES (?,?,?,?,?,?,?,?,?,?)');
    const edgeInsert = db.prepare('INSERT INTO target.edges VALUES (?,?,?,?,?)');
    const byProof = Object.create(null);
    const unresolved = Object.create(null);
    const pendingChecks = [];
    const counts = Object.create(null);
    const proofStatuses = Object.create(null);
    const stats = new Map([...environments].map(([env]) => [env, { theorems: 0, definitions: 0, solutions: 0, edges: 0 }]));
    const pathsSeen = new Set();
    const proofIds = new Set();
    let directMatches = 0;
    for (const [name, oid] of [...after].sort(([a], [b]) => a < b ? -1 : 1)) {
      const match = metadata.exec(name);
      if (!match) continue;
      const [, env, kind] = match;
      const profile = environments.get(env);
      const tally = stats.get(env);
      need(profile, 'Shard has an undeclared Lean environment: ' + name);
      for await (const row of lines(metaFile(name, oid), name)) {
        if (kind === 'graph') {
          edgeInsert.run(env, row.parent, row.child, roles(row), Number(changedNames.has(name)));
          tally.edges++;
          continue;
        }
        need(row.env === env && /^[0-9a-f-]{36}$/.test(row.id) && row.url === 'https://prove2.me/theorems/' + row.id &&
          typeof row.theorem_name === 'string' && typeof row.status === 'string' && Array.isArray(row.solutions),
          'Invalid Formalpedia index entry in ' + name);
        const definition = row.status === 'Definition';
        const ordinal = tally.theorems + tally.definitions;
        tally[definition ? 'definitions' : 'theorems']++;
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        const id = env + '-' + row.id;
        const old = earlier.get(id);
        const profileChanged = priorEnvs.get(env)?.mathlib_rev !== profile.mathlib_rev ||
          priorEnvs.get(env)?.toolchain !== profile.toolchain;
        let dirty = profileChanged || (changedNames.has(name) && old?.raw !== json(row)) ||
          leanChanges.has(row.statement_path);
        const statementMatch = lean.exec(row.statement_path);
        need(statementMatch?.[1] === env && statementMatch[2] === (definition ? 'Definitions' : 'Theorems') &&
          after.has(row.statement_path) && !pathsSeen.has(row.statement_path) && getFile.get(row.statement_path),
          'Invalid statement source: ' + row.statement_path);
        pathsSeen.add(row.statement_path);
        if (old && old.definition !== (definition ? row.statement_path : null)) oldDefinitionChanges.add(id);

        for (const proof of row.solutions) {
          const proofMatch = lean.exec(proof.path);
          const stored = getFile.get(proof.path);
          need(/^[0-9a-f-]{36}$/.test(proof.id) && !proofIds.has(proof.id) &&
            proofMatch?.[1] === env && proofMatch[2] === 'Solutions' && after.has(proof.path) &&
            !pathsSeen.has(proof.path) && stored, 'Invalid solution source: ' + proof.path);
          proofIds.add(proof.id);
          pathsSeen.add(proof.path);
          tally.solutions++;
          proofStatuses[proof.status] = (proofStatuses[proof.status] ?? 0) + 1;
          dirty ||= leanChanges.has(proof.path);
          need(sha.test(proof.sha256), 'Invalid published checksum: ' + proof.path);
          if (proof.sha256 === stored.body_sha256) {
            directMatches++;
            continue;
          }
          const evidence = checksumEvidence(proof, stored);
          const previousProof = audit.proofs[proof.id];
          if (sameChecksum(previousProof, evidence)) byProof[proof.id] = previousProof;
          else if (sameChecksum(audit.unresolved?.[proof.id], evidence)) unresolved[proof.id] = evidence;
          else pendingChecks.push({ proof, stored });
        }
        insert.run(id, env, row.theorem_name, row.title || row.theorem_name, profile.toolchain, row.status,
          ordinal, row.statement_path, json(row), Number(dirty));
      }
    }
    for (const [env, tally] of stats) {
      for (const field of Object.keys(tally)) need(tally[field] === environments.get(env)[field],
        'Manifest ' + field + ' count differs in ' + env);
    }
    const countFiles = db.prepare('SELECT count(*) AS n FROM files').get().n;
    need(pathsSeen.size === [...after.keys()].filter(name => lean.test(name)).length && pathsSeen.size === countFiles,
      'Snapshot index does not account for every Lean file');
    await concurrent(pendingChecks, async ({ proof, stored }) => {
      // A proof whose published and exported hashes still differ must earn a receipt.
      const bytes = changedNames.has(proof.path) ? fs.readFileSync(path.join(deltaRoot, proof.path)) :
        await getBlob(commit, proof.path, after.get(proof.path));
      need(blobHash(bytes) === after.get(proof.path), 'Audit proof differs from its Git object');
      const verified = auditRename(proof, stored, bytes);
      if (verified) byProof[proof.id] = verified;
      else unresolved[proof.id] = checksumEvidence(proof, stored);
    });
    const unresolvedProofs = Object.keys(unresolved).sort();
    need(directMatches + Object.keys(byProof).length + unresolvedProofs.length === proofIds.size,
      'Proof checksum accounting differs from snapshot');

    db.exec(`
      CREATE INDEX target.incoming ON edges(env,child);
      INSERT INTO target.remove SELECT e.id FROM entries e LEFT JOIN target.rows r ON r.id=e.id WHERE r.id IS NULL;
      INSERT INTO target.touched SELECT r.id FROM target.rows r LEFT JOIN entries e ON e.id=r.id
        WHERE r.changed OR e.id IS NULL;
      INSERT OR IGNORE INTO target.touched
        SELECT r.id FROM target.rows r JOIN (
          SELECT * FROM (SELECT env,parent,child,via FROM target.edges WHERE changed
            EXCEPT SELECT env,parent,child,via FROM target.oldEdges)
          UNION ALL
          SELECT * FROM (SELECT env,parent,child,via FROM target.oldEdges
            EXCEPT SELECT env,parent,child,via FROM target.edges WHERE changed)
        ) d ON d.env=r.env AND d.parent=r.name;
      INSERT OR IGNORE INTO target.touched
        SELECT parent.id FROM target.edges g JOIN target.rows parent ON parent.env=g.env AND parent.name=g.parent
        LEFT JOIN entries old ON old.environment=g.env AND old.name=g.child
        LEFT JOIN target.rows new ON new.env=g.env AND new.name=g.child
        WHERE old.id IS NOT new.id;
      INSERT INTO target.reindex
        SELECT r.id,e.rowid FROM target.rows r LEFT JOIN entries e ON e.id=r.id
        WHERE e.id IS NULL OR e.name<>r.name OR e.title<>r.title OR e.toolchain<>r.toolchain
          OR e.status<>r.status OR e.environment<>r.env;
    `);
    const touchDefinition = db.prepare(`
      INSERT OR IGNORE INTO target.touched
      SELECT parent.id FROM target.rows d JOIN target.edges g ON g.env=d.env AND g.child=d.name
      JOIN target.rows parent ON parent.env=g.env AND parent.name=g.parent WHERE d.id=?
    `);
    for (const id of oldDefinitionChanges) touchDefinition.run(id);
    need(!db.prepare(`SELECT 1 FROM target.edges g LEFT JOIN target.rows r ON r.env=g.env AND r.name=g.parent
      WHERE r.id IS NULL LIMIT 1`).get(), 'Dependency parent is outside the snapshot index');
    const unlinked = db.prepare(`SELECT count(*) AS n FROM target.edges g
      LEFT JOIN target.rows r ON r.env=g.env AND r.name=g.child WHERE r.id IS NULL`).get().n;

    const eraseSearch = db.prepare("INSERT INTO search(search,rowid,text) VALUES ('delete',?,?)");
    const eraseEntry = db.prepare('DELETE FROM entries WHERE id=?');
    const eraseDocument = db.prepare('DELETE FROM documents WHERE id=?');
    const insertEntry = db.prepare('INSERT INTO entries(rowid,id,name,title,toolchain,status,environment,ordinal) VALUES (?,?,?,?,?,?,?,?)');
    const insertSearch = db.prepare('INSERT INTO search(rowid,text) VALUES (?,?)');
    const next = db.prepare('SELECT coalesce(max(rowid),0) AS n FROM entries').get().n;
    let rowid = next;
    // Gather the old rows before changing their tables. Preserve rowids for existing search results.
    const stale = db.prepare(`SELECT e.rowid,e.* FROM entries e
      WHERE e.id IN (SELECT id FROM target.remove UNION SELECT id FROM target.reindex)`).all();
    for (const row of db.prepare(`SELECT e.id,e.environment,e.name FROM target.remove r
      JOIN entries e ON e.id=r.id ORDER BY e.id`).iterate()) {
      noteChange('removed', row.id, row.environment, row.name);
    }
    for (const row of stale) {
      eraseSearch.run(row.rowid, summary(row));
      eraseEntry.run(row.id);
    }
    for (const { id } of db.prepare('SELECT id FROM target.remove').iterate()) eraseDocument.run(id);
    for (const row of db.prepare('SELECT r.*,s.rowidBefore FROM target.reindex s JOIN target.rows r ON r.id=s.id ORDER BY r.env,r.ordinal').iterate()) {
      const key = row.rowidBefore ?? ++rowid;
      insertEntry.run(key, row.id, row.name, row.title, row.toolchain, row.status, row.env, row.ordinal);
      insertSearch.run(key, summary(row));
    }

    const save = db.prepare('INSERT INTO documents VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
    const oldDoc = db.prepare('SELECT payload FROM documents WHERE id=?');
    const dependencies = db.prepare(`
      SELECT e.child,e.via,r.id AS target,r.sourcePath,r.status FROM target.edges e
      LEFT JOIN target.rows r ON r.env=e.env AND r.name=e.child WHERE e.env=? AND e.parent=? ORDER BY e.child
    `);
    let updated = 0;
    let largestRecordBytes = full.largestRecordBytes;
    for (const row of db.prepare('SELECT r.* FROM target.touched t JOIN target.rows r ON r.id=t.id ORDER BY r.id').iterate()) {
      const raw = JSON.parse(row.payload);
      const profile = environments.get(row.env);
      const edges = dependencies.all(row.env, row.name);
      const solutions = raw.solutions.map(proof => {
        const stored = getFile.get(proof.path);
        return { ...proof, exportSha256: stored.sha256, ...(stored.body_sha256 !== proof.sha256 ?
          { bodySha256: stored.body_sha256, checksumStatus: 'mismatch' } : {}) };
      });
      const detail = { id: row.id, upstreamId: raw.id, name: row.name, title: row.title, leanLines: raw.lean_lines,
        environment: row.env, toolchain: row.toolchain, mathlib: profile.mathlib_rev, module: raw.module,
        status: row.status, author: raw.author, source: raw.source || '', url: raw.url, createdAt: raw.created_at,
        statementPath: row.sourcePath, statementSha256: getFile.get(row.sourcePath).sha256, solutions,
        definitions: edges.filter(e => e.status === 'Definition').map(e => ({ path: e.sourcePath })),
        dependencies: edges.map(e => ({ child: e.child, via: e.via.split(','), target: e.target })) };
      const existing = oldDoc.get(row.id);
      const encoded = data(detail);
      need(Buffer.byteLength(encoded) <= 8_000_000, 'Catalogue record exceeds the host bound: ' + row.id);
      decode(encoded, 'ApplicationData');
      if (existing && equivalentDetail(decode(inflateSync(existing.payload).toString(), 'ApplicationData'), detail)) continue;
      save.run(row.id, deflateSync(encoded, { level: 1 }));
      noteChange(existing ? 'updated' : 'added', row.id, row.env, row.name);
      largestRecordBytes = Math.max(largestRecordBytes, Buffer.byteLength(encoded));
      updated++;
    }
    const records = db.prepare('SELECT count(*) AS n FROM target.rows').get().n;
    const removed = db.prepare('SELECT count(*) AS n FROM target.remove').get().n;
    const added = db.prepare('SELECT count(*) AS n FROM target.reindex WHERE rowidBefore IS NULL').get().n;
    for (const table of ['entries', 'documents', 'search']) {
      need(db.prepare('SELECT count(*) AS n FROM ' + table).get().n === records, 'Index count differs: ' + table);
    }
    let proofPathCounts;
    if (proofPaths) {
      db.exec(`
        DELETE FROM module_records WHERE NOT EXISTS (
          SELECT 1 FROM target.rows r WHERE r.id=module_records.id AND r.sourcePath=module_records.path
        );
        INSERT INTO module_records(path,id)
          SELECT r.sourcePath,r.id FROM target.rows r LEFT JOIN module_records m ON m.id=r.id WHERE m.id IS NULL;
      `);
      proofPathCounts = validateProofPaths(db, proofIds.size);
    }
    const queue = proofPaths && updateResearchQueue(db, !full.researchQueue);
    db.exec('COMMIT; DETACH DATABASE target');
    need(db.prepare('PRAGMA integrity_check').all().every(r => r.integrity_check === 'ok'), 'Staged index failed integrity check');
    return {
      full: { ...full, commit, generatedAt: manifest.generated_at, license: manifest.license,
        manifestSha256: hash(manifestBytes), environments: manifest.environments, records,
        solutions: proofIds.size, dependencyEdges: [...stats.values()].reduce((n, e) => n + e.edges, 0),
        unlinkedEdges: unlinked, statuses: counts, proofStatuses, leanSourceBytes: db.prepare('SELECT sum(bytes) AS n FROM files').get().n,
        largestRecordBytes, ...(proofPathCounts ? { proofPaths: proofPathCounts } : {}),
        ...(queue ? { researchQueue: { ...queue.summary, previousCommit: full.researchQueue ? full.commit : null } } : {}),
        solutionChecksumMatches: directMatches,
        solutionChecksumMismatches: proofIds.size - directMatches, solutionChecksumsVerifiedAfterRenaming: Object.keys(byProof).length,
        unresolvedProofs, refresh: { previousCommit: full.commit, filesChanged: changed.length, filesRemoved: deleted.length,
          recordsAdded: added, recordsUpdated: updated - added, recordsRemoved: removed } },
      audit: { commit, proofs: canonical(byProof), unresolved: canonical(unresolved) },
      deltaRoot, dbFile, indexChanged: Boolean(queue?.indexChanged || updated || removed || leanChanges.size || deleted.some(name => lean.test(name))),
      metadataFiles: changed.filter(([name]) => metadata.test(name)).length,
    };
  } finally {
    try { if (changes !== undefined) fs.closeSync(changes); }
    finally { db.close(); }
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function equivalentDetail(previous, current) {
  const sort = (rows, key) => rows.slice().sort((a, b) => a[key].localeCompare(b[key]));
  const stable = row => canonical({ ...row, definitions: sort(row.definitions, 'path'),
    dependencies: sort(row.dependencies, 'child').map(edge => ({ ...edge, via: edge.via.slice().sort() })) });
  return json(stable(previous)) === json(stable(current));
}

function loaderPins(source, full, audit) {
  for (const [name, entry] of [['formalpedia-full', full], ['formalpedia-import-renames', audit]]) {
    const section = new RegExp('(subject = "data\\.' + name + '";\\s*source = ")[^"]+(";' +
      '\\s*format = "typed-rel";\\s*sha256 = ")[0-9a-f]{64}(")', 'g');
    need([...source.matchAll(section)].length === 1, 'Missing or ambiguous loader section: ' + name);
    source = source.replace(section, (_, start, middle, end) => start + entry.source + middle + entry.pin + end);
  }
  return source;
}

function atomicText(file, content, stage) {
  const temporary = path.join(stage, path.basename(file) + '.new');
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

function checksumReport(full, audit) {
  const unresolved = full.unresolvedProofs ?? [];
  return {
    verifiedAfterImportRenaming: Object.keys(audit.proofs).length,
    unresolvedChecksums: unresolved.length,
    unresolvedProofs: unresolved.map(proofId => ({ proofId, ...audit.unresolved?.[proofId] })),
  };
}

async function publish(root, stage, previous, next) {
  const commit = next.full.commit;
  const archive = path.join(stage, 'delta.tar.gz');
  run('tar', ['-czf', archive, '-C', path.dirname(next.deltaRoot), path.basename(next.deltaRoot)]);
  run('gzip', ['-t', archive]);
  const archivePin = await fileHash(archive);
  const delta = archiveRoot + '/' + commit + '-' + archivePin.slice(0, 12) + '-delta.tar.gz';
  const deltaEntry = { commit, path: delta, sha256: archivePin, bytes: fs.statSync(archive).size,
    metadataFiles: next.metadataFiles };
  let { indexSource, indexSha256, indexBytes } = previous.full.value;
  if (next.indexChanged) {
    indexSha256 = await fileHash(next.dbFile);
    indexSource = product + '/formalpedia/catalogue-' + commit + '-' + indexSha256.slice(0, 12) + '.sqlite';
    indexBytes = fs.statSync(next.dbFile).size;
  }
  const full = { ...next.full, indexSource, indexSha256, indexBytes: indexBytes ?? fs.statSync(path.join(root, indexSource)).size,
    sourceArchiveCommit: previous.full.value.sourceArchiveCommit ?? previous.full.value.commit,
    sourceDeltas: [...(previous.full.value.sourceDeltas ?? []), deltaEntry] };
  const fullContent = data(full);
  const auditContent = data(next.audit);
  decode(fullContent, 'ApplicationData');
  decode(auditContent, 'ApplicationData');
  const receipt = (name, content) => {
    const pin = hash(content);
    return { source: product + '/formalpedia/' + name + '-' + commit + '-' + pin.slice(0, 12) + '.rel', pin };
  };
  const fullPin = receipt('full', fullContent);
  const auditPin = receipt('import-renames', auditContent);
  const loaderPath = path.join(root, loader);
  const loaderText = fs.readFileSync(loaderPath, 'utf8');
  const nextLoader = loaderPins(loaderText, fullPin, auditPin);
  const rendered = await render(path.basename(loaderPath), nextLoader);

  need(fs.readFileSync(path.join(root, active), 'utf8') === previous.declaration,
    'Active declaration changed while the refresh was being staged');
  // Versioned files become visible to the app only when the generated declaration is replaced.
  const stagedFiles = [[archive, delta, archivePin]];
  if (next.indexChanged) stagedFiles.push([next.dbFile, indexSource, indexSha256]);
  for (const [staged, destination, pin] of stagedFiles) {
    const file = path.join(root, destination);
    if (fs.existsSync(file)) {
      need(await fileHash(file) === pin, 'Existing versioned file differs from its pin: ' + destination);
      continue;
    }
    fs.chmodSync(staged, 0o444);
    fs.renameSync(staged, file);
  }
  atomicText(path.join(root, fullPin.source), fullContent, stage);
  atomicText(path.join(root, auditPin.source), auditContent, stage);
  atomicText(loaderPath, nextLoader, stage);
  atomicText(path.join(root, active), rendered, stage);
  return { commit, status: 'updated', ...full.refresh, deltaArchive: delta,
    recordChangesEntry: 'formalpedia-' + commit + '/' + recordChanges,
    snapshotReceipt: fullPin.source, checksumReceipt: auditPin.source,
    ...(full.proofPaths ? { proofPaths: full.proofPaths } : {}),
    ...(full.researchQueue ? { researchQueue: full.researchQueue } : {}),
    ...checksumReport(full, next.audit) };
}

async function refresh(root, { targetCommit, readTrees, getBlob = download } = {}) {
  const previous = readActive(root);
  const commit = targetCommit ?? git(root, 'ls-remote', remote, 'refs/heads/main').toString().split(/\s+/)[0];
  need(hex.test(commit), 'Unable to identify the upstream Formalpedia commit');
  if (commit === previous.full.value.commit) {
    return { commit, status: 'current', filesChanged: 0, filesRemoved: 0,
      recordsAdded: 0, recordsUpdated: 0, recordsRemoved: 0,
      snapshotReceipt: previous.full.source, checksumReceipt: previous.audit.source,
      ...(previous.full.value.proofPaths ? { proofPaths: previous.full.value.proofPaths } : {}),
      ...(previous.full.value.researchQueue ? { researchQueue: previous.full.value.researchQueue } : {}),
      ...checksumReport(previous.full.value, previous.audit.value) };
  }
  const work = path.join(root, archiveRoot, '.refresh-cache');
  fs.mkdirSync(work, { recursive: true });
  const stage = fs.mkdtempSync(path.join(work, 'stage-'));
  try {
    const repo = path.join(work, 'git');
    const base = previous.full.value.commit;
    if (!readTrees) {
      if (!fs.existsSync(repo)) {
        run('git', ['init', '--bare', '-q', repo]);
        git(repo, 'remote', 'add', 'origin', remote);
        git(repo, 'config', 'remote.origin.promisor', 'true');
        git(repo, 'config', 'remote.origin.partialclonefilter', 'blob:none');
      }
      for (const id of [base, commit]) {
        git(repo, '-c', 'protocol.version=2', 'fetch', '--quiet', '--no-tags', '--depth=1', '--filter=blob:none',
          'origin', id + ':refs/formalpedia/' + id);
      }
      readTrees = id => tree(repo, id);
    }
    const before = readTrees(base);
    const after = readTrees(commit);
    const next = await applyDelta({ root, stage, before, after, previous, commit,
      cache: path.join(work, 'metadata'), getBlob });
    return await publish(root, stage, previous, next);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function backfillCatalogue(root, queueOnly) {
  const previous = readActive(root);
  const full = previous.full.value;
  if (queueOnly) need(full.proofPaths, 'The solution import index is required');
  if (queueOnly ? full.researchQueue : full.proofPaths) return {
    commit: full.commit, status: 'current', proofPaths: full.proofPaths, researchQueue: full.researchQueue,
  };
  if (!queueOnly) need(!full.sourceDeltas?.length, 'Backfill must start from the original full archive');
  const work = path.join(root, archiveRoot, '.refresh-cache');
  fs.mkdirSync(work, { recursive: true });
  const stage = fs.mkdtempSync(path.join(work, 'proof-paths-'));
  try {
    const archive = path.join(root, full.archiveSource);
    const currentIndex = path.join(root, full.indexSource);
    const [archivePin, indexPin] = await Promise.all([queueOnly ? full.archiveSha256 : fileHash(archive), fileHash(currentIndex)]);
    need(archivePin === full.archiveSha256 && indexPin === full.indexSha256, 'Active archive or index differs from its pin');
    const stagedIndex = path.join(stage, 'catalogue.sqlite');
    fs.copyFileSync(currentIndex, stagedIndex, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(stagedIndex, 0o600);
    const db = new DatabaseSync(stagedIndex);
    let counts = full.proofPaths;
    let researchQueue;
    try {
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536; BEGIN');
      if (!queueOnly) {
        initializeProofPaths(db);
        const writer = proofPathWriter(db);
        const getFile = db.prepare('SELECT sha256,body_sha256 FROM files WHERE path=?');
        const putRecord = db.prepare('INSERT INTO module_records VALUES (?,?)');
        const scanner = spawn('python3',
          [path.join(__dirname, 'formalpedia-archive.py'), archive, full.commit],
          { stdio: ['ignore', 'pipe', 'inherit'] });
        const completion = once(scanner, 'close');
        const stream = scanner.stdout;
        try {
          for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
            const [kind, key, value, header, truncated] = JSON.parse(line);
            if (kind === 'record') putRecord.run(value, key);
            else {
              const stored = getFile.get(key);
              need(kind === 'solution' && stored?.body_sha256 && stored.sha256 === value, 'Archive solution differs: ' + key);
              writer.write(key, value, header, truncated);
            }
          }
          need((await completion)[0] === 0, 'Formalpedia archive scan failed');
        } finally {
          stream.destroy();
          if (scanner.exitCode === null) scanner.kill();
        }
        counts = validateProofPaths(db, full.solutions);
      }
      researchQueue = { ...updateResearchQueue(db, true).summary, previousCommit: null };
      db.exec('COMMIT');
      need(db.prepare('PRAGMA integrity_check').all().every(r => r.integrity_check === 'ok'), 'Staged index failed integrity check');
    } finally { db.close(); }

    const indexSha256 = await fileHash(stagedIndex);
    const indexSource = product + '/formalpedia/catalogue-' + full.commit + '-' + indexSha256.slice(0, 12) + '.sqlite';
    const content = data({ ...full, indexSource, indexSha256, indexBytes: fs.statSync(stagedIndex).size, proofPaths: counts, researchQueue });
    const pin = hash(content);
    const source = product + '/formalpedia/full-' + full.commit + '-' + pin.slice(0, 12) + '.rel';
    const loaderPath = path.join(root, loader);
    const nextLoader = loaderPins(fs.readFileSync(loaderPath, 'utf8'), { source, pin }, previous.audit);
    const rendered = await render(path.basename(loaderPath), nextLoader);
    need(fs.readFileSync(path.join(root, active), 'utf8') === previous.declaration,
      'Active declaration changed while the backfill was staged');
    fs.chmodSync(stagedIndex, 0o444);
    fs.renameSync(stagedIndex, path.join(root, indexSource));
    atomicText(path.join(root, source), content, stage);
    atomicText(loaderPath, nextLoader, stage);
    atomicText(path.join(root, active), rendered, stage);
    return { commit: full.commit, status: queueOnly ? 'research queue indexed' : 'proof paths indexed', solutions: full.solutions, proofPaths: counts, researchQueue, snapshotReceipt: source };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--lock-held') {
    console.log(json(args[1] ? await backfillCatalogue(app, args[1] === '--backfill-research-queue') : await refresh(app)));
    return;
  }
  need(args.length === 0 || (args.length === 1 && ['--backfill-proof-paths', '--backfill-research-queue'].includes(args[0])),
    'Usage: node formalpedia-refresh.cjs [--backfill-proof-paths|--backfill-research-queue]');
  const lock = path.join(app, archiveRoot, '.refresh.lock');
  run('flock', ['--exclusive', '--nonblock', lock, process.execPath, __filename, '--lock-held', ...args], { stdio: 'inherit' });
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { refresh, tree, blobHash };
