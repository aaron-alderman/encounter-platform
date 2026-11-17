'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { witness } = require('./browser-support.cjs');

async function verify(page, width) {
  await page.setViewportSize({ width, height: 920 });
  const requests = [];
  page.on('request', request => requests.push(request));
  assert.deepEqual(await page.evaluate(() => ({
    title: document.querySelector('.workspace-titlebar').textContent,
    background: getComputedStyle(document.querySelector('main')).backgroundColor,
    paper: getComputedStyle(document.documentElement).getPropertyValue('--sourcery-paper').trim(),
    scripts: document.scripts.length,
  })), { title: 'Encounter Authoring', background: 'rgb(255, 254, 243)', paper: '#fffef3', scripts: 0 });
  const revision = await page.locator('.revision').textContent();
  const detail = page.locator('.inspection-detail');
  const code = detail.locator('.source-widget-read code');
  const sourceText = async () => (await code.allTextContents()).join('\n');
  const heading = detail.getByRole('heading', { level: 2 });

  async function follow(link, keyboard = false) {
    if (keyboard) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await heading.focus();
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate(node => node === document.activeElement && node.matches(':focus-visible')), true);
    }
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      keyboard ? page.keyboard.press('Enter') : link.click(),
    ]);
    assert.equal(response.status(), 200);
  }

  await follow(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'App inspector' }));
  assert.equal(await heading.textContent(), 'Temple records');
  await verifyCoordinates(detail);
  for (const [role, text] of [['keyword', 'process'], ['string', '"section"'], ['reference', '$pane.id']]) {
    const token = detail.locator('.sp-' + role).getByText(text, { exact: true }).first();
    assert.ok(await token.isVisible(), role);
    assert.notEqual(await token.evaluate(node => getComputedStyle(node).color),
      await detail.locator('.sp-identifier').first().evaluate(node => getComputedStyle(node).color));
  }
  const root = page.locator('.inspection-branches > li > details');
  const toggle = root.locator(':scope > summary > .inspection-toggle');
  const child = root.getByRole('link', { name: 'Refresh', exact: true });
  const adornment = () => toggle.evaluate(node => getComputedStyle(node, '::before').content);
  assert.equal(await adornment(), '"−"');
  await toggle.click();
  assert.equal(await adornment(), '"+"');
  assert.equal(await child.isVisible(), false);
  await root.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await adornment(), '"−"');
  assert.equal(await child.isVisible(), true);
  assert.equal(await page.locator('.inspection-branches ul').first().evaluate(node => getComputedStyle(node).borderInlineStartStyle), 'dotted');
  assert.equal(await page.evaluate(() => {
    const tree = document.querySelector('.inspection-tree-scroll');
    const detail = document.querySelector('.inspection-detail');
    const root = document.documentElement;
    const footer = document.querySelector('.workspace-statusbar');
    const top = detail.scrollTop;
    tree.scrollTop = 80;
    return tree.scrollTop > 0 && detail.scrollTop === top && root.scrollWidth <= innerWidth
      && root.scrollHeight <= innerHeight + 1 && footer.getBoundingClientRect().bottom <= innerHeight;
  }), true);
  await follow(page.getByRole('region', { name: 'Surface tree' }).getByRole('link', { name: 'Refresh', exact: true }));
  const steps = [
    ['Refresh', /data-document-command.*temple-refresh/],
    ['Click binding', /event = "click"/],
    ['desktop.event', /call desktop\.templeRecords/],
    ['desktop.templeRecords', /call desktop\.renderTempleRecords[\s\S]*call formation\.loadRecords[\s\S]*call desktop\.renderTempleRecords/],
    ['formation.loadRecords', /port browser\.request/],
    ['Saved records', /outcome = "read"/],
    ['desktop.renderTempleRecords', /port browser\.content/],
  ];
  for (const [index, [name, source]] of steps.entries()) {
    assert.equal(await heading.textContent(), name);
    assert.match(await sourceText(), source);
    await verifyCoordinates(detail);
    assert.equal(await detail.locator('.source-widget-read').getAttribute('tabindex'), '0');
    assert.equal(await page.locator('.inspection-layout [aria-current="page"]').textContent(), name);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name);
    assert.equal(await heading.evaluate(node => node.getBoundingClientRect().bottom > 0 && node.getBoundingClientRect().top < innerHeight), true, name);
    if (name === 'Saved records') {
      assert.match(await detail.locator('pre').first().textContent(), /note\?: SavedRecord, project\?: SavedRecord/);
    }
    if (index < steps.length - 1) await follow(detail.getByRole('link'), width === 390);
  }
  await follow(detail.getByRole('link', { name: 'Temple records' }));
  assert.equal(await heading.textContent(), 'Temple records');
  await page.goBack({ waitUntil: 'load' });
  assert.equal(await heading.textContent(), 'desktop.renderTempleRecords');
  const tree = page.getByRole('region', { name: 'Surface tree' });
  const variants = tree.getByRole('navigation', { name: 'Record state' });
  const treeLink = name => tree.getByRole('link', { name, exact: true });
  const related = () => detail.getByRole('link');

  for (const [label, pattern] of [
    ['Maximize or restore Temple Manager', /data-manager-maximized/],
    ['Minimize Temple Manager', /browser\.focus/],
  ]) {
    await follow(treeLink(label));
    await follow(related());
    await follow(related());
    assert.match(await sourceText(), pattern);
  }
  const close = treeLink('Close Temple Manager');
  assert.equal(await close.count(), 2);
  for (let index = 0; index < 2; index++) {
    await follow(close.nth(index));
    await follow(related());
    await follow(related());
    assert.match(await sourceText(), /name = "hidden"/);
  }
  for (const menu of ['File', 'Help']) {
    await follow(treeLink(menu));
    assert.match(await detail.textContent(), /Browser-native click/);
    await follow(related());
    assert.equal(await heading.textContent(), menu + ' panel');
  }
  await follow(treeLink('Refresh saved records'));
  await follow(related());
  assert.equal(await heading.textContent(), 'Click binding');
  for (const [name, key] of [['Edit memory', 'note'], ['Edit journal', 'project']]) {
    await follow(treeLink(name));
    assert.ok((await detail.textContent()).includes('data-first-run: ' + key));
    for (const stage of ['Record editor click', 'onboarding.event', 'onboarding.show', 'onboarding.save', 'onboarding.commit']) {
      await follow(related(), width === 390);
      assert.equal(await heading.textContent(), stage);
    }
    assert.ok((await detail.textContent()).includes('POST /workspace/formation/records'));
    assert.match(await sourceText(), /receipt\.outcome/);
    assert.equal(await detail.locator(':scope > .source-widget-read').count(), 1);
    assert.equal(await detail.locator('.nr-source-header').count(), 0);
    assert.ok(await detail.locator('.source-widget-read').evaluate(buffer => {
      buffer.scrollTop = 80;
      return buffer.scrollTop === 0 && buffer.scrollHeight === buffer.clientHeight;
    }));
    await follow(related());
    assert.equal(await heading.textContent(), 'Saved records');
  }
  for (const [index, key] of ['note', 'project'].entries()) {
    await follow(treeLink('Saved text preview').nth(index));
    assert.ok((await detail.textContent()).includes('records.' + key + '?.text: Text'));
  }

  await follow(variants.getByRole('link', { name: 'Signed out' }));
  assert.equal(await treeLink('Edit memory').count(), 0);
  await follow(treeLink('Sign in to Temple (new tab)'));
  await follow(related());
  assert.ok((await detail.textContent()).includes('GET /settings/identity/'));
  await follow(variants.getByRole('link', { name: 'Loading' }));
  await follow(treeLink('Refresh'));
  assert.match(await detail.textContent(), /disabled = true/);
  await follow(variants.getByRole('link', { name: 'Unavailable' }));
  await follow(treeLink('Record status'));
  assert.match(await detail.textContent(), /Saved records could not be loaded/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.revision').textContent(), revision);
  assert.ok(requests.every(request => request.method() === 'GET' && !new URL(request.url()).pathname.startsWith('/workspace/formation')));
}

