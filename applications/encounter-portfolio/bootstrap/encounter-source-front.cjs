'use strict';

const { createHash } = require('node:crypto');
const { sourceFrontMechanisms } = require('../../../shared/node/encounter-source-front.cjs');
const rel = require('./rel-values.cjs');
const { createKernel } = require('./temple-seed.cjs');
const { getSourcePolicyMachine } = require('./source-policy-machine.cjs');
const { nodeRegexp } = require('./isolated-regexp.cjs');

function createFrontDoor(options) {
  return sourceFrontMechanisms({
    createKernel, rel, policy: getSourcePolicyMachine(), regexp: nodeRegexp(),
    hash: text => createHash('sha256').update(text).digest('hex'),
  }).createFrontDoor(options);
}

module.exports = { createFrontDoor, sourceFrontMechanisms };
