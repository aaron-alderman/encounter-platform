'use strict';

const { openStore } = require('../../encounter-work-boards/bootstrap/store.cjs');
const { createRunner, main } = require('./runner.cjs');

async function run() {
  const [directory, envelope] = process.argv.slice(2);
  const original = JSON.parse(envelope);
  const store = openStore(directory, { profile: original.profile });
  try {
    const check = createRunner('store-reference', ['test.store'], {
      'store.operation': ({ id }) => store.operation(id),
      'store.snapshot': () => store.snapshot(),
      'store.cas': ({ change }) => store.cas(change),
    });
    console.log(JSON.stringify(await check('test.store', original)));
  } finally {
    store.close();
  }
}

main(run);