async function verifyCoordinates(detail) {
  const match = (await detail.locator('.inspection-source-location').textContent()).match(/lines (\d+)–(\d+)$/);
  assert.ok(match);
  const lines = detail.locator('.sp-line');
  assert.equal(await lines.first().getAttribute('data-line'), match[1]);
  assert.equal(await lines.last().getAttribute('data-line'), match[2]);
}

async function verifyAbout(page) {
  const picker = page.getByRole('navigation', { name: 'Inspectable Catalogue apps' });
  const detail = page.locator('.inspection-detail');
  const selection = detail.getByRole('heading', { level: 2 });
  const related = detail.locator('dl').getByRole('link');
  const tree = page.getByRole('region', { name: 'Surface tree' });
  async function follow(link) {
    const [response] = await Promise.all([page.waitForNavigation({waitUntil:'load'}), link.click()]);
    assert.equal(response.status(), 200);
  }
  await follow(picker.getByRole('link', { name: 'About this build', exact: true }));
  assert.match(await detail.textContent(), /Compact window/);
  assert.equal(await tree.getByRole('navigation', { name: 'Record state' }).count(), 0);
  for (const stage of ['About launcher click','desktop.event','desktop.open','Home build identity']) {
    await follow(related);
    assert.equal(await selection.textContent(), stage);
    assert.equal(new URL(page.url()).searchParams.get('app'), 'about');
    await verifyCoordinates(detail);
  }
  assert.match(await detail.textContent(), /Home fingerprint: Text \(64 hexadecimal characters\)/);
  assert.match(await detail.locator('.source-widget-read').textContent(), /port digest.sha256/);
  const address = page.url();
  await follow(tree.getByRole('link', { name:'Home fingerprint value', exact:true }));
  assert.match(await detail.textContent(), /HTML code/);
  assert.match(await detail.locator('.source-widget-read').textContent(), /process desktop.aboutBody/);
  await page.goto(address);
  assert.equal(await selection.textContent(), 'Home build identity');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight+1), true);
  await follow(picker.getByRole('link', { name: 'Temple Manager', exact: true }));
  assert.equal(await selection.textContent(), 'Temple records');
  const unavailable = new URL(page.url());
  unavailable.searchParams.set('app','certificates');
  await page.goto(unavailable.href);
  assert.match(await page.locator('main').textContent(), /Certificates has no inspection coverage/);
  assert.equal(await tree.count(), 0);
}

