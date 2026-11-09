'use strict';

const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { decode, parse } = require('../../encounter-claimipedia/bootstrap/rel-values.cjs');
const { createRunner, main } = require('./runner.cjs');

async function run() {
  const app = path.resolve(__dirname, '../../encounter-claimipedia');
  const transfer = path.resolve(__dirname, '../../../claimipedia-source');
  const legacy = path.join(transfer, 'sourcery-applications/applications/claimipedia');
  const product = 'products/claimipedia';
  const legacyExports = {
    'frontier-claims.rel': ['frontier-claims.mjs', 'FRONTIER_CLAIMS', 'validateFrontierClaims'],
    'frontier-research-arms.rel': ['frontier-research-arms.mjs', 'FRONTIER_RESEARCH_ARMS', 'validateFrontierResearchArms'],
  };
  const normal = value => JSON.parse(JSON.stringify(value));
  const check = createRunner('reconcile-claimipedia', ['test.reconcile'], {
    'transfer.verify': () => {
      const result = spawnSync('sha256sum', ['--quiet', '-c', '.migration/SHA256SUMS'], { cwd: transfer, encoding: 'utf8' });
      if (result.error) throw result.error;
      if (result.stderr) process.stderr.write(result.stderr);
      return result.status;
    },
    'transfer.compareBytes': async ({ source, output }) => {
      const bytes = await readFile(path.join(app, output));
      return { same: bytes.equals(await readFile(path.join(transfer, source))), text: bytes.toString('utf8') };
    },
    'transfer.legacy': async ({ file }) => {
      const [module, name, validator] = legacyExports[file];
      const exports = await import(pathToFileURL(path.join(legacy, module)));
      const value = exports[name];
      return { value, verification: exports[validator](value) };
    },
    'transfer.data': async ({ file }) => decode(await readFile(path.join(app, product, file), 'utf8'), 'ApplicationData'),
    'transfer.facts': async ({ file }) => parse(await readFile(path.join(app, product, file), 'utf8')),
    'transfer.parse': ({ text }) => parse(text),
    'transfer.inbox': () => readFile(path.join(legacy, 'research-inbox.rel'), 'utf8'),
    'transfer.json': ({ text }) => JSON.parse(text),
    'transfer.equal': ({ left, right }) => isDeepStrictEqual(normal(left), normal(right)),
    'transfer.manifest': async () => (await readFile(path.join(transfer, '.migration/SHA256SUMS'), 'utf8')).trimEnd().split('\n'),
    'transfer.artifact': async ({ source, linkedText }) => {
      const bytes = await readFile(path.join(transfer, source));
      return { title: path.basename(source), bytes: bytes.length, same: linkedText !== null && Buffer.from(linkedText).equals(bytes) };
    },
    'digest.sha256': ({ text }) => createHash('sha256').update(text).digest('hex'),
    'test.report': ({ text }) => { console.log(text); return true; },
  });
  await check('test.reconcile');
}

main(run);
