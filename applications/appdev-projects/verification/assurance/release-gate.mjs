import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '../../../../../bin/browser-profile.mjs';
import { observeBridge, observeWasmExports } from './browser-observations.mjs';
import { frontGateClock, observeFrontGateRefresh, verifyDesktopActivation } from './interactions.mjs';

async function verifyCandidate(release, origin) {
  const catalog = await readFile(join(release, 'browser-wasm.rel')).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (process.env.ENCOUNTER_VERIFY_BROWSER_WASM === '1') {
    assert(catalog, 'Wasm Assurance requires a pinned Home browser catalog');
  }
  const paths = ['/_encounter/browser.mjs'];
  if (catalog) paths.push('/_encounter/browser.mjs?wasm=1');
  const pin = catalog ? createHash('sha256').update(catalog).digest('hex') : null;
  const scripts = new Map();
  for (const path of paths) {
    const url = origin + path;
    const response = await fetch(url, {redirect:'error'});
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('X-Encounter-Browser-Wasm'), pin, path);
    if (pin) assert.equal(response.headers.get('Cache-Control'), 'no-store', path);
    scripts.set(url, await response.text());
  }
  if (pin) {
    const [canonical, explicit] = scripts.values();
    assert.equal(explicit, canonical, 'Home bridge aliases must serve the same pinned script');
    for (const module of ['countdown', 'interaction', 'assurance']) {
      const name = module[0].toUpperCase() + module.slice(1);
      const bytes = await readFile(join(release, 'browser-wasm', module, 'browser.wasm'));
      assert(canonical.includes("const encounter" + name + "Wasm = '" + bytes.toString('base64') + "';"),
        'Home bridge differs from the packaged ' + module + ' module');
      assert(!canonical.includes('encounterLegacy' + name),
        'Pinned Home bridge includes the ' + module + ' compatibility implementation');
    }
  }
  const browser = await chromium.launch({headless:true, args:['--disable-features=LocalNetworkAccessChecks']});
  try {
    const pages = await Promise.all(['index.html','browser-assets/index.html'].map(name => readFile(join(release,name),'utf8')));
    let observations;
    for (const html of new Set(pages)) {
      const candidate = await verifyHome(browser, origin, html, scripts, release, Boolean(catalog));
      if (observations) assert.deepEqual(candidate, observations);
      else observations = candidate;
    }
    return observations;
  } finally {
    await browser.close();
  }
}

