'use strict';

const { createSourcePolicyBootstrap } = require('../../../shared/node/source-policy-machine.cjs');
const { parseEncounter: readSeed } = require('./seed-source-reader.cjs');
const { createKernel } = require('./temple-seed.cjs');
const { synchronousSeed } = require('./seed-sync.cjs');
const { valuePorts } = require('./ports/value.cjs');
const { computationalPorts } = require('./ports/browser-effects.cjs');
const { trustedRegexObservations } = require('./isolated-regexp.cjs');

module.exports = createSourcePolicyBootstrap({
  bootstrapDirectory: __dirname, readSeed, createKernel, synchronousSeed,
  valuePorts, computationalPorts, trustedRegexObservations,
  observeHtml: text => require('./markup-observation.cjs').observeHtml(text),
});
