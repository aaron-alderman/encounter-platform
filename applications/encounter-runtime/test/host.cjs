'use strict';

const { spawn, execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const images = new Map();

function installedImage(release, root, declaration) {
  const catalog = readFileSync(path.join(__dirname, '../release-applications.rel'), 'utf8').trim().split('\n');
  const application = catalog.map(row => /^\("([a-z0-9-]+)", "([a-z0-9-]+)", "([a-z0-9/.-]+)"\)$/.exec(row))
    .find(row => row && row[2] === path.basename(root) && row[3] === declaration);
  if (!application) throw Error('No release image for ' + root + '/' + declaration);
  const app = application[1];
  const fields = readFileSync(path.join(release, 'release.rel'), 'utf8').trim().split('\n');
  const image = 'images/' + app + '.rel';
  const pins = fields.filter(row => row.startsWith(`("${app}", "sha256", `));
  const pin = pins.length === 1 && /"([a-f0-9]{64})"\)$/.exec(pins[0])?.[1];
  if (!fields.includes(`("${app}", "image", "${image}")`) || !pin) {
    throw Error('Missing image or pin in release.rel for ' + app);
  }
  return { file: path.join(release, image), pin };
}

function startHost(root, { directory, declaration, cut, attachmentRoot }) {
  const executable = cut ? process.env.ENCOUNTER_RUST_FAULT_HOST : process.env.ENCOUNTER_RUST_HOST;
  if (!executable) throw Error('Select the Rust test host executable.');
  const manifest = path.relative(root, path.resolve(root, declaration));
  let args = ['serve', '--declaration', root, manifest, directory, '0'];
  const release = cut ? undefined : process.env.ENCOUNTER_RUST_RELEASE;
  let image;
  if (release) {
    if (executable !== path.join(release, 'bin/encounter')) throw Error('Select the installed release executable.');
    image = installedImage(release, root, manifest);
  } else if (process.env.ENCOUNTER_RUST_IMAGE === '1' || attachmentRoot) {
    const key = JSON.stringify([executable, root, manifest, directory]);
    image = images.get(key);
    if (!image) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, 'application-image.rel');
      const pin = execFileSync(executable, ['build', root, manifest, file], {encoding: 'utf8'}).trim();
      if (!/^[a-f0-9]{64}$/.test(pin)) throw Error('Rust build did not return an image pin.');
      image = {file, pin};
      images.set(key, image);
    }
  }
  if (image) args = ['serve', '--image', image.file, image.pin, directory, '0'];
  if (attachmentRoot) {
    const config = path.join(directory, 'attachment-launch.rel');
    const fields = { version: 'encounter/launch/1', mode: 'image', image: image.file,
      sha256: image.pin, store: directory, port: '0', attachmentRoot: path.resolve(attachmentRoot) };
    const rows = Object.entries(fields).map(([key, value]) => `("launch", "${key}", ${JSON.stringify(value)})`);
    writeFileSync(config, rows.join('\n') + '\n', { mode: 0o600 });
    args = ['--config', config, 'serve'];
  }
  const child = spawn(executable, args, {
    cwd: release,
    env: release ? { PATH: '/nonexistent' } : { ...process.env, ENCOUNTER_TEST_CUT: cut ?? '' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  let timer;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Rust server readiness timed out: ' + stderr)), 20000);
    child.once('error', reject);
    let stdout = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const match = /^Encounter (http:\/\/127\.0\.0\.1:\d+)\s*$/m.exec(stdout);
      if (match) resolve(match[1]);
    });
    exited.then(exit => reject(Error('Rust server exited before readiness: ' + exit.code + '\n' + stderr)));
  }).finally(() => clearTimeout(timer));

  async function stop() {
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.on('error', () => {});
      child.stdin.end('close\n');
    }
    const deadline = setTimeout(() => child.kill(), 5000);
    try { return await exited; } finally { clearTimeout(deadline); }
  }
  return { ready, stop };
}

async function start(root, options) {
  const host = startHost(root, options);
  try {
    return { url: await host.ready, close: host.stop };
  } catch (error) {
    await host.stop();
    throw error;
  }
}

module.exports = { startHost, start };