async function verifyFileManager(page) {
  const requests = [];
  page.on('request', request => requests.push(request));
  const revision = await page.locator('.revision').textContent();
  const picker = page.getByRole('navigation', { name: 'Inspectable Catalogue apps' });
  const pane = page.locator('.inspection-detail');
  const title = pane.getByRole('heading', { level: 2 });
  const source = pane.locator('.source-widget-read');
  const tree = page.getByRole('region', { name: 'Surface tree' });
  async function follow(link) {
    const [response] = await Promise.all([page.waitForNavigation({waitUntil:'load'}), link.click()]);
    assert.equal(response.status(), 200, response.url());
  }
  const modes = page.getByRole('navigation', { name: 'File Manager state' });
  async function checkSource(label, snippet) {
    assert.equal(await title.textContent(), label);
    assert.match(await source.textContent(), snippet);
    await verifyCoordinates(pane);
  }

  await follow(picker.getByRole('link', { name: 'File Manager', exact: true }));
  assert.match(await pane.textContent(), /Document window/);
  const folderTree = tree.getByRole('link', { name: 'Folder navigation', exact: true });
  await follow(folderTree);
  await checkSource('Folder navigation', /process files\.tree:/);
  const folderButton = tree.locator('li').filter({ has: page.getByRole('link', { name: 'Folder navigation', exact: true }) }).last()
    .getByRole('link', { name: 'workspace.encounter', exact: true });
  await follow(folderButton);
  assert.match(await pane.textContent(), /Folder tree button/);
  const folderId = (await pane.textContent()).match(/data-manager-item = ([a-f0-9]{64})/)[1];
  await checkSource('workspace.encounter', /process files\.treeFolder:/);
  for (const [name, snippet] of [
    ['Folder control click', /query = "desktop.event"/],
    ['desktop.event', /call managers\.event/],
    ['managers.event', /eq\(\$managerAction, "folder"\)/],
    ['managers.showFiles', /call managers\.readFiles/],
    ['Selected folder', /eq\(\$node.id, \$folderId\)/],
    ['Folder listing', /let entries = filter/],
  ]) {
    await follow(pane.locator('dl').getByRole('link').first());
    await checkSource(name, snippet);
    if (name === 'Selected folder') assert.ok((await pane.textContent()).includes(folderId));
  }
  await follow(pane.getByRole('link', { name: 'Sample folder contents' }));
  await checkSource('Folder contents', /file-contents-table/);
  await follow(tree.getByRole('link', { name: 'workspace.environmentPolicy.encounter', exact: true }));
  assert.match(await pane.textContent(), /HTML button/);
  const fileId = (await pane.textContent()).match(/data-manager-item = ([a-f0-9]{64})/)[1];
  assert.match(await source.textContent(), /process files\.entryRow/);
  for (const [name, code] of [
    ['File row click', /query = "desktop.event"/],
    ['desktop.event', /call managers\.event/],
    ['managers.event', /call managers\.showFiles/],
    ['managers.readFiles', /port browser\.request/],
    ['Selected file', /eq\(\$node.id, \$fileId\)/],
    ['files.preview', /call files\.content/],
    ['Workspace policy source', /process workspace\.environmentPolicy:/],
  ]) {
    await follow(pane.locator('dl').getByRole('link', { name, exact: true }));
    assert.equal(await title.textContent(), name);
    assert.match(await source.textContent(), code);
    assert.equal(new URL(page.url()).searchParams.get('app'), 'file-manager');
    await verifyCoordinates(pane);
    if (name === 'Selected file') {
      assert.ok((await pane.textContent()).includes(fileId));
      assert.match(await pane.textContent(), /permission: Platform steward/);
    }
  }
  await page.reload();
  await checkSource('Workspace policy source', /process workspace\.environmentPolicy:/);
  await follow(page.getByRole('region', { name: 'Tree and flow' }).getByRole('link', { name: 'files.preview', exact: true }));
  await follow(pane.getByRole('link', { name: 'Inline Encounter preview', exact: true }));
  await checkSource('Inline Encounter preview', /process files\.encounterViewer:/);
  assert.match(await pane.textContent(), /Encounter source preview · HTML section/);
  assert.equal(await modes.getByRole('link', { name: 'File preview' }).getAttribute('aria-current'), 'true');
  await follow(tree.getByRole('link', { name: 'Source code widget' }));
  await follow(pane.getByRole('link', { name: 'Workspace policy source' }));
  await checkSource('Workspace policy source', /process workspace\.environmentPolicy:/);
  assert.equal(await source.locator('[data-line]').first().getAttribute('data-line'), '137');

  await follow(tree.getByRole('link', { name: 'Back to folder', exact: true }));
  assert.match(await pane.textContent(), /Folder return button/);
  await follow(pane.getByRole('link', { name: 'Folder control click' }));
  await checkSource('Folder control click', /query = "desktop.event"/);
  await follow(tree.getByRole('link', { name: 'Open in File Viewer', exact: true }));
  assert.match(await pane.textContent(), new RegExp('data-manager-item = ' + fileId));
  await checkSource('Open in File Viewer', /process files\.viewerLink:/);
  await follow(pane.getByRole('link', { name: 'Open in File Viewer click', exact: true }));
  await checkSource('Open in File Viewer click', /event = "click"/);
  await follow(pane.getByRole('link', { name: 'File Viewer handoff', exact: true }));
  await checkSource('File Viewer handoff', /call managers\.showViewer/);
  assert.match(await pane.textContent(), /managerHandoff: true/);
  await follow(pane.getByRole('link', { name: 'File Viewer surface tree', exact: true }));
  assert.equal(new URL(page.url()).searchParams.get('app'), 'file-viewer');
  assert.equal(await picker.getByRole('link', { name: 'File Viewer', exact: true }).getAttribute('aria-current'), 'true');
  assert.equal(await tree.getByRole('link', { name: 'File Viewer', exact: true }).first().textContent(), 'File Viewer');
  assert.match(await pane.textContent(), /File Viewer preview pane/);
  await checkSource('File preview', /process desktop\.documentPane:/);
  for (const [name, snippet] of [
    ['managers.showViewer', /file-viewer-selection/],
    ['File Viewer selected file', /eq\(\$node.id, \$fileId\)/],
    ['Render File Viewer preview', /call files\.content/],
    ['Workspace policy source', /process workspace\.environmentPolicy:/],
  ]) {
    await follow(pane.locator('dl').getByRole('link', { name, exact: true }));
    await checkSource(name, snippet);
    if (name === 'File Viewer selected file') {
      assert.ok((await pane.textContent()).includes(fileId));
      assert.match(await pane.textContent(), /permission: Platform steward/);
    }
  }
  await follow(tree.getByRole('link', { name: 'Encounter preview', exact: true }));
  await checkSource('Encounter preview', /process files\.encounterViewer:/);
  await follow(tree.getByRole('link', { name: 'Source code widget', exact: true }));
  await follow(pane.getByRole('link', { name: 'Workspace policy source', exact: true }));
  await checkSource('Workspace policy source', /process workspace\.environmentPolicy:/);
  assert.equal(await source.locator('[data-line]').first().getAttribute('data-line'), '137');
  await page.reload();
  await checkSource('Workspace policy source', /process workspace\.environmentPolicy:/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await follow(tree.getByRole('link', { name: 'Reload file', exact: true }));
  await follow(pane.getByRole('link', { name: 'Reload the selected file', exact: true }));
  await checkSource('Reload the selected file', /call managers\.showViewer/);
  await follow(tree.getByRole('link', { name: 'Open…', exact: true }));
  await follow(pane.getByRole('link', { name: 'Open File Manager to choose a file', exact: true }));
  await checkSource('Open File Manager to choose a file', /call managers\.showFiles/);
  await follow(pane.getByRole('link', { name: 'File Manager surface tree', exact: true }));
  assert.equal(new URL(page.url()).searchParams.get('app'), 'file-manager');
  assert.equal(await modes.getByRole('link', { name: 'Home folder' }).getAttribute('aria-current'), 'true');
  const childRow = tree.getByRole('link', { name: 'spec', exact: true }).last();
  await follow(childRow);
  assert.match(await pane.textContent(), /Folder row/);
  await follow(modes.getByRole('link', { name: 'Search results' }));
  await follow(tree.getByRole('link', { name: 'Open matching file' }));
  await follow(pane.getByRole('link', { name: 'Search result click' }));
  await checkSource('Search result click', /query = "desktop.event"/);
  await follow(modes.getByRole('link', { name: 'Unavailable' }));
  assert.equal(await tree.getByRole('link', { name: 'Folder contents', exact: true }).count(), 0);
  assert.ok(await tree.getByRole('link', { name: /No indexed location is available/ }).isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1), true);
  assert.equal(await page.locator('.revision').textContent(), revision);
  assert.ok(requests.every(request => request.method() === 'GET' && !new URL(request.url()).pathname.startsWith('/workspace/files')));
}

