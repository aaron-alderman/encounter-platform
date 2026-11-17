'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createFrontDoor } = require('../../encounter/bootstrap/encounter-source-front.cjs');
const { decode } = require('../../encounter/bootstrap/rel-values.cjs');
const { createTransport } = require('./transport.cjs');

async function main() {
  const [suite] = process.argv.slice(2);
  const suites = fs.readdirSync(__dirname)
    .filter(name => name.endsWith('.encounter') && (!suite || name === suite + '.encounter'))
    .sort();
  if (!suites.length) throw Error(suite ? 'Unknown Encounter test suite: ' + suite : 'No Encounter test suites');
  const transport = await createTransport();
  const ports = transport.ports;
  // Fixture capabilities are scoped to the test admission.
  const front = createFrontDoor({
    basis: 'usewords-assurance',
    profiles: { test: [...Object.keys(ports), 'kernel.invoke'] },
    ports
  });
  for (const file of suites) {
    const source = front.hydrate('tests/' + file, fs.readFileSync(path.join(__dirname, file), 'utf8'));
    const { queries } = decode(source.rel, 'EncounterHydration');
    const entries = Object.keys(queries).filter(name => name.startsWith('test.'));
    if (!entries.length) throw Error('No Encounter test entries in ' + file);
    const handle = front.admit(front.link([source]), { profile: 'test', entries });
    for (const entry of entries) test(entry, async () => {
      try {
        await front.run(handle, entry);
      } finally {
        transport.reset();
      }
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
