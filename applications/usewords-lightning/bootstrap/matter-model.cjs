'use strict';

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createDefinitionCompiler, root, read, executionBudget } = require('./frontend.cjs');
const { purePorts } = require('./runtime.cjs');
const { createKernel } = require('../vendor/worldwright/bootstrap/temple-seed.cjs');
const { lower } = require('../vendor/worldwright/bootstrap/ports/algebra-lower.cjs');
const { invoke } = require('../vendor/worldwright/bootstrap/ports/programme.cjs');

const file = 'source/owners/local-model.encounter';
const mechanisms = purePorts();
// This standalone process has only data effects. The browser runtime never loads it.
const ports = Object.fromEntries([
  'value.describe', 'number.calculate', 'text.matches', 'text.join', 'json.parse',
  'json.stringify', 'record.entries', 'digest.sha256'
].map(name => [name, mechanisms[name]]));

async function loadPolicy() {
  const compiler = await createDefinitionCompiler();
  const text = await readFile(path.join(root, file), 'utf8');
  const { surface } = await compiler.compile(file, text);
  await compiler.link(surface, {});
  const lowerModel = input => lower({
    compiler: read('vendor/worldwright/algebra/lowering.process.json'),
    definitions: read('vendor/worldwright/algebra/operators.expression.json'),
    primitives: createKernel.operators,
    input, mode: 'model', ports: mechanisms, limit: executionBudget
  });
  const model = await lowerModel({ entry: 'model.prepare', queries: surface.queries });
  const admission = await lowerModel(read('vendor/worldwright/algebra/admission.process.json'));
  const profile = read('vendor/worldwright/bootstrap/kernel-profile.json');
  for (const entry of ['admit.model', 'admit.effects']) {
    await invoke({
      model: admission, entry, input: { target: model, profile, grants: Object.keys(ports) },
      ports: mechanisms, limit: executionBudget
    });
  }
  return model;
}

let policy;
async function run(entry, eventInput) {
  const model = await (policy ??= loadPolicy());
  return (await invoke({ model, entry, input: { eventInput }, ports, limit: executionBudget })).value;
}

async function readJson(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw new Error('Local model JSON exceeds its byte limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function generateMatterSuggestions(slot, bindings, brief, fetchLocal = fetch) {
  const request = await run('model.prepare', { slot, bindings, brief });
  async function ollama(endpoint, init) {
    const result = await fetchLocal('http://127.0.0.1:11434/api/' + endpoint, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(90_000)
    });
    if (!result.ok) throw new Error('Local Ollama request failed with HTTP ' + result.status);
    return readJson(result.body, 1_000_000);
  }
  const catalogue = await ollama('tags');
  await run('model.checkCatalogue', { request, catalogue });
  const generated = await ollama('generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  });
  return run('model.finish', { request, generated });
}

async function main() {
  try {
    const [, , slot, config] = process.argv;
    if (!config || process.argv.length !== 4) {
      throw new Error('Usage: node bootstrap/matter-model.cjs fast|deep bindings.json < brief.json');
    }
    const bindings = JSON.parse(await readFile(config, 'utf8'));
    const brief = await readJson(process.stdin, 100_000);
    process.stdout.write(JSON.stringify(await generateMatterSuggestions(slot, bindings, brief)) + '\n');
  } catch (error) {
    process.stderr.write('Usewords local model: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
module.exports = { generateMatterSuggestions };
