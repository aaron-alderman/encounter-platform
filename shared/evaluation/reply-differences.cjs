'use strict';

const numeric = Symbol('recorded JSON number');
const missing = Symbol('missing JSON value');

function decimal(source) {
  const [, sign, whole, fraction = '', exponent = '0'] = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const significant = digits.replace(/0+$/, '');
  const power = BigInt(exponent) + BigInt(digits.length - significant.length - fraction.length);
  return sign + significant + 'e' + power;
}

function parseReply(text) {
  return JSON.parse(text, (key, value, context) => typeof value === 'number'
    ? { [numeric]: decimal(context.source), source: context.source }
    : value);
}

function display(value) {
  if (value === missing) return { present: false, text: '' };
  return {
    present: true,
    text: JSON.stringify(value, (key, node) => node?.[numeric] === undefined ? node : JSON.rawJSON(node.source), 2)
  };
}

function replyPairs(lexical, pagerank) {
  const values = [];
  const invalid = [];
  for (const [label, text] of [['Lexical', lexical], ['PageRank', pagerank]]) {
    try { values.push(parseReply(text)); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      invalid.push(label);
    }
  }
  if (invalid.length) return { invalid, pairs: [] };

  const pairs = [];
  const container = value => value !== null && typeof value === 'object' && value[numeric] === undefined;
  const child = (value, key) => Object.hasOwn(value, key) ? value[key] : missing;
  function visit(left, right, pointer) {
    if (container(left) && container(right) && Array.isArray(left) === Array.isArray(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        visit(child(left, key), child(right, key), pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'));
      }
      return;
    }
    const token = value => {
      const shown = display(value);
      const key = !shown.present ? 'missing' : value?.[numeric] !== undefined ? 'number:' + value[numeric] : 'json:' + shown.text;
      return { ...shown, key };
    };
    pairs.push({ path: pointer || '(root)', lexical: token(left), pagerank: token(right) });
  }
  visit(...values, '');
  return { invalid, pairs };
}

module.exports = { replyPairs };
