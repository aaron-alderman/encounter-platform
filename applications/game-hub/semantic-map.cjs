'use strict';

// Generate inert source coordinates from a native Encounter application image.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { sourceIndex, lexSource } = require('../encounter-libraries/semantic/source-index.cjs');
const { decode, encode } = require('../encounter-runtime/test/rel-values.mjs');

const [mode, input, destination] = process.argv.slice(2);
assert.ok(['--write', '--check'].includes(mode) && input, 'Use --write or --check with a Game Hub application image');
const image = decode(readFileSync(input, 'utf8'), 'EncounterApplicationImage');
assert.equal(image.declaration, 'game-hub/application.rel');
assert.equal(createHash('sha256').update(encode(image.programme, 'EncounterCompiledProgramme')).digest('hex'), image.programmeSha256);
const index = sourceIndex();
const files = Object.create(null);
const sites = [];
const branches = { when: [2], each: [3], fold: [5], try: [1, 3] };
const events = { when: 'when', assert: 'assert', try: 'catch', port: 'port-end' };

function lines(text) {
  const tokens = lexSource(text);
  let offset = 0;
  let index = 0;
  return text.split('\n').map(line => {
    const end = offset + line.replace(/\r$/u, '').length;
    const parts = [];
    let cursor = offset;
    while (tokens[index]?.start < end) {
      const token = tokens[index++];
      const start = Math.max(cursor, token.start);
      const stop = Math.min(end, token.end);
      if (start < stop) {
        if (cursor < start) parts.push([cursor, start]);
        parts.push([start, stop]);
        cursor = stop;
      }
    }
    if (cursor < end) parts.push([cursor, end]);
    offset += line.length + 1;
    return parts.flat().join('/');
  });
}

for (const [file, { text, sha256 }] of Object.entries(image.files)) {
  if (!/^game-hub\/(?:.+-workbench|asset-recipe|asset-pipeline|world-foundry|desktop)\.encounter$/u.test(file)) continue;
  const { queries } = index.observe(file, sha256, image.files);
  const initial = sites.length;
  for (const process of Object.keys(queries)) {
    function walk(steps, parent) {
      for (const [offset, step] of steps.entries()) {
        const [instruction] = step;
        const address = [...parent, offset];
        const kind = events[instruction];
        if (kind) {
          const port = instruction === 'port' ? step[1] : null;
          const query = port === 'kernel.invoke'
            ? step[2]?.[1]?.find(field => field[0] === 'query')?.[1]?.[1] ?? null : null;
          const diagnostic = instruction === 'assert' ? step[2] : null;
          const { source, lexemeSha256 } = index.resolve({ origin: { file, sha256 }, process, address,
            kind, diagnostic, data: { port } }, image.files);
          sites.push({ id: process + '@' + address.join('.'), process, address: address.join('.'), kind,
            port, query, diagnostic, source, lexemeSha256 });
        }
        for (const branch of branches[instruction] ?? []) walk(step[branch], [...address, branch]);
      }
    }
    if (file === "game-hub/desktop.encounter" && process !== "hub.persist") continue;
    if (file === "game-hub/asset-pipeline.encounter" && process !== "asset.improve") continue;
    if (file === "game-hub/world-foundry.encounter" && process !== "world.compose") continue;
    if (image.programme[process]) walk(image.programme[process], []);
  }
  if (sites.length > initial) files[file] = lines(text);
}
assert.ok(sites.length && sites.some(site => site.port === 'storage.cas'));
const output = destination || path.join(__dirname, 'semantic-map.rel');
const expected = encode({ sites, files }, 'ApplicationData');
if (mode === '--write') writeFileSync(output, expected);
else assert.equal(readFileSync(output, 'utf8'), expected, 'Semantic map differs from the admitted Game Hub image');
console.log('Verified ' + sites.length + ' pinned Encounter statement coordinates.');
