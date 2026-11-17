'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const { lower } = require('../vendor/worldwright/bootstrap/ports/algebra-lower.cjs');
const { invoke } = require('../vendor/worldwright/bootstrap/ports/programme.cjs');
const { createKernel } = require('../vendor/worldwright/bootstrap/temple-seed.cjs');
const { parse } = require('../../encounter/bootstrap/rel-values.cjs');

async function createTransport() {
  const { loadRuntime, root, read, digest, purePorts } = require('../bootstrap/runtime.cjs');
  const runtime = await loadRuntime();
  const { generateMatterSuggestions } = require('../bootstrap/matter-model.cjs');
  const { compilerHost, createProcessCompiler, compileSources } = require('../bootstrap/frontend.cjs');
  const frontend = 'source/languages/usewords-frontend.json';
  const compiler = await createProcessCompiler(compilerHost(root, digest), frontend, runtime.manifest.budget);
  const mechanisms = purePorts();
  const textOf = tree => typeof tree === 'string' ? tree : (tree.children ?? []).map(textOf).join('');
  const spawnNode = args => {
    const { status, stdout, stderr, error } = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    if (error) throw error;
    return { status, stdout, stderr };
  };
  const platformModels = new Map();
  async function loadPlatform(files, entry) {
    const { manifest } = runtime;
    const queries = Object.create(null);
    const overlaps = [];
    const add = (name, steps) => {
      if (Object.hasOwn(queries, name)) overlaps.push(name);
      queries[name] = steps;
    };
    for (const selection of manifest.modules) {
      const module = read(typeof selection === 'string' ? selection : selection.file);
      for (const name of typeof selection === 'string' ? Object.keys(module.queries) : selection.queries) add(name, module.queries[name]);
    }
    const proposed = await compileSources({ root, digest, manifest: {
      ...manifest,
      processModules: files.map(file => ({ file, frontend }))
    } });
    for (const item of [...runtime.compiled, ...proposed]) {
      for (const [name, steps] of Object.entries(item.result.surface.queries)) add(name, steps);
    }
    for (const item of proposed) await item.compiler.link(item.result.surface, queries);
    const model = await lower({ compiler: read(manifest.lowerer), definitions: read(manifest.definitions),
      primitives: createKernel.operators, input: { queries, entry },
      mode: 'model', ports: purePorts(), limit: manifest.budget });
    return { model, overlaps };
  }
  const fixtures = new Map();
  let next = 0;
  const local = file => {
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep)) throw Error('Test observation escaped the package');
    return target;
  };
  function fixture(id) {
    const value = fixtures.get(id);
    if (!value) throw Error('Unknown test fixture');
    return value;
  }
  const ports = {
    'text.join': mechanisms['text.join'],
    'text.slice': mechanisms['text.slice'],
    'test.sourceText': ({ tree }) => textOf(tree),
    'test.path': ({ segments }) => path.join(...segments),
    'test.indexOf': ({ value, item }) => value.findIndex(value => value === item),
    'test.compile': ({ file, text }) => compiler.compile(file, text),
    'test.link': ({ surface }) => compiler.link(surface, runtime.model.queries),
    'test.openPlatform': async ({ files, entry }) => {
      const id = JSON.stringify([files, entry]);
      if (!platformModels.has(id)) platformModels.set(id, loadPlatform(files, entry));
      const { overlaps } = await platformModels.get(id);
      return { id, overlaps };
    },
    'test.build': () => {
      const result = spawnNode(['bootstrap/build.cjs']);
      return { ...result, receipt: result.status === 0 ? read('dist/build-receipt.json') : null };
    },
    'test.replay': ({ receipt }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usewords-replay-'));
      try {
        const file = path.join(directory, 'acceptance.json');
        fs.writeFileSync(file, JSON.stringify(receipt));
        return spawnNode(['bootstrap/cli.cjs', 'replay', file]);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
    'test.invoke': async ({ entry, input, host, fresh, platform }) => {
      if (platform) return invoke({
        model: (await platformModels.get(platform)).model, entry,
        input: { ...runtime.data.bindings, data: runtime.data, eventInput: input },
        ports: purePorts(), nested: ['kernel.invoke', 'kernel.execute', 'kernel.evaluate'], limit: runtime.manifest.budget
      });
      const app = fresh ? await loadRuntime() : runtime;
      return app.run(entry, input, host ? fixture(host).ports : undefined);
    },
    'test.read': ({ file }) => fs.readFileSync(local(file), 'utf8'),
    'test.json': ({ file }) => read(path.relative(root, local(file))),
    'test.exists': ({ file }) => fs.existsSync(local(file)),
    'test.facts': ({ text }) => parse(text),
    'test.digest': ({ text }) => digest(text),
    'test.digestFile': ({ file }) => digest(fs.readFileSync(local(file))),
    'test.stringify': ({ value }) => JSON.stringify(value),
    'test.parse': ({ text }) => JSON.parse(text),
    'test.match': ({ text, pattern, flags = '' }) => new RegExp(pattern, flags).test(text),
    'test.matches': ({ text, pattern, flags }) => String(text).match(new RegExp(pattern, flags)),
    'test.sameStructure': ({ left, right }) => isDeepStrictEqual(left, right),
    'test.sameReference': ({ left, right }) => left === right,
    'test.type': ({ value }) => typeof value,
    'test.fromEntries': ({ entries }) => Object.fromEntries(entries),
    'test.reverse': ({ value }) => [...value].reverse(),
    'test.replace': ({ text, search, replacement }) => text.replace(search, replacement),
    'test.decodeEntities': ({ text }) => text.replace(/&(?:amp|quot|lt|gt);/g,
      entity => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' })[entity]),
    'test.openModel': ({ configuration }) => {
      const id = ++next;
      fixtures.set(id, { configuration, requests: [] });
      return id;
    },
    'test.modelRequests': ({ host }) => fixture(host).requests.slice(),
    'test.model': ({ slot, bindings, brief, host }) => {
      const { configuration, requests } = fixture(host);
      return generateMatterSuggestions(slot, bindings, brief, async (url, init = {}) => {
        requests.push({ url, body: init.body });
        if (url === configuration.tags) return Response.json({ models: configuration.models });
        if (url !== configuration.generate) throw Error('Unconfigured model fixture URL');
        const request = JSON.parse(init.body);
        return Response.json({ model: request.model, done: true, response: JSON.stringify({ items: configuration.items }) });
      });
    },
    'test.repeat': ({ text, count }) => text.repeat(count),
    'test.compare': ({ left, right, operation }) => {
      if (operation === '-') return left - right;
      if (operation === '<') return left < right;
      if (operation === '<=') return left <= right;
      if (operation === '>') return left > right;
      if (operation === '>=') return left >= right;
      throw Error('Unknown numeric comparison');
    },
    'test.entries': ({ value }) => Object.entries(value),
    'test.merge': ({ records }) => Object.assign({}, ...records),
    'test.put': ({ value, key, replacement }) => {
      if (Array.isArray(value)) {
        const output = [...value];
        output[key] = replacement;
        return output;
      }
      return { ...value, [key]: replacement };
    },
    'test.runtime': () => ({ data: runtime.data, manifest: runtime.manifest, identity: runtime.identity,
      compiled: runtime.compiled.map(({ spec, text, result }) => ({ spec, text, result })),
      definitions: runtime.definitions, fragments: runtime.fragments }),
    'test.open': ({ state = [], values = [], storage = [], storageOK = true, writeOK = storageOK, selectors = [], elements = [], fallback }) => {
      const id = ++next;
      const host = { state: new Map(state), values: new Map(values), storage: new Map(storage),
        content: new Map(), files: new Map(), fileReads: [], writes: [], downloads: [], bindings: [] };
      host.writeOK = writeOK;
      host.ports = {
        'runtime.nonce': () => randomBytes(24).toString('hex'),
        'state.get': ({ key }) => host.state.get(key),
        'state.set': ({ key, value }) => { host.state.set(key, value); return true; },
        'storage.read': ({ key }) => ({ ok: storageOK, value: host.storage.get(key) ?? null }),
        'storage.write': effect => {
          host.writes.push(effect);
          if (host.writeOK) host.storage.set(effect.key, effect.value);
          return { ok: host.writeOK };
        },
        'browser.property': ({ ref }) => host.values.get(ref) ?? fallback,
        'browser.write': effect => {
          host.writes.push(effect);
          (effect.name === 'value' ? host.values : host.content).set(effect.ref, effect.value);
          return true;
        },
        'browser.content': ({ ref, html }) => {
          host.content.set(ref, html);
          if (selectors.includes(ref)) {
            const options = html.match(/<option\b[^>]*>/g) ?? [];
            const selected = options.find(option => option.includes('selected=')) ?? options[0];
            host.values.set(ref, selected?.match(/value="([^"]*)"/)?.[1] ?? '');
          }
          return true;
        },
        'browser.fileText': ({ ref }) => { host.fileReads.push(ref); return host.files.get(ref); },
        'browser.on': args => host.bindings.push(args),
        'browser.focus': () => true,
        'browser.delay': () => true,
        'dom.exists': ({ selector }) => elements.includes(selector),
        'download.text': args => { host.downloads.push(args); return true; }
      };
      fixtures.set(id, host);
      return id;
    },
    'test.get': ({ host, store, key }) => fixture(host)[store].get(key),
    'test.set': ({ host, store, key, value }) => { fixture(host)[store].set(key, value); return true; },
    'test.has': ({ host, store, key }) => fixture(host)[store].has(key),
    'test.keys': ({ host, store }) => [...fixture(host)[store].keys()],
    'test.clear': ({ host, store }) => fixture(host)[store].clear(),
    'test.failWrites': ({ host }) => { fixture(host).writeOK = false; return true; },
    'test.effects': ({ host, field }) => fixture(host)[field].slice()
  };
  return { ports, reset: () => fixtures.clear() };
}

module.exports = { createTransport };
