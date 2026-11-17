'use strict';

const fs = require('node:fs');
const { loadRuntime } = require('./runtime.cjs');

async function main() {
  try {
    const runtime = await loadRuntime();
    const [action, file] = process.argv.slice(2);
    if (!file) throw Error('Usage: node bootstrap/cli.cjs <action> <JSON file>');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = (await runtime.run(runtime.manifest.cliEntry, { action, input })).value;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

void main();
