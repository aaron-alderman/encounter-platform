'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createHash, generateKeyPairSync, sign } = require('node:crypto');
const { spawn } = require('node:child_process');

function startHost(root, { directory, declaration, cut, attachmentRoot, operatorFile, sourceImage }) {
  if (process.env.ENCOUNTER_RUST_HOST) {
    return require('../../encounter-runtime/test/host.cjs').startHost(root, {
      directory, declaration: declaration ?? 'products/claimipedia/application.rel', cut, attachmentRoot, operatorFile, sourceImage
    });
  }
  const args = cut ? [path.join(__dirname, 'transport.cjs'), 'serve', directory, cut] :
    [path.join(root, 'bootstrap/server.cjs'), directory];
  if (declaration) args.push(path.join(root, declaration));
  const child = spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, ENCOUNTER_PORT: '0', ENCOUNTER_ATTACHMENT_ROOT: attachmentRoot ?? '', ENCOUNTER_OPERATOR_FILE: operatorFile ?? '' },
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let output = '';
  child.stderr.on('data', bytes => { output += bytes; });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  let timer;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Server readiness timed out: ' + output)), 60000);
    child.on('error', reject);
    let stdout = '';
    child.stdout.on('data', bytes => {
      stdout += bytes;
      const match = /^Encounter (http:\/\/127\.0\.0\.1:\d+)\s*$/m.exec(stdout);
      if (match) resolve(match[1]);
    });
    exited.then(exit => reject(Error('Server exited before readiness: ' + exit.code + '\n' + output)));
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

function locate(page, steps, base = page) {
  let target = base;
  for (const spec of steps) {
    if (spec.css) target = target.locator(spec.css);
    else if (spec.role) target = target.getByRole(spec.role, {
      name: spec.name, exact: spec.exact ?? true, includeHidden: spec.hidden ?? false
    });
    else if (spec.label) target = target.getByLabel(spec.label, { exact: spec.exact ?? true });
    else if (spec.text) target = target.getByText(spec.text, { exact: spec.exact ?? true });
    if (spec.has) target = target.filter({ has: locate(page, spec.has) });
    if (spec.contains) target = target.filter({ hasText: spec.contains });
    if (spec.exactText) target = target.and(page.getByText(spec.exactText, { exact: true }));
  }
  return target;
}

function fixtureAuthority(root, directory, declaration, authority) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(authority)) throw Error('Invalid fixture authority identity');
  const source = path.join(directory, 'fixture-source');
  fs.mkdirSync(source, { mode: 0o700 });
  for (const name of ['source', 'products', 'algebra', 'bootstrap', 'corpus']) {
    fs.cpSync(path.join(root, name), path.join(source, name), { recursive: true });
  }
  fs.chmodSync(path.join(source, 'corpus'), 0o700);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const registry = path.join(source, 'products/claimipedia/scientific-admission-authorities.rel');
  fs.appendFileSync(registry, `("${authority}", "ed25519PublicKey", "${raw}")\n`
    + `("${authority}.weak", "ed25519PublicKey", "01${'00'.repeat(31)}")\n`);
  const pin = createHash('sha256').update(fs.readFileSync(registry)).digest('hex');
  const manifest = path.join(source, declaration);
  const text = fs.readFileSync(manifest, 'utf8').replace(
    /^(\("data\.scientific-admission-authorities", "sha256", ")[a-f0-9]{64}("\))$/m,
    (_, prefix, suffix) => prefix + pin + suffix);
  fs.writeFileSync(manifest, text);
  return { source, privateKey };
}

