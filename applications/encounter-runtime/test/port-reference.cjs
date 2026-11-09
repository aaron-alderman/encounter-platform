'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createRunner, main } = require('./runner.cjs');
const rel = require('../../encounter-work-boards/bootstrap/rel-values.cjs');
const { createFrontDoor } = require('../../encounter-work-boards/bootstrap/encounter-source-front.cjs');
const { valuePorts } = require('../../encounter-work-boards/bootstrap/ports/value.cjs');
const { computationalPorts } = require('../../encounter-work-boards/bootstrap/ports/browser-effects.cjs');
const { nodeRegexp } = require('../../encounter-work-boards/bootstrap/isolated-regexp.cjs');

async function run() {
  const root = path.resolve(__dirname, '..');
  const fixture = path.join(root, 'fixtures/port-conformance');
  const read = file => readFileSync(file, 'utf8');
  let oracle;
  const check = createRunner('port-reference', ['test.ports'], {
    'reference.contracts': () => ({
      application: rel.parse(read(path.join(fixture, 'application.rel'))),
      platform: rel.parse(read(path.join(root, 'spec/platform.rel'))),
      ports: rel.parse(read(path.join(root, 'spec/application-ports.rel'))),
    }),
    'reference.admit': ({ grants, modules, entries }) => {
      const front = createFrontDoor({
        profiles: { conformance: grants },
        ports: {
          ...valuePorts(), ...computationalPorts(),
          'rel.encode': ({ value, kind }) => rel.encode(value, kind),
          'rel.decode': ({ text, kind }) => rel.decode(text, kind),
        },
        basis: 'encounter-platform-conformance',
      });
      const sources = modules.map(file => front.hydrate(file, read(path.join(fixture, file))));
      const handle = front.admit(front.link(sources, { roots: entries }), { profile: 'conformance', entries });
      oracle = async entry => (await front.run(handle, entry, { input: null })).value;
      return true;
    },
    'reference.probe': ({ entry }) => oracle(entry),
  });
  try {
    console.log(JSON.stringify(await check('test.ports')));
  } finally {
    nodeRegexp().close();
  }
}

main(run);
