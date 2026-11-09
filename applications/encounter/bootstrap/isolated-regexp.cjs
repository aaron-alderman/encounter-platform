'use strict';

const { createNodeRegexp, ...mechanisms } = require('../../../shared/node/isolated-regexp.cjs');
let service;
function nodeRegexp() {
  return service ??= createNodeRegexp();
}

module.exports = { ...mechanisms, nodeRegexp };
