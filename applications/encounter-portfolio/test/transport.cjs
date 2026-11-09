'use strict';

// Test effects and opaque objects. Case data and expected results live in Encounter.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createFrontDoor } = require('../bootstrap/encounter-source-front.cjs');
const { valuePorts } = require('../bootstrap/ports/value.cjs');
const { computationalPorts } = require('../bootstrap/ports/browser-effects.cjs');
const { openStore } = require('../bootstrap/store.cjs');
const rel = require('../bootstrap/rel-values.cjs');
const { createBrowserTransport } = require('./browser-transport.cjs');

const root = path.resolve(__dirname, '..');
const value = { ...valuePorts(), ...computationalPorts() };
const { readApplicationModules } = require('../../../shared/node/application-modules.cjs');
const authoringSources = new Map(readApplicationModules(root, ['source/types.encounter', 'source/actions.encounter'])
  .map(({ file, text }) => [file, text]));
const localRead = file => authoringSources.get(file) ?? fs.readFileSync(path.join(root, file), 'utf8');

function faultAt(cut, interrupt) {
  let fired = false;
  return stage => {
    if (!fired && stage === cut) {
      fired = true;
      interrupt();
    }
  };
}

function createTransport() {
  const objects = new Map();
  const stores = new Set();
  const workspaces = new Set();
  let context = null;
  const keep = object => {
    const id = require('node:crypto').randomUUID();
    objects.set(id, object);
    return { id };
  };
  const resolve = token => {
    if (!objects.has(token?.id)) throw Error('Unknown test transport handle');
    return objects.get(token.id);
  };
  const workspace = () => {
    const parent = fs.realpathSync(os.tmpdir());
    const directory = fs.mkdtempSync(path.join(parent, 'encounter-suite-'));
    workspaces.add(directory);
    return keep(directory);
  };
  const closeStore = token => {
    const store = resolve(token);
    store.close();
    stores.delete(store);
    objects.delete(token.id);
    return null;
  };
  const browser = createBrowserTransport({ root, keep, resolve, workspace });
  const effects = {
    'file.text': ({ file }) => localRead(file),
    'file.names': () => {
      const walk = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.name === '.git') return [];
        const file = prefix + entry.name;
        return entry.isDirectory() ? walk(path.join(directory, entry.name), file + '/') : [{ file, link: entry.isSymbolicLink() }];
      });
      return walk(root);
    },
    'front.open': ({ grants }) => {
      const ports = { ...value, 'source.observe': ({ file, text }, _env, gate) => gate.observe(file, text) };
      return keep(createFrontDoor({ ports, profiles: { probe: grants }, basis: 'encounter-test-probe' }));
    },
    'front.hydrate': ({ front, file, text }) => keep(resolve(front).hydrate(file, text)),
    'front.link': ({ front, candidates, roots }) => keep(resolve(front).link(
      candidates.map(candidate => candidate.id ? resolve(candidate) : candidate), { roots })),
    'front.admit': ({ front, linked, entries }) => keep(resolve(front).admit(
      linked.id ? resolve(linked) : linked, { profile: 'probe', entries })),
    'front.run': async ({ front, admission, entry, input, bindings }) =>
      (await resolve(front).run(resolve(admission), entry, { input, bindings })).value ?? null,
    'handle.copy': ({ handle }) => ({ ...resolve(handle) }),
    'rel.read': ({ text, kind }) => rel.decode(text, kind),
    'scalar.read': ({ text }) => rel.decodeData(text),
    'workspace.open': workspace,
    'store.open': ({ directory, profile, cut }) => {
      const options = { profile };
      if (cut) options.fault = faultAt(cut, () => { throw Error('Lost response'); });
      const store = openStore(resolve(directory), options);
      stores.add(store);
      return keep(store);
    },
    'store.close': ({ store }) => closeStore(store),
    'store.cas': ({ store, input }) => resolve(store).cas(input),
    'store.history': ({ store }) => resolve(store).history(),
    'store.snapshot': ({ store }) => resolve(store).snapshot(),
    'store.operation': ({ store, id }) => resolve(store).operation(id),
    'store.crash': ({ directory, cut, input }) => {
      const worker = spawnSync(process.execPath, [__filename, 'crash', resolve(directory), cut], {
        input: rel.encode(input), encoding: 'utf8', timeout: 30000, windowsHide: true
      });
      if (worker.error) throw worker.error;
      return { code: worker.status, signal: worker.signal, reached: worker.stdout };
    },
    ...browser.ports
  };
  const ports = {
    ...value,
    ...effects,
    'diagnostic.context': ({ value }) => { context = value; return null; },
    'observe.attempt': async ({ operation, arguments: args }) => {
      if (!Object.hasOwn(effects, operation)) throw Error('Unknown test observation');
      try {
        return { ok: true, value: await effects[operation](args) ?? null };
      } catch (error) {
        return { ok: false, message: error.message };
      }
    }
  };
  async function clean() {
    try {
      await browser.clean();
    } finally {
      for (const store of stores) store.close();
      stores.clear();
      objects.clear();
      for (const directory of workspaces) {
        const parent = fs.realpathSync(os.tmpdir());
        if (path.dirname(directory) !== parent || !path.basename(directory).startsWith('encounter-suite-')) {
          throw Error('Refusing to remove an unowned workspace');
        }
        if (fs.lstatSync(directory).isSymbolicLink()) throw Error('Disposable workspace became a link');
        fs.rmSync(directory, { recursive: true });
      }
      workspaces.clear();
    }
  }
  return { ports, clean, diagnostic: () => context, resetDiagnostic: () => { context = null; } };
}

async function worker() {
  const [mode, directory, cut, declarationFile] = process.argv.slice(2);
  if (mode === 'crash') {
    const input = rel.decode(fs.readFileSync(0, 'utf8'));
    const store = openStore(directory, { profile: input.profile,
      fault: faultAt(cut, () => {
        fs.writeSync(1, cut);
        process.kill(process.pid, 'SIGKILL');
      }) });
    try { store.cas(input); } finally { store.close(); }
  } else if (mode === 'serve') {
    const { start } = require('../bootstrap/server.cjs');
    const server = await start({ directory, port: 0, declarationFile: declarationFile || undefined,
      fault: faultAt(cut, () => { throw Error('Engineered lost boundary response'); }) });
    console.log('Encounter ' + server.url);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', async () => { await server.close(); process.exit(0); });
  }
}

if (require.main === module) worker().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { createTransport };
