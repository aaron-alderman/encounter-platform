'use strict';

// Source coordinates use the same UTF-16 offsets as Encounter's observer.
const { createHash } = require('node:crypto');
const { getSourcePolicyMachine } = require('../../encounter/bootstrap/source-policy-machine.cjs');
const hash = text => createHash('sha256').update(text).digest('hex');

const bodies = {
  when: { 2: 'then' },
  each: { 3: 'steps' },
  fold: { 5: 'steps' },
  try: { 1: 'try', 3: 'catch' }
};
const forms = { when: 'when', assert: 'assert', catch: 'try', 'port-end': 'port' };

function sourceIndex() {
  const files = new Map();
  const observed = new Map();
  const coordinates = new Map();

  function observe(file, sha256, imageFiles) {
    const fileKey = JSON.stringify([file, sha256]);
    if (!observed.has(fileKey)) {
      const { text } = imageFiles[file];
      const observation = getSourcePolicyMachine().observe(file, text);
      if (observation.sourceHash !== sha256) throw Error('Encounter observation differs from the image source pin.');
      const statements = new Map(observation.origins.filter(origin => origin.kind === 'statement')
        .map(origin => [origin.pointer, origin]));
      const pinned = { file, text, sha256, statements, queries: observation.module.queries };
      observed.set(fileKey, pinned);
      files.set(sha256, pinned);
    }
    return observed.get(fileKey);
  }

  function resolve(event, imageFiles) {
    const { file, sha256 } = event.origin;
    const pinned = observe(file, sha256, imageFiles);
    const key = JSON.stringify([file, sha256, event.process, event.address]);
    if (!coordinates.has(key)) {
      let steps = pinned.queries[event.process];
      let pointer = '/queries/' + event.process;
      let statement;
      for (let index = 0; index < event.address.length; index += 2) {
        const offset = event.address[index];
        pointer += '/' + offset;
        statement = steps?.[offset];
        if (index + 1 < event.address.length) {
          const branch = Object.entries(bodies).find(([kind]) => Object.hasOwn(statement ?? {}, kind));
          const field = branch?.[1][event.address[index + 1]];
          steps = statement?.[field];
          pointer += '/' + field;
        }
      }
      const origin = pinned.statements.get(pointer);
      if (!origin || origin.file !== file || origin.synthetic ||
          hash(pinned.text.slice(origin.start, origin.end)) !== origin.lexemeSha256) {
        throw Error('Could not resolve the instruction to pinned Encounter source: ' + pointer);
      }
      const { line, column, start, end, lexemeSha256 } = origin;
      coordinates.set(key, { statement, source: { file, sha256, line, column, start, end }, lexemeSha256 });
    }
    const resolved = coordinates.get(key);
    if (!Object.hasOwn(resolved.statement ?? {}, forms[event.kind]) ||
        (event.kind === 'port-end' && resolved.statement.port !== event.data.port) ||
        (event.kind === 'assert' && resolved.statement.message !== event.diagnostic)) {
      throw Error('The instruction kind or operands differ from pinned Encounter source.');
    }
    return resolved;
  }

  return { files, observe, resolve };
}

function lexSource(text) {
  const lpPolicy = { maxCodeUnits: 160000, maxTokens: 36000 };
  const result = getSourcePolicyMachine().compute('source.lex', { text }, { lpPolicy }).value;
  if (!result.withinLimit) throw Error('Encounter source token bound exceeded.');
  return result.tokens;
}

module.exports = { sourceIndex, lexSource };
