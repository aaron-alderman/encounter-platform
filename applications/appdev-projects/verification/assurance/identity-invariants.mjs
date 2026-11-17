// Read-only round trip across the compiler, Home preview, and reviewed trace reader.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../../../../bin/browser-profile.mjs';
import {observeBridge, observeMutations} from './browser-observations.mjs';
import decompiler from '../../../../encounter-platform/shared/evaluation/decompiler.cjs';
import rel from '../../../../encounter-platform/shared/node/rel-values.cjs';

const preview = new URL(process.argv[2]);
assert(preview.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(preview.hostname),
  'Supply the loopback Home preview URL with the interactive Compiler.');
const projects = fileURLToPath(new URL('../../../../', import.meta.url));
const runtime = join(projects, 'encounter-core/target/release/encounter');
const declaration = 'applications/appdev-projects/identity-compiler.rel';
const {baseline, moving, fixed, covered, retained, compiler, findings, sourceSnapshotSha256} =
  JSON.parse(execFileSync(runtime, ['run', '--sources', projects, declaration, 'invariants'], {encoding:'utf8'}));
const {published, alternatives} = compiler;
assert.deepEqual(findings, []);
const packageRoot = process.argv[3];
const captureRel = process.argv[4] === '--capture-rel';
if (captureRel) assert(packageRoot, 'Capturing REL requires the verified Home preview package.');
let releasePin;
let homeFingerprint;
if (packageRoot) {
  const runtime = join(packageRoot, 'encounter');
  execFileSync(runtime, ['check-appdev-release', packageRoot]);
  releasePin = execFileSync(runtime, ['appdev-release-fingerprint', packageRoot], {encoding:'utf8'}).trim();
  homeFingerprint = readFileSync(join(packageRoot, 'index.html'), 'utf8')
    .match(/id="about-build-fingerprint">([a-f0-9]{64})<\/code>/)[1];
}
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
const browserCases = [];
let build;
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const bridge = observeBridge(page);
  await page.addInitScript(() => localStorage.setItem('sourcery.first-run.v1.visibility', 'finished'));
  assert.equal((await page.goto(preview.href)).status(), 200);
  build = await page.locator('#about-build-id').textContent();
  if (homeFingerprint) assert.equal(await page.locator('#about-build-fingerprint').textContent(), homeFingerprint);
  await page.locator('html[data-encounter=ready]').waitFor();
  await page.locator('[data-app-card=semantic-compiler] button[data-desktop-launch]').click();
  const app = page.locator('#semantic-compiler-window');
  await app.getByText('Dry run', {exact:true}).click();
  const input = app.getByLabel('Proposed route');
  const result = app.locator('#compiler-route-result');
  const initial = await input.inputValue();
  assert.equal(initial, published);
  const requests = [];
  page.on('request', request => requests.push(request.method()));
  const outcomes = [
    ...alternatives.map(path => [path, new RegExp(covered + ' of ' + baseline.coverage.observed + ' references covered')]),
    ['/workspace/mobile/', /already used by Workspace/],
    ['/game/identity/', /existing .* route namespace/],
    ['/settings/identity/?view=providers', /Enter a local path/],
    [published, new RegExp(baseline.coverage.modeled + ' of ' + baseline.coverage.observed + ' references covered')],
  ];
  for (const [path, expected] of outcomes) {
    await input.fill(path);
    const before = bridge.position();
    const count = bridge.dispatches.length;
    const mutation = await observeMutations(page, ['#compiler-route-result', '#semantic-compiler-window .compiler-case'], async () => {
      await input.press('Enter');
      await result.getByText(expected).waitFor();
      return await bridge.throughEffect(before, 'browser.content');
    });
    assert.deepEqual(bridge.dispatches.slice(count).map(row => [row.label, row.event]),
      [['Simulate Identity Management move', 'submit']]);
    assert.deepEqual(mutation.mutations, ['compiler-route-result']);
    const effects = mutation.result.filter(row => row.effect).map(row => [row.effect, ...row.selectors]);
    assert.deepEqual(effects, [
      ['browser.formFields', '#compiler-route-form'],
      ['browser.property', '#compiler-route-basis'],
      ['browser.content', '#compiler-route-result'],
    ]);
    if (alternatives.includes(path)) {
      for (const row of [...moving, ...fixed]) await result.getByText(row.id, {exact:true}).waitFor();
      await result.getByRole('heading', {name:'Coverage gaps · ' + fixed.length}).waitFor();
      await result.getByRole('heading', {name:'Stays · ' + retained}).waitFor();
    }
    assert.equal(page.url(), preview.href);
    browserCases.push({
      path, effects:effects.map(row => row[0]), mutations:mutation.mutations,
      outcome: await result.locator('[role=status], [role=alert]').textContent(),
      counts: await result.locator('h4').allTextContents(),
      gapIds: await result.locator('li > strong').allTextContents(),
      moveIds: await result.locator('li > code').allTextContents(),
      stayedInHome: page.url() === preview.href,
    });
  }
  assert.deepEqual(requests, []);
} finally {
  await browser.close();
}

const trace = {
  case: 'Identity Management',
  previewBuild: build,
  ...(releasePin ? {releasePin, homeFingerprint, sourceSnapshotSha256} : {}),
  compiler,
  observedBrowser: {cases:browserCases, httpRequests:0},
  scope: 'Isolated Home preview. Browser observations cover the dry-run UI and its effects. Live ingress and authenticated sign-in are outside this capture.',
};

if (captureRel) {
  process.stdout.write(rel.encode(trace, 'IdentityManagementAssuranceTrace'));
} else {
  const evidence = name => fileURLToPath(new URL('../../../../encounter-platform/shared/evaluation/evidence/decompiler/' + name, import.meta.url));
  const {capture} = decompiler.readBundle(evidence('repair-image.rel.gz'), evidence('repair-run.rel.gz'));
  assert(capture.image && capture.programme && capture.runtime && capture.trace && capture.manifestSha256);
  console.log(JSON.stringify({
    ...trace, reviewedDecompiler: {case:'North River', trace:capture.trace, programme:capture.programme},
  }, null, 2));
}