async function verifyHome(browser, origin, html, scripts, release, wasm) {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(8000);
  if (process.env.APPDEV_ASSURANCE_DEBUG) {
    page.on('console', message => console.error(message.type(), message.text()));
    page.on('pageerror', error => console.error(error));
  }
  try {
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    assert(style, 'Candidate Home has no stylesheet');
    const hash = createHash('sha256').update(style).digest('base64');
    const scriptPolicy = wasm ? "'self' 'wasm-unsafe-eval'" : "'self'";
    const bridge = observeBridge(page);
    if (wasm) {
      await observeWasmExports(page, ['bindingAllowed', 'tick'], 'assuranceCountdownCalls');
      await observeWasmExports(page, ['activate'], 'assuranceInteractionCalls');
    }
    await page.route('**/*', route => route.fulfill({status:404,body:''}));
    await page.route(origin + '/workspace/home', route => route.fulfill({contentType:'text/html; charset=utf-8',body:html,headers:{
      'content-security-policy':`default-src 'none'; script-src ${scriptPolicy}; connect-src 'self'; style-src 'sha256-${hash}'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
    }}));
    for (const [url, body] of scripts) {
      await page.route(url, route => route.fulfill({contentType:'text/javascript',body}));
    }
    await page.route(origin + '/workspace/session', route => route.fulfill({json:{xAvailable:false}}));
    await page.route(url => url.origin === origin && url.pathname === '/identity-management/' &&
      url.searchParams.get('view') === 'assurance-program',
      route => route.fulfill({contentType:'text/html', body:'<section aria-label="Decision history">Assurance fixture ready</section>'}));
    await page.addInitScript(() => {
      localStorage.setItem('sourcery.first-run.v1.visibility', 'finished');
      localStorage.setItem('sourcery.front-gate.auto-refresh', '15');
      window.assuranceRequests = 0;
      window.assuranceReading = {
        schema:'encounter/front-gate-status/1', time:'09:00:00',
        services:[
          {id:'visible-fixture',group:'Apps',name:'Visible fixture',detail:'Original visible detail',online:true},
          {id:'hidden-fixture',group:'Apps',name:'Hidden fixture',detail:'Original hidden detail',online:false},
        ],
        units:[{scope:'system',names:['fixture.service']},{scope:'user',names:[]}], timers:[],
      };
      const original = window.fetch;
      window.fetch = (input, options) => {
        const url = new URL(input, location.href);
        if (url.hostname !== 'localhost' || url.pathname !== '/front-gate/status-data') return original(input, options);
        window.assuranceRequests++;
        return Promise.resolve(Response.json(window.assuranceReading));
      };
    });
    await page.clock.install();
    assert.equal((await page.goto(origin + '/workspace/home')).status(), 200);
    await page.locator('html[data-encounter="ready"]').waitFor();
    await page.locator('label[for="tab-operations"]').click();
    await page.locator('#notes-assurance-launch').click();
    await page.getByText('Assurance fixture ready',{exact:true}).waitFor();
    const desktop = await verifyDesktopActivation(page, bridge, {workspace:'workspace', windowId:'notes-assurance-window'});
    await page.locator('#notes-assurance-close').click();
    await page.locator('#notes-assurance-window').waitFor({state:'hidden'});
    const catalogue = await verifySystemCatalogue(page, release);
    await page.locator('.shortcuts button[data-desktop-launch="front-gate"]').click();
    const gate = await verifyFrontGate(page, bridge);
    if (wasm) {
      const calls = await page.evaluate(() => ({...window.assuranceCountdownCalls, ...window.assuranceInteractionCalls}));
      for (const name of ['bindingAllowed', 'tick', 'activate']) {
        assert(calls[name] > 0, 'Home did not execute Wasm ' + name);
      }
    }
    return {...desktop, ...catalogue, ...gate};
  } finally {
    await page.context().close();
  }
}

async function verifySystemCatalogue(page, release) {
  const window = page.locator('#system-catalogue-window');
  await page.locator('#system-catalogue-launch').click();
  await window.waitFor();
  assert.equal(await window.getAttribute('data-window-type'), 'document');
  const relationships = window.getByRole('region', {name:'How Home fits together'});
  await relationships.getByText('Home shell renders Sourcery Workspace (launcher window)', {exact:true}).waitFor();
  await relationships.getByText('System Catalogue opens in System Catalogue window (app window)', {exact:true}).waitFor();
  const tree = window.getByRole('navigation', {name:'System structure'});
  const os = tree.locator(':scope > ul > li > [data-catalogue-node="os"]');
  const home = os.locator(':scope > ul > li > [data-catalogue-node="home"]');
  const app = home.locator(':scope > ul > li > [data-catalogue-node="app-design"]');
  const frame = app.locator(':scope > ul > li > [data-catalogue-node="window-notes-design-demo-window"]');
  await os.locator(':scope > dl').getByText('Operating environment', {exact:true}).waitFor();
  await frame.waitFor({state:'hidden'});
  await home.locator(':scope > summary').press('Enter');
  await home.locator(':scope > dl').getByText('Personal desktop', {exact:true}).waitFor();
  await app.locator(':scope > summary').click();
  await app.locator(':scope > dl').getByText('Desktop app', {exact:true}).waitFor();
  await frame.locator(':scope > summary').press('Space');
  const criteria = frame.locator(':scope > dl');
  await criteria.getByText('Admissibility criteria', {exact:true}).waitFor();
  await criteria.getByText('Compact window', {exact:true}).waitFor();
  await criteria.getByText('Title and window controls (required)', {exact:true}).waitFor();
  await criteria.getByText('Actions (optional)', {exact:true}).waitFor();
  const shell = home.locator(':scope > ul > li > [data-catalogue-node="home-shell"]');
  await shell.locator(':scope > summary').click();
  await shell.locator(':scope > dl').getByText('Desktop shell', {exact:true}).waitFor();
  const launcher = shell.locator(':scope > ul > li > [data-catalogue-node="window-workspace"]');
  await launcher.locator(':scope > summary').click();
  const launcherDetails = launcher.locator(':scope > dl');
  await launcherDetails.getByText('Document window', {exact:true}).waitFor();
  await launcherDetails.getByText('Workspace launcher', {exact:true}).waitFor();
  await launcherDetails.getByText('Maximize / Restore, Minimize', {exact:true}).waitFor();
  await launcherDetails.getByText(/Home stays open. This window has no Close control/).waitFor();
  const catalogueApp = home.locator(':scope > ul > li > [data-catalogue-node="app-system-catalogue"]');
  await catalogueApp.locator(':scope > summary').click();
  const catalogueWindow = catalogueApp.locator(':scope > ul > li > [data-catalogue-node="window-system-catalogue-window"]');
  await catalogueWindow.locator(':scope > summary').click();
  const catalogueDetails = catalogueWindow.locator(':scope > dl');
  await catalogueDetails.getByText('Document window', {exact:true}).waitFor();
  await catalogueDetails.getByText('Maximize / Restore, Minimize, Close', {exact:true}).waitFor();
  await catalogueDetails.getByText(/Close removes the taskbar entry/).waitFor();
  const platform = os.locator(':scope > ul > li > [data-catalogue-node="platform"]');
  await platform.locator(':scope > summary').click();
  await platform.locator(':scope > dl').getByText('The signed-in Temple email must match the configured Platform steward.', {exact:true}).waitFor();
  await home.locator(':scope > summary').click();
  await frame.waitFor({state:'hidden'});
  await verifyCatalogueSource(page, os, release);
  const apps = window.locator('[data-catalogue-section="apps"]');
  const customization = apps.locator('[data-catalogue-app="design"]');
  await customization.getByText('Explicit window type admitted', {exact:true}).waitFor();
  const detail = window.locator('#system-catalogue-detail');
  assert(await detail.evaluate(node => node.scrollWidth <= node.clientWidth),
    'System Catalogue app details must fit the reading pane');
  await customization.getByText('notes-design-demo-window', {exact:true}).waitFor();
  await customization.getByText('notes-design-demo-task', {exact:true}).waitFor();
  assert.match(await customization.locator('summary').innerText(), /compact/);
  await apps.locator('[data-catalogue-app="system-catalogue"] > summary').click();
  await apps.getByText('system-catalogue-window', {exact:true}).waitFor();

  const variants = window.locator('[data-catalogue-section="file-viewer-variants"]');
  await variants.locator(':scope > summary').click();
  await variants.getByText('Release source excerpt', {exact:true}).click();
  await variants.getByText('System Catalogue · Rule source', {exact:true}).waitFor();
  await variants.getByText('App source browser', {exact:true}).click();
  await variants.getByText('App authoring · Encounter source', {exact:true}).waitFor();

  const windows = window.locator('[data-catalogue-section="windows"]');
  await windows.locator(':scope > summary').click();
  await windows.getByRole('heading', {name:'Document window',exact:true}).waitFor();
  const workspace = windows.locator('[data-catalogue-shell="workspace"]');
  await workspace.getByRole('heading', {name:'Sourcery Workspace',exact:true}).waitFor();
  await workspace.getByText('Maximize / Restore, Minimize', {exact:true}).waitFor();
  const workspaceControls = page.locator('#workspace > .titlebar [data-window-control]');
  assert.deepEqual(await workspaceControls.evaluateAll(nodes => nodes.map(node => node.dataset.windowControl)),
    ['maximize', 'minimize']);
  const catalogueControls = window.locator(':scope > .titlebar [data-window-control]');
  assert.deepEqual(await catalogueControls.evaluateAll(nodes => nodes.map(node => node.dataset.windowControl)),
    ['maximize', 'minimize', 'close']);
  assert.equal(await catalogueControls.first().getAttribute('aria-label'), 'Maximize or restore System Catalogue');
  await windows.locator('[data-catalogue-window="compact"]').getByText('Actions (optional)', {exact:true}).waitFor();
  const elements = window.locator('[data-catalogue-section="elements"]');
  await elements.locator(':scope > summary').click();
  await elements.locator('[data-catalogue-element="source"] > summary').click();
  await elements.getByText('Shared role · Use the shared lexer, line numbering and syntax roles. Source text and highlighting are separately editable.', {exact:true}).waitFor();
  const styles = window.locator('[data-catalogue-section="styles"]');
  await styles.locator(':scope > summary').click();
  await styles.getByText('--sourcery-font', {exact:true}).waitFor();
  const syntax = window.locator('[data-catalogue-section="syntax"]');
  await syntax.locator(':scope > summary').click();
  await syntax.getByText('--sp-light-type', {exact:true}).waitFor();
  assert.equal(await window.locator('.catalogue-groups > details[open]').count(), 1);
  await window.getByRole('button', {name:'Minimize System Catalogue',exact:true}).click();
  await window.waitFor({state:'hidden'});
  await page.locator('#system-catalogue-task').click();
  await syntax.getByText('--sp-light-type', {exact:true}).waitFor();
  await window.getByRole('button', {name:'Close System Catalogue',exact:true}).click();
  await window.waitFor({state:'hidden'});
  return {'system-catalogue-sections': await window.locator('.catalogue-groups > details').count()};
}

async function verifyCatalogueSource(page, os, release) {
  const relative = 'version-programme/applications/appdev-projects/workspace.encounter';
  const artifact = 'spec/catalogue-source/' + relative + '/workspace.environmentPolicy.encounter';
  const path = 'Platform/Releases/Home/' + artifact;
  const original = await readFile(join(release, relative), 'utf8');
  const line = original.split(/\r\n|\n|\r/).indexOf('process workspace.environmentPolicy:') + 1;
  const text = await readFile(join(release, artifact), 'utf8');
  assert(line > 1 && Buffer.byteLength(text) <= 4096, 'the indexed excerpt must fit the production preview limit');
  const firstLine = Number(/^# catalogue-source ([0-9]+)\n/.exec(text)?.[1]);
  assert.equal(text.split('\n')[line - firstLine + 1], 'process workspace.environmentPolicy:');
  const file = {id:createHash('sha256').update(path).digest('hex'), name:'workspace.environmentPolicy.encounter',
    path, kind:'release-artifact', viewer:'text'};
  let admitted = true;
  const url = value => value.pathname === '/workspace/files';
  const requests = [];
  await page.route(url, route => {
    const fileId = new URL(route.request().url()).searchParams.get('file');
    const view = new URL(route.request().url()).searchParams.get('view');
    requests.push([fileId, view]);
    if (fileId !== file.id || view !== 'file') return route.fulfill({status:403});
    const rows = admitted ? [{...file, text}] : [];
    return route.fulfill({json:{collections:{'Platform/Releases/Home':rows}, platform:admitted}});
  });
  try {
    const link = os.locator(':scope > dl').getByRole('button', {name:'workspace.encounter#workspace.environmentPolicy', exact:true});
    const viewer = page.locator('#file-viewer-window');
    await link.press('Enter');
    await viewer.getByRole('heading', {name:'workspace.encounter',exact:true}).waitFor();
    const selected = viewer.locator(`.sp-line.highlight[data-line="${line}"]`);
    await selected.getByText('workspace.environmentPolicy', {exact:false}).waitFor();
    await viewer.locator(`.sp-line[data-line="${line - 1}"]`).waitFor();
    await viewer.locator('.sp-line.highlight:focus').waitFor();
    await viewer.getByText('Release source excerpt', {exact:true}).waitFor();
    assert.deepEqual(requests, [[file.id,'file']]);
    await viewer.getByRole('button', {name:'File',exact:true}).click();
    await viewer.getByRole('button', {name:'Reload file',exact:true}).click();
    await viewer.locator('.sp-line.highlight:focus').waitFor();
    assert.deepEqual(requests, [[file.id,'file'],[file.id,'file']]);
    await viewer.getByRole('button', {name:'Close File Viewer',exact:true}).click();
    await viewer.waitFor({state:'hidden'});
    admitted = false;
    await link.click();
    await viewer.getByText(/Indexed Home source requires Platform steward access/).waitFor();
    assert.deepEqual(requests, [[file.id,'file'],[file.id,'file'],[file.id,'file']]);
    assert.equal(await viewer.getByRole('region', {name:'Encounter source'}).count(), 0);
    await viewer.getByRole('button', {name:'Close File Viewer',exact:true}).click();
    await viewer.waitFor({state:'hidden'});
  } finally {
    await page.unroute(url);
  }
}

async function verifyFrontGate(page, bridge) {
  const gate = page.locator('#front-gate-window');
  const status = gate.locator('#front-gate-live-status');
  const catalogue = gate.locator('#front-gate-services');
  const timer = gate.getByRole('timer');
  const checked = time => status.getByText('Checked ' + time + ' AWST',{exact:true}).waitFor();
  const requests = () => page.evaluate(() => window.assuranceRequests);
  const updateTime = time => page.evaluate(time => { window.assuranceReading.time = time; }, time);
  await checked('09:00:00');
  const clock = frontGateClock(bridge);
  // Workspace pairing polls independently of Front Gate.
  const dispatchCount = () => bridge.dispatches.filter(event => event.label !== 'appdev.event / pair-poll').length;
  assert.equal(await requests(), 1);
  assert.match(await timer.innerText(), /^Next refresh in 1[345]s$/);
  const beforeTicks = dispatchCount();
  await page.clock.fastForward(3500);
  await timer.filter({hasText:/^Next refresh in 1[012]s$/}).waitFor();
  assert.equal(await requests(), 1);
  const between = clock();
  assert.equal(between, 0);
  assert.equal(dispatchCount(), beforeTicks, "Front Gate countdown dispatched before its deadline");

  await updateTime('09:00:15');
  await page.clock.fastForward(13000);
  await checked('09:00:15');
  assert.equal(await requests(), 2);
  const due = clock() - between;
  assert.equal(due, 1);
  assert.equal(dispatchCount() - beforeTicks, 1, "Front Gate deadline dispatched more than once");
  await gate.locator('#front-gate-minimize').click();
  await gate.waitFor({state:'hidden'});
  const beforeMinimized = dispatchCount();
  await page.clock.fastForward(16000);
  const minimized = clock() - due;
  assert.equal(minimized, 0);
  assert.equal(dispatchCount(), beforeMinimized, "Front Gate dispatched while minimized");
  assert.equal(await requests(), 2);
  await updateTime('09:00:31');
  await page.locator('#front-gate-task').click();
  await checked('09:00:31');
  assert.equal(await requests(), 3);
  const restored = clock() - due;
  assert.equal(restored, 1);
  await gate.getByLabel('Auto-refresh').selectOption('paused');
  await timer.filter({hasText:/^Paused$/}).waitFor();
  const beforePaused = dispatchCount();
  await page.clock.fastForward(16000);
  const paused = clock() - due - restored;
  assert.equal(paused, 0);
  assert.equal(dispatchCount(), beforePaused, "Front Gate dispatched while paused");
  assert.equal(await requests(), 3);

  const refresh = () => observeFrontGateRefresh(page, bridge, () => gate.getByRole('button',{name:'Refresh status',exact:true}).click());
  const identical = await refresh();
  assert.deepEqual(identical,{effects:['browser.frontGateStatus'],mutations:[]}, "Identical Front Gate readings must produce no DOM changes");
  await updateTime('09:00:32');
  const timestamp = await refresh();
  assert.deepEqual(timestamp,{effects:['browser.frontGateStatus','browser.batch'],mutations:['front-gate-checked']});
  await checked('09:00:32');
  await gate.getByLabel('Availability').selectOption('Listening');
  await catalogue.getByText('Hidden fixture',{exact:true}).waitFor({state:'detached'});
  const original = await catalogue.getByRole('link',{name:'Visible fixture'}).elementHandle();
  await page.evaluate(() => { window.assuranceReading.services[1].detail = 'Changed outside the filter'; });
  const filtered = await refresh();
  assert.deepEqual(filtered,{effects:['browser.frontGateStatus'],mutations:[]}, "Filtered-out Front Gate changes must preserve the catalogue");
  assert(await original.evaluate(node => node.isConnected));
  await page.evaluate(() => { window.assuranceReading.services[0].detail = 'Changed visible detail'; });
  const visible = await refresh();
  assert.deepEqual(visible,{effects:['browser.frontGateStatus','browser.content'],mutations:['front-gate-services']});
  await catalogue.getByText('Changed visible detail',{exact:true}).waitFor();
  assert.equal(clock(), due + restored);
  return {
    'front-gate-between-dispatches': between,
    'front-gate-due-dispatches': due,
    'front-gate-minimized-dispatches': minimized,
    'front-gate-restore-dispatches': restored,
    'front-gate-paused-dispatches': paused,
    'front-gate-identical-mutations': identical.mutations.length,
    'front-gate-timestamp-mutations': timestamp.mutations.length,
    'front-gate-filtered-mutations': filtered.mutations.length,
    'front-gate-visible-mutations': visible.mutations.length,
  };
}

const [, , release, origin] = process.argv;
assert(process.argv.length === 4, 'Usage: node release-gate.mjs RELEASE ORIGIN');
assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) && new URL(origin).origin === origin,
  'Expected the candidate loopback origin');
process.stdout.write(JSON.stringify(await verifyCandidate(release, origin)));
