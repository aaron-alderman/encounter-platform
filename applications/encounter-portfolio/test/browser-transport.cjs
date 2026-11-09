'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

function startHost(root, { directory, declaration, cut }) {
  if (process.env.ENCOUNTER_RUST_HOST) {
    return require('../../encounter-runtime/test/host.cjs').startHost(root, {
      directory, declaration: declaration ?? 'bootstrap/application.rel', cut
    });
  }
  const args = cut ? [path.join(__dirname, 'transport.cjs'), 'serve', directory, cut] :
    [path.join(root, 'bootstrap/server.cjs'), directory];
  if (declaration) args.push(path.join(root, declaration));
  const child = spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, ENCOUNTER_PORT: '0' },
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
    session.host = startHost(root, session.options);
    session.url = await session.host.ready;
  };
  const ports = {
    'browser.open': async ({ width = 1440, height = 1000, declaration, cut }) => {
      const location = process.env.ENCOUNTER_PLAYWRIGHT ||
        'C:/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
      const { chromium } = require(location);
      const options = { directory: resolve(workspace()), declaration, cut };
      const session = { options, viewport: { width, height } };
      sessions.add(session);
      await start(session);
      const executablePath = process.env.ENCOUNTER_CHROME;
      session.browser = await chromium.launch(executablePath ? { headless: true, executablePath } :
        { headless: true, channel: 'chrome' });
      session.context = await session.browser.newContext({ viewport: session.viewport });
      return { browser: keep(session), ...await openPage(session, session.context) };
    },
    'browser.page': async ({ browser, route = '/', independent = false }) => {
      const session = resolve(browser);
      const context = independent ? await session.browser.newContext({ viewport: session.viewport }) : session.context;
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
      if (event === 'popup') {
        const [popup] = await Promise.all([page.waitForEvent('popup'), perform()]);
        await popup.waitForLoadState();
        return { page: capturePage(session, popup) };
      }
      const result = await perform();
      return action === 'navigate' ? { status: status(result) } : null;
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
