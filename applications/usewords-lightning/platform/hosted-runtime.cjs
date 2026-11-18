'use strict';

const { loadRuntime, read, purePorts } = require('../bootstrap/runtime.cjs');
const { createDefinitionCompiler, root, digest } = require('../bootstrap/frontend.cjs');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createKernel } = require('../vendor/worldwright/bootstrap/temple-seed.cjs');
const { lower } = require('../vendor/worldwright/bootstrap/ports/algebra-lower.cjs');
const { invoke } = require('../vendor/worldwright/bootstrap/ports/programme.cjs');

async function loadHostedRuntime() {
  const runtime = await loadRuntime();
  const { manifest, data } = runtime;
  const queries = Object.create(null);
  const add = (name, steps) => {
    if (Object.hasOwn(queries, name)) throw Error('Duplicate process owner: ' + name);
    queries[name] = steps;
  };
  for (const selection of manifest.modules) {
    const module = read(typeof selection === 'string' ? selection : selection.file);
    for (const name of typeof selection === 'string' ? Object.keys(module.queries) : selection.queries) {
      add(name, module.queries[name]);
    }
  }
  for (const item of runtime.compiled) {
    for (const [name, steps] of Object.entries(item.result.surface.queries)) add(name, steps);
  }
  const compiler = await createDefinitionCompiler();
  const hosted = [];
  for (const file of ['platform/parties.encounter', 'platform/hosted.encounter']) {
    const source = readFileSync(join(root, file), 'utf8');
    const compiled = await compiler.compile(file, source);
    hosted.push(compiled.surface);
    for (const [name, steps] of Object.entries(compiled.surface.queries)) add(name, steps);
  }
  for (const surface of hosted) await compiler.link(surface, queries);
  const ports = purePorts();
  const nested = ['kernel.invoke', 'kernel.execute', 'kernel.evaluate'];
  const model = await lower({
    compiler: read(manifest.lowerer), definitions: read(manifest.definitions), primitives: createKernel.operators,
    input: { queries, entry: 'hosted.page' }, mode: 'model', ports, limit: manifest.budget,
  });
  for (const entry of ['admit.model', 'admit.effects']) {
    await invoke({
      model, entry, ports, nested, limit: manifest.budget,
      input: { target: model, profile: read('vendor/worldwright/bootstrap/kernel-profile.json'), grants: manifest.grants },
    });
  }
  const run = async (entry, eventInput) => (await invoke({
    model, entry, input: { ...data.bindings, data, eventInput },
    ports, nested, limit: manifest.budget,
  })).value;
  return { run, programHash: runtime.identity, receiverHash: digest(JSON.stringify(hosted)) };
}

module.exports = { loadHostedRuntime };
