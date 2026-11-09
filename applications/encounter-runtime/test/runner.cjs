'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFrontDoor } = require('../../encounter/bootstrap/encounter-source-front.cjs');
const { valuePorts } = require('../../encounter/bootstrap/ports/value.cjs');
const { nodeRegexp } = require('../../encounter/bootstrap/isolated-regexp.cjs');

function createRunner(suite, entries, native, support = []) {
  const files = [suite, ...support].map(name => 'test/programmes/' + name + '.encounter');
  const ports = { ...valuePorts(), ...native };
  const front = createFrontDoor({ profiles: { suite: Object.keys(ports) }, ports, basis: 'encounter-runtime/' + suite });
  const sources = files.map(file => front.hydrate(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8')));
  const handle = front.admit(front.link(sources, { roots: entries }), { profile: 'suite', entries });
  return async (entry, input) => (await front.run(handle, entry, { input })).value;
}

function main(run) {
  run().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  }).finally(() => nodeRegexp().close());
}

module.exports = { createRunner, main };
