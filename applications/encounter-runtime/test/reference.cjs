'use strict';

// Keep the independent JavaScript Encounter and Temple3 models as oracles.
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { createRunner, main } = require('./runner.cjs');
const bootstrap = path.resolve(__dirname, '../../encounter-work-boards/bootstrap');
const root = path.resolve(__dirname, '..');
const applications = path.dirname(root);
const rel = require(path.join(bootstrap, 'rel-values.cjs'));
const { createFrontDoor } = require(path.join(bootstrap, 'encounter-source-front.cjs'));
const { valuePorts } = require(path.join(bootstrap, 'ports/value.cjs'));
const { nodeRegexp } = require(path.join(bootstrap, 'isolated-regexp.cjs'));
const digest = text => createHash('sha256').update(text).digest('hex');
const read = file => readFileSync(file, 'utf8');

async function run() {
  const { replayJournal } = await import('../../../research/temple3/model/authenticated.mjs');
  const { FileJournal } = await import('../../../research/temple3/model/journal.mjs');
  const { sealGenesis, buildDelta } = await import('../../../research/temple3/model/kernel.mjs');
  const { workgardenNext, workgardenText } = await import('../../../research/temple3/model/workgarden.mjs');
  const [acceptedDir, rejectedDir, expectedTempleId] = process.argv.slice(2);
  const sources = new Map();
  let oracle;
  const observe = (records, replay) => ({
    head: replay.temple.stateRoot,
    sequence: replay.temple.sequence,
    witness: replay.outcomes[0].receipt.payload.witness,
    records: records.length,
  });
  const check = createRunner('reference', ['test.reference'], {
    'reference.inputs': () => ({
      common: rel.parse(read(path.join(root, 'bootstrap/bootstrap.rel'))),
      profile: rel.parse(read(path.join(root, 'profiles/workgarden.rel'))),
      fixture: rel.parse(read(path.join(root, 'fixtures/workgarden.rel'))),
      foundationHash: require(path.join(bootstrap, 'source-policy-machine.cjs')).loadSourcePolicyDescriptor().declaration,
    }),
    'reference.module': ({ file }) => {
      const text = read(path.join(applications, file));
      sources.set(file, text);
      return digest(text);
    },
    'reference.admit': ({ entry, grants, files }) => {
      const front = createFrontDoor({ profiles: { reference: grants }, ports: valuePorts(), basis: 'workgarden-native-reference' });
      const modules = files.map(file => front.hydrate(file, sources.get(file)));
      const handle = front.admit(front.link(modules, { roots: [entry] }), { profile: 'reference', entries: [entry] });
      oracle = async input => (await front.run(handle, entry, { input })).value;
      return true;
    },
    'reference.change': input => oracle(input),
    'reference.replay': async ({ item }) => {
      const accepted = await new FileJournal(acceptedDir).read();
      const rejected = await new FileJournal(rejectedDir).read();
      const acceptedReplay = replayJournal(accepted, { expectedTempleId });
      const rejectedReplay = replayJournal(rejected, { expectedTempleId });
      const genesis = sealGenesis(accepted[0].entry.signed.payload.genesisInput);
      const cell = genesis.state.cells[0];
      const command = { op: 'create', args: [workgardenText(item.title)] };
      const expected = workgardenNext(cell.value, command);
      const delta = buildDelta(genesis, { read: [cell.id], consume: [cell.id], createValues: [expected] });
      return { delta, accepted: observe(accepted, acceptedReplay), rejected: observe(rejected, rejectedReplay) };
    },
  });
  try {
    console.log(JSON.stringify(await check('test.reference')));
  } finally {
    nodeRegexp().close();
  }
}

main(run);