async function verifyServiceManager(page) {
  const requests = [];
  page.on('request', request => requests.push(request));
  const revision = await page.locator('.revision').textContent();
  const picker = page.getByRole('navigation', { name: 'Inspectable Catalogue apps' });
  const tree = page.locator('.inspection-branches');
  const pane = page.locator('.inspection-detail');
  const title = pane.getByRole('heading', { level: 2 });
  const code = pane.getByRole('region', { name: 'Encounter source' });
  const link = (scope, name) => scope.getByRole('link', { name, exact: true });
  async function follow(scope, name, app = 'service-manager') {
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }), link(scope, name).click(),
    ]);
    assert.equal(response.status(), 200, response.url());
    assert.equal(new URL(page.url()).searchParams.get('app'), app);
  }
  async function checkSource(heading, excerpt) {
    assert.equal(await title.textContent(), heading);
    assert.match(await code.textContent(), excerpt);
    await verifyCoordinates(pane);
  }

  await follow(picker, 'Service Manager');
  assert.match(await pane.textContent(), /Document window/);
  await follow(tree, 'Encounter 0.1.7 qualification · Passed');
  assert.match(await pane.textContent(), /data-manager-item = qualification/);
  await follow(pane, 'Select published run');
  await checkSource('Select published run', /eq\(\$managerAction, "service-item"\)/);
  await follow(pane, 'Selected run');
  await checkSource('Selected run', /process services\.runs:/);
  const receipt = (await pane.textContent()).match(/receipt: ([a-z-]+)/)[1];
  assert.equal(receipt, 'standalone-release');
  await follow(tree, 'Open receipt in File Manager');
  assert.ok((await pane.textContent()).includes('data-manager-item = ' + receipt));
  await follow(pane, 'Open receipt click');
  await checkSource('Open receipt click', /query = "desktop.event"/);
  await follow(pane, 'Open run receipt');
  await checkSource('Open run receipt', /eq\(\$run.receipt, \$managerItem\)/);
  await follow(pane, 'File Manager receipt surface', 'file-manager');
  await checkSource('Run receipt preview', /process files\.content:/);
  const receiptText = await pane.getByRole('region', { name: 'Published receipt text' }).textContent();
  assert.match(receiptText, /Result: Passed/);
  await follow(pane, 'Selected receipt file', 'file-manager');
  assert.ok((await pane.textContent()).includes('id: ' + receipt));
  assert.match(await pane.textContent(), /parent: platform-receipts/);
  await follow(pane, 'Published receipt definition', 'file-manager');
  await checkSource('Published receipt definition', /process files\.publishedReceipts:/);
  await follow(tree, 'Back to Service Manager', 'file-manager');
  await follow(pane, 'Return to selected run', 'file-manager');
  await follow(pane, 'Service Manager run surface');
  await checkSource('Encounter 0.1.7 qualification · Passed', /process services\.entryButton:/);
  await follow(tree, 'Open receipt in File Manager');
  await follow(pane, 'Open receipt click');
  await follow(pane, 'Open run receipt');
  await follow(pane, 'File Manager receipt surface', 'file-manager');
  await follow(tree, 'Open in File Viewer', 'file-manager');
  assert.ok((await pane.textContent()).includes('data-manager-item = ' + receipt));
  await follow(pane, 'Open receipt in File Viewer click', 'file-manager');
  await follow(pane, 'File Viewer receipt handoff', 'file-manager');
  await checkSource('File Viewer receipt handoff', /call managers\.showViewer/);
  await follow(pane, 'File Viewer receipt surface', 'file-viewer');
  await follow(pane, 'Load receipt in File Viewer', 'file-viewer');
  await checkSource('Load receipt in File Viewer', /eq\(\$node.id, \$fileId\)/);
  await follow(pane, 'Selected receipt file', 'file-viewer');
  assert.ok((await pane.textContent()).includes('id: ' + receipt));
  assert.match(await pane.textContent(), /permission: Platform steward/);
  await follow(pane, 'Published receipt definition', 'file-viewer');
  await checkSource('Published receipt definition', /process files\.publishedReceipts:/);
  assert.equal(await code.locator('[data-line]').first().getAttribute('data-line'), '80');
  await follow(tree, 'Run receipt preview', 'file-viewer');
  assert.equal(await pane.getByRole('region', { name: 'Published receipt text' }).textContent(), receiptText);
  await follow(picker, 'Service Manager');
  const views = page.getByRole('navigation', { name: 'Service Manager view' });
  await follow(views, 'Services');
  for (const [row, id, state, raw, projection, excerpt] of [
    ['fixture.service · Running', 'system-fixture.service', 'Running', 'units[].scope: system', 'Systemd service status', /Observed systemd/],
    ['Sample Offline App · Offline', 'app-Sample Offline App', 'Offline', 'services[].online: false', 'Registered app status', /"Listening", "Offline"/],
    ['Sample App · Listening', 'app-Sample App', 'Listening', 'services[].online: true', 'Registered app status', /"Listening", "Offline"/],
  ]) {
    await follow(tree, row);
    assert.ok((await pane.textContent()).includes('data-manager-item = ' + id));
    assert.match(await pane.textContent(), /aria-pressed = true/);
    await follow(pane, 'Select service');
    await checkSource('Select service', /"service-item"/);
    assert.ok((await pane.textContent()).includes('data-manager-item: ' + id));
    await follow(pane, 'Front Gate snapshot read');
    await checkSource('Front Gate snapshot read', /service-manager-observations/);
    await follow(pane, 'Front Gate observation');
    await checkSource('Front Gate observation', /process frontGate\.snapshot:/);
    assert.ok((await pane.textContent()).includes(raw));
    await follow(pane, projection);
    await checkSource(projection, excerpt);
    await follow(pane, 'Render service status');
    await checkSource('Render service status', /process services\.observationFacts:/);
    await follow(pane, 'Service status surface');
    assert.ok((await pane.textContent()).includes('State: ' + state));
  }
  await page.reload();
  assert.equal(await title.textContent(), 'Service status');
  await follow(views, 'Schedules');
  await follow(tree, 'sourcery-disk-pressure-assurance.timer · Timer');
  assert.match(await pane.textContent(), /Systemd timer · HTML button/);
  await follow(pane, 'Select timer');
  await checkSource('Select timer', /eq\(\$managerAction, "service-item"\)/);
  await follow(pane, 'Selected timer');
  assert.match(await pane.textContent(), /last trigger \(AWST\): 2026-11-11 11:25:20/);
  await follow(pane, 'Match last execution');
  await checkSource('Match last execution', /eq\(count\(\$matched\), 1\)/);
  const invocationId = (await pane.textContent()).match(/invocation ID: ([a-f0-9]{32})/)[1];
  await follow(tree, 'View last service execution');
  assert.ok((await pane.textContent()).includes('data-manager-item = systemd-invocation:' + invocationId));
  await follow(pane, 'Last execution click');
  await checkSource('Last execution click', /query = "desktop.event"/);
  await follow(pane, 'Open last execution');
  await checkSource('Open last execution', /eq\(\$managerAction, "invocation"\)/);
  await follow(pane, 'Selected execution in Runs');
  assert.equal(await link(views, 'Runs').getAttribute('aria-current'), 'true');
  assert.match(await pane.textContent(), /data-manager-item = systemd-invocation:/);
  assert.match(await pane.textContent(), /aria-pressed = true/);
  await follow(pane, 'Selected scheduled execution');
  await checkSource('Selected scheduled execution', /process services\.runs:/);
  const fileId = (await pane.textContent()).match(/receipt: ([a-f0-9]{64})/)[1];
  await follow(tree, 'Open receipt in File Manager');
  assert.ok((await pane.textContent()).includes('data-manager-item = ' + fileId));
  await follow(pane, 'Open receipt click');
  await follow(pane, 'Open run receipt');
  await checkSource('Open run receipt', /eq\(\$run.receipt, \$managerItem\)/);
  await follow(pane, 'File Manager receipt surface', 'file-manager');
  await checkSource('Run receipt preview', /process files\.relViewer:/);
  const published = await readFile(join(__dirname, '../inspection/scheduled-receipt.rel'), 'utf8');
  const text = pane.getByRole('region', { name: 'Published receipt text' });
  assert.equal(await text.textContent(), published);
  await follow(pane, 'Selected receipt file', 'file-manager');
  assert.ok((await pane.textContent()).includes('id: ' + fileId));
  assert.ok((await pane.textContent()).includes(invocationId + '.rel'));
  await follow(pane, 'Scheduled receipt rendering', 'file-manager');
  await checkSource('Scheduled receipt rendering', /call files\.relViewer/);
  await follow(tree, 'Back to Service Manager', 'file-manager');
  await follow(pane, 'Return to selected run', 'file-manager');
  await follow(pane, 'Service Manager run surface');
  assert.match(await pane.textContent(), /aria-pressed = true/);
  assert.ok((await pane.textContent()).includes(invocationId));
  await follow(tree, 'Open receipt in File Manager');
  await follow(pane, 'Open receipt click');
  await follow(pane, 'Open run receipt');
  await follow(pane, 'File Manager receipt surface', 'file-manager');
  await follow(tree, 'Open in File Viewer', 'file-manager');
  assert.ok((await pane.textContent()).includes('data-manager-item = ' + fileId));
  await follow(pane, 'Open receipt in File Viewer click', 'file-manager');
  await follow(pane, 'File Viewer receipt handoff', 'file-manager');
  await follow(pane, 'File Viewer receipt surface', 'file-viewer');
  await follow(pane, 'Load receipt in File Viewer', 'file-viewer');
  await follow(pane, 'Selected receipt file', 'file-viewer');
  assert.ok((await pane.textContent()).includes('id: ' + fileId));
  await follow(pane, 'Scheduled receipt rendering', 'file-viewer');
  await checkSource('Scheduled receipt rendering', /call files\.relViewer/);
  await follow(tree, 'Run receipt preview', 'file-viewer');
  assert.equal(await text.textContent(), published);
  await page.reload();
  assert.equal(await title.textContent(), 'Run receipt preview');
  assert.equal(await page.locator('.revision').textContent(), revision);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && document.documentElement.scrollHeight <= innerHeight + 1), true);
  assert.ok(requests.every(request => request.method() === 'GET'
    && !new URL(request.url()).pathname.startsWith('/workspace/files')));
}

