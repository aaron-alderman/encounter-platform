'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const rel = require('../node/rel-values.cjs');

const filename = 'identity-management-trace.rel';
const reviewedSha256 = '880b7d1291622013c17f41eadb16ae3a86465c5217f04bab3ce634ce8dcc5d14';
const effects = ['browser.formFields', 'browser.property', 'browser.content'];
const refusals = new Map([
  ['/workspace/mobile/', ['Existing route', 'already used by Workspace']],
  ['/game/identity/', ['Reserved namespace', 'existing /game/ route namespace']],
  ['/settings/identity/?view=providers', ['Path without a query', 'Enter a local path']]
]);

function readIdentityTrace(bytes = readFileSync(path.join(__dirname, 'evidence', filename))) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== reviewedSha256) throw Error('Identity Management trace differs from its reviewed pin.');
  const trace = rel.decode(bytes.toString('utf8'), 'IdentityManagementAssuranceTrace');
  const { compiler, observedBrowser } = trace;
  const paths = [...compiler.alternatives, ...refusals.keys(), compiler.published];
  if (!isDeepStrictEqual(observedBrowser.cases.map(row => row.path), paths)) {
    throw Error('Identity Management trace does not cover the reviewed inputs.');
  }
  const cases = observedBrowser.cases.map(row => {
    const current = row.path === compiler.published;
    const refusal = refusals.get(row.path);
    const moves = current || refusal ? [] : compiler.moves;
    const gaps = current || refusal ? [] : compiler.gaps;
    const stays = current ? compiler.references : compiler.stays;
    const covered = compiler.references - gaps.length;
    const counts = refusal ? [] : [
      'Moves · ' + moves.length, 'Stays · ' + stays, 'Coverage gaps · ' + gaps.length
    ];
    const outcome = refusal ? refusal[1] : covered + ' of ' + compiler.references +
      ' references covered in the projection · ' + compiler.checksPerProposal + ' route checks passed';
    const mappingMatches = row.outcome.includes(outcome) && isDeepStrictEqual(row.counts, counts) &&
      isDeepStrictEqual(row.moveIds, moves) && isDeepStrictEqual(row.gapIds, gaps);
    const effectsMatch = row.stayedInHome && isDeepStrictEqual(row.effects, effects) &&
      isDeepStrictEqual(row.mutations, ['compiler-route-result']);
    return {
      ...row, moves, gaps, expected: refusal ? 'Refuse · ' + refusal[0] : counts.join(' / '),
      mapping: mappingMatches ? 'Matches' : 'Difference',
      boundary: effectsMatch ? 'Matches' : 'Difference'
    };
  });
  return { bytes, filename, report: { ...trace, sha256, cases } };
}

module.exports = { readIdentityTrace };