function createBrowserTransport({ root, keep, resolve, workspace }) {
  const sessions = new Set();
  const capturePage = (session, page) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    return keep({ session, page, errors });
  };
  const status = response => response?.status() ?? null;
  const openPage = async (session, context, route = '/') => {
    const page = await context.newPage();
    const token = capturePage(session, page);
    return { page: token, status: status(await page.goto(new URL(route, session.url).href)) };
  };
  const start = async session => {
    session.host = startHost(session.source ?? root, session.options);
    session.url = await session.host.ready;
  };
  const ports = {
    'browser.open': async ({ width = 1440, height = 1000, declaration, cut, attachments = false, operator, admissionAuthority }) => {
      const location = process.env.ENCOUNTER_PLAYWRIGHT ||
        'C:/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
      const { chromium } = require(location);
      const attachmentRoot = attachments ? process.env.ENCOUNTER_TEST_ATTACHMENT_ROOT : undefined;
      const directory = resolve(workspace());
      const operators = operator ? require('../../encounter-runtime/test/operators.cjs').createOperators(directory) : null;
      const options = { directory, declaration, cut, attachmentRoot, operatorFile: operators?.file };
      const fixture = admissionAuthority ? fixtureAuthority(root, directory,
        declaration ?? 'products/claimipedia/application.rel', admissionAuthority) : null;
      // These cases select source declarations outside the packaged application inventory.
      options.sourceImage = Boolean(fixture) || declaration === 'products/claimipedia/reader.rel';
      const session = { options, operators, viewport: { width, height }, ...fixture };
      sessions.add(session);
      await start(session);
      const executablePath = process.env.ENCOUNTER_CHROME;
      session.browser = await chromium.launch(executablePath ? { headless: true, executablePath } :
        { headless: true, channel: 'chrome' });
      session.context = await session.browser.newContext({ viewport: session.viewport, httpCredentials: operators?.credentials[operator] });
      return { browser: keep(session), attachments: Boolean(attachmentRoot), ...await openPage(session, session.context) };
    },
    'browser.signAdmission': ({ browser, text }) => {
      const { privateKey } = resolve(browser);
      if (!privateKey) throw Error('No independent fixture signer for this browser');
      return sign(null, Buffer.from(text), privateKey).toString('hex');
    },
    'browser.page': async ({ browser, route = '/', independent = false, operator }) => {
      const session = resolve(browser);
      const context = independent || operator ? await session.browser.newContext({
        viewport: session.viewport, httpCredentials: session.operators?.credentials[operator]
      }) : session.context;
      return openPage(session, context, route);
    },
    'browser.reopen': async ({ browser }) => {
      const session = resolve(browser);
      const exit = await session.host.stop();
      await start(session);
      return { exit, ...await openPage(session, session.context) };
    },
    'browser.act': async ({ page: token, locator = [], action, value, choiceLabel, event, width, height }) => {
      const { session, page } = resolve(token);
      const target = locate(page, locator);
      const perform = () => {
        if (action === 'navigate') return page.goto(new URL(value, session.url).href);
        if (action === 'resize') return page.setViewportSize({ width, height });
        if (action === 'press' && !locator.length) return page.keyboard.press(value);
        if (action === 'click') return target.click();
        if (action === 'press') return target.press(value);
        if (action === 'fill') return target.fill(value);
        if (action === 'check') return target.setChecked(value);
        if (action === 'select') return target.selectOption(choiceLabel ? { label: value } : value);
        throw Error('Unknown browser action: ' + action);
      };
      if (event === 'navigation') {
        const [response] = await Promise.all([page.waitForNavigation(), perform()]);
        return { status: status(response) };
      }
      if (event === 'download') {
        const [download] = await Promise.all([page.waitForEvent('download'), perform()]);
        const bytes = fs.readFileSync(await download.path());
        return { filename: download.suggestedFilename(), bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      if (event === 'popup') {
        const [popup] = await Promise.all([page.waitForEvent('popup'), perform()]);
        await popup.waitForLoadState();
        return { page: capturePage(session, popup) };
      }
      const result = await perform();
      return action === 'navigate' ? { status: status(result) } : null;
    },
    'browser.response': async ({ page: token, route, method = 'GET', anonymous = false, fields, formFrom }) => {
      const { session, page } = resolve(token);
      const url = new URL(route, session.url);
      if (url.origin !== session.url) throw Error('Expected a request to the current test server');
      if (anonymous) {
        const response = await fetch(url, { method, redirect: 'manual' });
        await response.body?.cancel();
        return { status: response.status };
      }
      const hidden = formFrom ? await locate(page, formFrom).locator('input[type=hidden]').evaluateAll(inputs =>
        Object.fromEntries(inputs.map(input => [input.name, input.value]))) : null;
      const form = fields || hidden ? { ...hidden, ...fields } : undefined;
      const response = await page.request.fetch(url.href, { method, form, maxRedirects: 0, headers: { origin: session.url } });
      try { return { status: response.status(), type: response.headers()['content-type'] ?? null, text: await response.text() }; }
      finally { await response.dispose(); }
    },
    'browser.observe': async ({ page: token, locator = [], property, name }) => {
      const { page, errors } = resolve(token);
      const target = locate(page, locator);
      if (property === 'errors') return [...errors];
      if (property === 'overflow') return page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (property === 'title') return page.title();
      if (property === 'origin') return new URL(page.url()).origin;
      if (property === 'count') return target.count();
      if (property === 'visible') return target.isVisible();
      if (property === 'tag') return target.evaluate(element => element.tagName);
      if (property === 'text') return target.innerText();
      if (property === 'value') return target.inputValue();
      if (property === 'computed') return target.evaluate((element, key) => getComputedStyle(element).getPropertyValue(key), name);
      if (property === 'attribute') return target.getAttribute(name);
      throw Error('Unknown browser observation: ' + property);
    }
  };
  async function clean() {
    const results = await Promise.allSettled([...sessions].map(async session => {
      try { await session.browser?.close(); } finally { await session.host?.stop(); }
    }));
    sessions.clear();
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  return { ports, clean };
}

module.exports = { createBrowserTransport };