async function main() {
  const vendor = join(__dirname, '../algebra/presentation/sourcery-presentation.encounter');
  const platform = join(__dirname, '../../encounter-libraries/workflows/sourcery-presentation.encounter');
  for (const file of ['source-algebra.encounter', 'encounter-light-policy.encounter']) {
    const renderer = join(__dirname, '../algebra/presentation', file);
    const shared = join(__dirname, '../../encounter-libraries/source-presentation', file);
    assert.deepEqual(await readFile(renderer), await readFile(shared), 'Update the vendored Encounter highlighter.');
  }
  assert.deepEqual(await readFile(vendor), await readFile(platform), 'Update the vendored Sourcery presentation module.');
  const directory = await mkdtemp(join(tmpdir(), 'encounter-app-inspector-'));
  let app;
  try {
    app = await witness(directory, 'Inspect the Temple Manager Refresh interaction');
    const desktop = await app.open();
    await verify(desktop, 1440);
    await verifyAbout(desktop);
    await verifyFileManager(desktop);
    await verifyServiceManager(desktop);
    const mobile = await app.context.newPage();
    await mobile.goto(app.url);
    await verify(mobile, 390);
    await verifyAbout(mobile);
    await verifyFileManager(mobile);
    await verifyServiceManager(mobile);
    console.log('PASS Temple Manager, About, File Manager, File Viewer and Service Manager walkthroughs, handoffs and source coordinates at 1440px and 390px');
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
