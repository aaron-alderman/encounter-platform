'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { DatabaseSync } = require('node:sqlite');
const { createRunner, main } = require('./runner.cjs');

const { locate } = require('./locator.cjs');

async function run() {
  const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT);
  const { FileJournal } = await import('../../../research/temple3/model/journal.mjs');
  const { replayJournal } = await import('../../../research/temple3/model/authenticated.mjs');
  const { decode } = require('../../encounter-work-boards/bootstrap/rel-values.cjs');
  const root = path.resolve(__dirname, '..');
  const binary = path.join(root, 'target/release/encounter');
  const scratch = await mkdtemp(path.join(tmpdir(), 'encounter-web-'));
  const store = name => path.join(scratch, name);
  const pages = new Map();
  let browser, context, host, origin;

  async function stop() {
    if (host && host.exitCode === null && host.signalCode === null) {
      const exited = once(host, 'exit');
      host.kill('SIGTERM');
      await exited;
    }
    host = undefined;
  }

  try {
    const check = createRunner('browser', ['test.browser'], {
      'browser.launch': async ({ width, height }) => {
        browser = await chromium.launch();
        context = await browser.newContext({ viewport: { width, height } });
        return true;
      },
      'browser.serve': async ({ application, project, declaration, directory }) => {
        const args = declaration ? ['--declaration', path.resolve(root, '..', project), declaration, store(directory)] :
          application ? ['--app', application] : [store(directory)];
        host = spawn(binary, ['serve', ...args, '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
        const lines = createInterface({ input: host.stdout });
        try {
          const [line] = await once(lines, 'line', { signal: AbortSignal.timeout(10000) });
          origin = line.slice('Encounter '.length);
          return line;
        } finally {
          lines.close();
        }
      },
      'browser.stop': async () => { await stop(); return true; },
      'browser.open': async ({ name }) => {
        if (!pages.has(name)) pages.set(name, await context.newPage());
        return (await pages.get(name).goto(origin)).status();
      },
      'browser.act': async ({ name, locator, action, value, byLabel, navigate }) => {
        const page = pages.get(name);
        const target = locate(page, locator);
        const perform = () => {
          switch (action) {
            case 'fill': return target.fill(value);
            case 'select': return target.selectOption(byLabel ? { label: value } : value);
            case 'press': return target.press(value);
            case 'click': return target.click();
            default: throw Error('Unknown browser action: ' + action);
          }
        };
        if (navigate) {
          const [response] = await Promise.all([page.waitForNavigation(), perform()]);
          return response?.status() ?? null;
        }
        await perform();
        return true;
      },
      'browser.observe': ({ name, locator, property }) => {
        const page = pages.get(name);
        const target = locate(page, locator);
        switch (property) {
          case 'count': return target.count();
          case 'list': return target.allTextContents();
          case 'text': return target.innerText();
          case 'value': return target.inputValue();
          case 'visible': return target.isVisible();
          case 'tag': return target.evaluate(node => node.tagName);
          case 'title': return page.title();
          case 'overflow': return page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          case 'fields': return target.locator('input[type=hidden]').evaluateAll(inputs =>
            Object.fromEntries(inputs.map(input => [input.name, input.value])));
          default: throw Error('Unknown browser observation: ' + property);
        }
      },
      'browser.request': async ({ method, route, form, sameOrigin }) => {
        const response = await context.request.fetch(origin + route, {
          method, form, headers: sameOrigin ? { origin } : undefined,
        });
        return { status: response.status(), type: response.headers()['content-type'] ?? '', text: await response.text() };
      },
      'journal.read': ({ directory }) => new FileJournal(store(directory)).read(),
      'journal.replay': ({ records, templeId }) => {
        const { temple, outcomes } = replayJournal(records, { expectedTempleId: templeId });
        return {
          sequence: temple.sequence, head: temple.stateRoot,
          purposes: outcomes.map(({ receipt }) => receipt.purpose),
          items: temple.state.cells[0].value.records.map(item => ({
            id: item.subject, title: Buffer.from(item.label, 'hex').toString('utf16le'),
          })),
        };
      },
      'journal.submit': ({ directory, base, operation, title }) => {
        const { status, stderr } = spawnSync(binary, ['run', store(directory), base, operation, title], { encoding: 'utf8' });
        return { status, error: stderr.trim() };
      },
      'store.read': ({ directory, revision, document }) => {
        const db = new DatabaseSync(path.join(store(directory), 'workspace.sqlite'), { readOnly: true });
        try {
          const revisions = db.prepare('SELECT id,parent FROM revisions ORDER BY id').all().map(row => [row.id, row.parent]);
          const row = document ? db.prepare('SELECT text FROM documents WHERE revision=? AND path=?').get(revision, document) : null;
          return { revisions, state: row ? decode(row.text, 'WorkItemState') : null };
        } finally {
          db.close();
        }
      },
      'test.report': ({ text }) => { console.log(text); return true; },
    });
    await check('test.browser');
  } finally {
    try {
      await browser?.close();
    } finally {
      await stop();
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

main(run);
