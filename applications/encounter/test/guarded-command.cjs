'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { witness } = require('./browser-support.cjs');

const goal = 'Complete Harborboard work only when all its blockers are done';
const transition = 'markDone';
const row = '[data-projection="publishRow"]';

async function clickAndWait(page, control) {
  await Promise.all([page.waitForNavigation(), control.click()]);
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'encounter-guarded-'));
  let w;
  try {
    w = await witness(directory, goal);
    let page = await w.open();
    assert.equal(await w.revision(page), 0);
    await w.save(page, 'What would you like to make?', { 'I want to… because…': goal }, 'Record the board purpose', 'Original intent');

    async function defineType(id, name) {
      await w.save(page, 'Define a kind of thing', { 'Type identity': id, 'Type name': name }, 'Name a board role', id);
      await clickAndWait(page, page.getByRole('link', { name, exact: true }));
    }

    async function addField(id, label, kind, expects = '') {
      await w.save(page, 'Add one field', {
        'Field identity': id, 'Field name': label, 'Value type': kind,
        'Reference target type (Reference only)': expects,
      }, 'Declare one typed field', id);
    }

    async function createThing(id, label, type, document) {
      await w.save(page, 'Create a thing', {
        'Thing identity': id, 'Thing name': label, Type: type,
        'Role alias (blank for unaliased)': '', 'Initial values document': document,
      }, 'Create one board record', id);
    }

    await defineType('Dependency', 'Dependency');
    await addField('status', 'Status', 'Text');
    await createThing('review', 'Review guide', 'Dependency', 'status = "In progress"\n');
    await createThing('draft', 'Draft guide', 'Dependency', 'status = "In progress"\n');

    await w.nav(page, 'Your work');
    await defineType('WorkItem', 'Work item');
    await addField('status', 'Status', 'Text');
    await addField('blocker', 'Blocker', 'Reference', 'Dependency');
    await w.save(page, 'Define a guarded command', {
      'Command identity': transition, 'Command name': 'Mark done', 'Target status field': 'status',
      'Required target status': 'In progress', 'New target status': 'Done',
      'Blocker reference field': 'blocker', 'Blocker status field identity': 'status',
      'Required blocker status': 'Done',
    }, 'Require the named dependency to finish', 'WorkItem.status');
    await createThing('publish', 'Publish guide', 'WorkItem', 'status = "In progress"\nblocker = "review"\n');

    await w.nav(page, 'Projections');
    await w.save(page, 'Create a projection', {
      'Projection identity': 'publishRow', 'Source thing': 'publish',
      'Exact role alias (blank selects unaliased)': '', 'Source field identity': 'status',
      Representation: 'row', 'Optional action': '',
    }, 'Show the item and its command on a row', 'publishRow');

    const status = p => p.getByRole('status');
    const prepareDone = p => w.prepare(p, 'Mark done', {}, 'Publish after review', 'publish/status');
    const reviewButton = p => p.getByRole('button', { name: 'Accept this change', exact: true });
    const blocked = /Blocked by: Review guide \(review\)\. Requires Done\./;
    const base = await w.revision(page);
    assert.match(await page.locator(row).innerText(), blocked);
    await prepareDone(page);
    assert.match(await status(page).innerText(), /TRANSITION: The command is unavailable/);
    assert.equal(await reviewButton(page).count(), 0);
    assert.equal(await w.revision(page), base);

    // Both the inverse projection and the ordinary source edit reach the same protection.
    await w.prepare(page, 'Edit visible value — publishRow', { 'Visible value': 'Done' }, 'Attempt direct completion', 'publish/status');
    assert.match(await status(page).innerText(), /Use the guarded command to enter this status/);
    assert.equal(await w.revision(page), base);
    await w.nav(page, 'Your work');
    await clickAndWait(page, page.getByRole('link', { name: 'Publish guide', exact: true }));
    await w.prepare(page, 'Edit the text document', {
      'Values document': 'status = "Done"\nblocker = "review"\n',
    }, 'Attempt completion through the text editor', 'publish/status');
    assert.match(await status(page).innerText(), /Use the guarded command to enter this status/);
    assert.equal(await w.revision(page), base);

    await w.nav(page, 'Your work');
    await clickAndWait(page, page.getByRole('link', { name: 'Work item', exact: true }));
    await w.save(page, 'Add one field', {
      'Field identity': 'secondBlocker', 'Field name': 'Second blocker', 'Value type': 'Reference',
      'Reference target type (Reference only)': 'Dependency',
      'Resolve Publish guide / unaliased': 'draft',
      'Confirm this resolution for Publish guide': true,
    }, 'Resolve the second reference on the existing work item', 'WorkItem.secondBlocker');
    await w.prepare(page, 'Add second blocker — Mark done', {
      'Second blocker reference field': 'secondBlocker',
    }, 'Require both referenced work items to finish', transition);
    const extension = page.getByRole('table', { name: 'Exact semantic changes' }).locator('tbody tr');
    assert.equal(await extension.count(), 1);
    assert.match(await extension.innerText(), /application\/transitions\/markDone\/secondReference\s+not present\s+"secondBlocker"/);
    await w.accept(page);

    async function setBlocker(p, title, id, value) {
      await w.nav(p, 'Your work');
      await clickAndWait(p, p.getByRole('link', { name: title, exact: true }));
      await w.save(p, 'Edit Status', { Status: value }, 'Record dependency progress', id + '/status');
    }
    async function refuseCompletion(reason) {
      await w.nav(page, 'Projections');
      const revision = await w.revision(page);
      assert.match(await page.locator(row).innerText(), reason);
      await prepareDone(page);
      assert.match(await status(page).innerText(), /TRANSITION: The command is unavailable/);
      assert.match(await page.locator(row).innerText(), reason);
      assert.equal(await reviewButton(page).count(), 0);
      assert.equal(await w.revision(page), revision);
    }

    const secondBlocked = /Blocked by: Draft guide \(draft\)\. Requires Done\./;
    await refuseCompletion(/Blocked by: Review guide \(review\), Draft guide \(draft\)\. Requires Done\./);
    await setBlocker(page, 'Review guide', 'review', 'Done');
    await refuseCompletion(secondBlocked);
    await setBlocker(page, 'Review guide', 'review', 'In progress');
    await setBlocker(page, 'Draft guide', 'draft', 'Done');
    await refuseCompletion(blocked);
    await setBlocker(page, 'Review guide', 'review', 'Done');
    await w.nav(page, 'Projections');
    assert.match(await page.locator(row).innerText(), /Ready to review/);
    await prepareDone(page);
    const changes = page.getByRole('table', { name: 'Exact semantic changes' }).locator('tbody tr');
    assert.equal(await changes.count(), 1);
    assert.match(await changes.innerText(), /application\/things\/publish\/roles\/WorkItem as unaliased\/values\/status\s+"In progress"\s+"Done"/);

    const otherSession = await w.browser.newContext();
    try {
      const other = await otherSession.newPage();
      await other.goto(w.url);
      await setBlocker(other, 'Draft guide', 'draft', 'In progress');
      const newer = await w.revision(other);
      await clickAndWait(page, reviewButton(page));
      assert.match(await status(page).innerText(), /Not committed: STALE/);
      assert.equal(await w.revision(page), newer);
      await clickAndWait(page, page.getByRole('button', { name: 'Cancel', exact: true }));
      assert.match(await page.locator(row).innerText(), secondBlocked);
      assert.match(await page.locator(row).innerText(), /status: In progress/);

      await setBlocker(other, 'Draft guide', 'draft', 'Done');
      await w.nav(page, 'Projections');
    } finally {
      await otherSession.close();
    }

    const freshBase = await w.revision(page);
    await prepareDone(page);
    const basis = page.locator('details').filter({ has: page.getByText('Decision and source basis', { exact: true }) });
    await basis.getByText('Decision and source basis', { exact: true }).click();
    const operation = (await basis.locator('pre').innerText()).match(/^Operation: (.+)$/m)[1];
    await w.accept(page);
    const accepted = await w.revision(page);
    assert.equal(accepted, freshBase + 1);
    assert.match(await page.locator(row).innerText(), /status: Done/);
    await prepareDone(page);
    assert.match(await status(page).innerText(), /TRANSITION: The command is unavailable/);
    assert.match(await page.locator(row).innerText(), /Requires status In progress; current status is Done/);
    assert.equal(await w.revision(page), accepted);

    await w.stop();
    await page.close();
    page = await w.open();
    assert.equal(await w.revision(page), accepted);
    await w.nav(page, 'Projections');
    assert.match(await page.locator(row).innerText(), /status: Done/);
    await w.nav(page, 'History');
    const entry = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Revision ' + accepted, exact: true }) });
    assert.match(await entry.innerText(), /Mark done · Publish guide \(publish\) · status: In progress → Done/);
    assert.match(await entry.innerText(), /Because: Publish after review · Target: publish\/status/);
    await entry.getByText('Decision receipt', { exact: true }).click();
    const receipt = await entry.locator('pre').innerText();
    assert.ok(receipt.includes('Operation: ' + operation));
    assert.ok(receipt.includes('Base revision: ' + freshBase));
    assert.ok(receipt.includes('Source: application.rel#transitions/' + transition));
    assert.match(receipt, /Source hash: [a-f0-9]{64}/);
    console.log('PASS guarded command: both blockers resolved through the UI, independent blockers and stale reviews refused; revision ' + accepted + ' and its receipt survived a cold reopen');
  } finally {
    try {
      if (w) await w.close();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
