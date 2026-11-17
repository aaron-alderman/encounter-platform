'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  renameSync, rmSync, writeFileSync
} = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const args = process.argv.slice(2);
assert.equal(args.length, 4,
  'Usage: node build-release.cjs <encounter-runtime> <gateway-runtime> <operator-launch.rel> <new-package>');
const [encounter, gateway, config, output] = args.map(file => resolve(file));
assert.ok(!existsSync(output), 'Choose a new package directory');

const staging = mkdtempSync(join(dirname(output), '.game-hub-build-'));
const release = join(staging, 'game-hub');
const source = join(release, 'source');
const declaration = 'game-hub/application.rel';
const mappingInput = join(staging, 'mapping-input.rel');

function copySource(name, root) {
  assert.match(name, /^(?:game-hub|encounter|encounter-libraries)\/(?:[\w.-]+\/)*[\w.-]+\.(?:encounter|rel)$/);
  assert.ok(!name.split('/').includes('..'), 'Source must remain inside the application workspace');
  const destination = join(root, name);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(__dirname, '..', name), destination);
}

function modules(file) {
  return [...readFileSync(file, 'utf8').matchAll(/^\("application", "module", "([^"]+)"\)$/gm)]
    .map(([, name]) => name);
}

function node(script, ...args) {
  execFileSync(process.execPath, [join(__dirname, script), ...args], { stdio: 'inherit' });
}

try {
  copySource(declaration, source);
  for (const name of modules(join(source, declaration))) copySource(name, source);
  const application = join(source, 'game-hub');
  const assets = join(release, 'assets');
  cpSync(join(__dirname, 'asset-viewer'), join(application, 'asset-viewer'), { recursive: true });
  cpSync(join(__dirname, 'assets'), assets, { recursive: true });
  node('stage-viewer.cjs', assets, join(application, 'asset-viewer.rel'));

  // The initial image provides source coordinates for the final image.
  writeFileSync(join(application, 'semantic-map.rel'), readFileSync(join(__dirname, 'semantic-map.rel')));
  execFileSync(encounter, ['build', source, declaration, mappingInput], { stdio: 'inherit' });
  node('semantic-map.cjs', '--write', mappingInput, join(application, 'semantic-map.rel'));
  const image = join(release, 'game-hub.rel');
  execFileSync(encounter, ['build', source, declaration, image], { stdio: 'inherit' });
  node('semantic-map.cjs', '--check', image);
  const pin = createHash('sha256').update(readFileSync(image)).digest('hex');

  const gatewayDeclaration = 'game-hub/https.rel';
  const gatewaySource = join(release, 'gateway');
  copySource(gatewayDeclaration, gatewaySource);
  for (const name of modules(join(gatewaySource, gatewayDeclaration))) copySource(name, gatewaySource);
  for (const [binary, name] of [[encounter, 'encounter'], [gateway, 'gateway-runtime']]) {
    const destination = join(release, name);
    copyFileSync(binary, destination);
    chmodSync(destination, 0o755);
  }

  const replacements = new Map([['image', 'game-hub.rel'], ['sha256', pin], ['attachmentRoot', 'assets']]);
  const launch = readFileSync(config, 'utf8').replace(
    /^\("launch", "([\w]+)", ("(?:[^"\\]|\\.)*")\)$/gm,
    (line, key, value) => {
      if (replacements.has(key)) {
        const replacement = replacements.get(key);
        replacements.delete(key);
        return `("launch", "${key}", ${JSON.stringify(replacement)})`;
      }
      if (['store', 'operators', 'gameKernel'].includes(key)) {
        return `("launch", "${key}", ${JSON.stringify(resolve(dirname(config), JSON.parse(value)))})`;
      }
      return line;
    }
  );
  assert.equal(replacements.size, 0, 'Operator launch must declare image, sha256 and attachmentRoot');
  writeFileSync(join(release, 'launch.rel'), launch, { mode: 0o600 });
  execFileSync(encounter, ['check-package', release], { stdio: 'inherit' });
  execFileSync(gateway, ['check-package', gatewaySource], { stdio: 'inherit' });
  renameSync(release, output);
  console.log(output);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
