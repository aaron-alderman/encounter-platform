'use strict';
// Run the same mounted file observations through the JS host mechanism.
const { createHash } = require('node:crypto');
const { mountAttachments } = require('../../../shared/node/attachment.cjs');
const [root, input] = process.argv.slice(2);
const read = mountAttachments(root);
const observations = JSON.parse(input).map(descriptor => {
  const attachment = read(descriptor);
  return attachment && { bytes: attachment.body.length,
    sha256: createHash('sha256').update(attachment.body).digest('hex'),
    disposition: attachment.disposition };
});
console.log(JSON.stringify(observations));
