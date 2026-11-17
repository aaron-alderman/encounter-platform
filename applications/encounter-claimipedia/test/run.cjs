'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFrontDoor } = require('../bootstrap/encounter-source-front.cjs');
const { getSourcePolicyMachine } = require('../bootstrap/source-policy-machine.cjs');
const { nodeRegexp } = require('../bootstrap/isolated-regexp.cjs');
const { createTransport } = require('./transport.cjs');

async function main() {
  const directory = path.join(__dirname, 'programmes');
  const sources = fs.readdirSync(directory).filter(file => file.endsWith('.encounter')).sort()
    .map(file => ({ file: 'test/programmes/' + file, text: fs.readFileSync(path.join(directory, file), 'utf8') }));
  const machine = getSourcePolicyMachine();
  const cases = sources.flatMap(({ file, text }) => {
    const compilation = machine.compile(file, text).value;
    if (!compilation.ok) throw Error(file + ': ' + require('node:util').inspect(compilation.diagnostic));
    return Object.keys(compilation.surface.queries).filter(name => name.startsWith('test.'));
  }).sort();
  if (!cases.length) throw Error('No Encounter tests found');
  let failures = 0;
  console.log('TAP version 13');
  console.log('1..' + cases.length);
  // All scenarios share the same admitted suite. Each gets fresh transport state.
  const { ports, clean, diagnostic, resetDiagnostic } = createTransport();
  const front = createFrontDoor({ profiles: { suite: Object.keys(ports) }, ports, basis: 'encounter-restart-verification' });
  const handle = front.admit(front.link(sources.map(({ file, text }) => front.hydrate(file, text)), { roots: cases }),
    { profile: 'suite', entries: cases });
  for (const [index, name] of cases.entries()) {
    resetDiagnostic();
    try {
      try {
        await front.run(handle, name);
      } finally {
        await clean();
      }
      console.log('ok ' + (index + 1) + ' - ' + name);
    } catch (error) {
      failures++;
      console.log('not ok ' + (index + 1) + ' - ' + name);
      console.log('  ---\n  message: ' + JSON.stringify(error.message) +
        '\n  context: ' + JSON.stringify(diagnostic()) + '\n  ...');
    }
  }
  console.log('# tests ' + cases.length + '\n# pass ' + (cases.length - failures) + '\n# fail ' + failures);
  process.exitCode = failures ? 1 : 0;
}

main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
}).finally(() => nodeRegexp().close());
