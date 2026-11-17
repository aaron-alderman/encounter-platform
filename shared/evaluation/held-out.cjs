'use strict';

const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { loadHeldOut } = require('./run.cjs');
const { readBundle } = require('./decompiler.cjs');

async function readHeldOut(directory, revision) {
  if (!existsSync(directory)) return null;
  const evaluate = loadHeldOut();
  const suite = await evaluate('heldOut.suite', null);
  const pins = await evaluate('heldOut.pins', revision);
  const cases = [];
  const bundles = new Map();
  for (const scenario of suite.cases) {
    const manifest = pins[scenario.id];
    if (!/^[a-f0-9]{64}$/.test(manifest)) throw Error('Missing held-out manifest pin for ' + scenario.id);
    const bundle = readBundle(path.join(directory, 'repair-image.rel.gz'),
      path.join(directory, scenario.id, 'repair-run.rel.gz'), manifest, scenario);
    const { capture, imageFiles } = bundle;
    bundles.set(scenario.id, bundle);
    if (capture.model !== suite.model || capture.digest !== suite.digest ||
        cases.some(prior => prior.selector !== capture.selector || prior.index !== capture.index ||
          prior.image !== capture.image || prior.runtime !== capture.runtime)) {
      throw Error('Held-out pairs do not share the same model, selector, index, image and runtime.');
    }
    for (const arm of capture.comparison.arms) {
      const sessionCase = scenario.patches.some(patch => patch.id === 'sessions');
      if (revision === 'access-refusal' && sessionCase && arm.refusalCheck !== (arm.outcome === 'admissible')) {
        throw Error('Held-out session repair did not record the expected explicit refusal check.');
      }
      arm.review = await evaluate('heldOut.review', createHash('sha256').update(arm.reply).digest('hex'));
      await evaluate('heldOut.check', {
        ...arm.observation, outcome: arm.outcome, expectedIssues: new Set(scenario.patches.map(patch => patch.id)).size
      });
    }
    cases.push({ ...scenario, ...capture, imageFiles });
  }
  return { model: suite.model, digest: suite.digest, cases, bundles };
}

module.exports = { readHeldOut };
