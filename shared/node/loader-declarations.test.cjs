'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {parse} = require('./rel-values.cjs');
const {platformDeclarations, synchronize} = require('./loader-declarations.cjs');

test('platform loader REL exactly matches its Encounter owners', async () => {
  const files = platformDeclarations();
  assert.deepEqual(await synchronize(files, false), {checked:files.length, updated:0});
});

test('drift refuses and regenerating preserves ordered modules and grants', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-declaration-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root, 'application.rel');
  const owner = path.join(root, 'application.loader.encounter');
  fs.writeFileSync(owner, `process-module "temple/surface-process-module/1"

process loader.declaration:
  let result = { sections = list({ subject = "application"; module = list("b.encounter", "a.encounter"); grant = list("text.trim", "kernel.invoke") }) }
`);
  fs.writeFileSync(file, '("application", "grant", "storage.cas")\n');
  await assert.rejects(synchronize([file], false), /Generated loader REL differs/);
  assert.match(fs.readFileSync(file, 'utf8'), /storage.cas/);
  assert.deepEqual(await synchronize([file], true), {checked:1, updated:1});
  assert.deepEqual(parse(fs.readFileSync(file, 'utf8')).map(({p,o}) => [p,o]), [
    ['module','b.encounter'], ['module','a.encounter'], ['grant','text.trim'], ['grant','kernel.invoke'],
  ]);
  assert.deepEqual(await synchronize([file], false), {checked:1, updated:0});
});

test('native Authoring uses the same source bytes as the shared owner', () => {
  const workspace = path.resolve(__dirname, '../..');
  for (const module of ['types', 'actions', 'commands', 'application', 'ui']) {
    const file = 'source/' + module + '.encounter';
    const shared = fs.readFileSync(path.join(workspace, 'shared/authoring', file));
    const native = fs.readFileSync(path.join(workspace, 'applications/encounter', file));
    assert.deepEqual(native, shared, file);
  }
});
