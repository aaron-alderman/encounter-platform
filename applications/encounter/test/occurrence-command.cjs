'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { witness } = require('./browser-support.cjs');

const goal = 'Retain the appointment and decision history of each occurrence';
const appointment = '2026-11-16T09:30:00+08:00';
const row = '[data-projection="visitRow"]';

async function clickAndWait(page, control) {
  await Promise.all([page.waitForNavigation(), control.click()]);
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'encounter-occurrence-'));
  let w;
  try {
    w = await witness(directory, goal);
    let page = await w.open();
    assert.equal(await w.revision(page), 0);
    await w.save(page, 'What would you like to make?', { 'I want to… because…': goal }, 'Record the purpose', 'Original intent');
    await w.save(page, 'Define a kind of thing', { 'Type identity': 'Visit', 'Type name': 'Visit' }, 'Name the occurrence type', 'Visit');
    await clickAndWait(page, page.getByRole('link', { name: 'Visit', exact: true }));
    for (const [id, label] of [['phase', 'Phase'], ['appointment', 'Appointment']]) {
      await w.save(page, 'Add one field', {
        'Field identity': id, 'Field name': label, 'Value type': 'Text',
        'Reference target type (Reference only)': '',
      }, 'Declare the lifecycle field', id);
    }
    await w.save(page, 'Define scheduling and cancellation', {
      'Lifecycle identity': 'visits', 'Phase field': 'phase', 'Appointment field': 'appointment',
    }, 'Apply the lifecycle to visits', 'Visit');
    await w.save(page, 'Create a thing', {
      'Thing identity': 'visit', 'Thing name': 'Site visit', Type: 'Visit',
      'Role alias (blank for unaliased)': '',
      'Initial values document': 'phase = "unscheduled"\nappointment = ""\n',
    }, 'Create one unscheduled visit', 'visit');
    await w.nav(page, 'Projections');
    await w.save(page, 'Create a projection', {
      'Projection identity': 'visitRow', 'Source thing': 'visit',
      'Exact role alias (blank selects unaliased)': '', 'Source field identity': 'phase',
      Representation: 'row', 'Optional action': '',
    }, 'Show the visit and its commands on a row', 'visitRow');

    const status = p => p.getByRole('status');
    const acceptButton = p => p.getByRole('button', { name: 'Accept this change', exact: true });
    const events = p => p.locator(row).getByRole('list', { name: 'Occurrence events' }).getByRole('listitem');
    const base = await w.revision(page);
    await w.prepare(page, 'Schedule', { Appointment: '  ' }, 'Try a blank appointment', 'visit/phase');
    assert.match(await status(page).innerText(), /Supply a non-blank appointment/);
    assert.equal(await acceptButton(page).count(), 0);
    assert.equal(await w.revision(page), base);
    assert.equal(await events(page).count(), 0);

    await w.prepare(page, 'Schedule', { Appointment: appointment }, 'Book the visit', 'visit/phase');
    const changes = p => p.getByRole('table', { name: 'Exact semantic changes' }).locator('tbody tr');
    const appointmentChange = p => changes(p).filter({ hasText: 'application/things/visit/roles/Visit as unaliased/values/appointment' });
    assert.match(await appointmentChange(page).innerText(), new RegExp(appointment.replace('+', '\\+')));
    await w.accept(page);
    const scheduled = await w.revision(page);
    assert.equal(scheduled, base + 1);
    assert.deepEqual(await events(page).allTextContents(), ['Scheduled: ' + appointment]);

    await w.prepare(page, 'Cancel occurrence', {}, 'Site access withdrawn', 'visit/phase');
    assert.equal(await appointmentChange(page).count(), 0);
    assert.match(await changes(page).filter({ hasText: '/values/phase' }).innerText(), /"scheduled"\s+"cancelled"/);
    await w.accept(page);
    const cancelled = await w.revision(page);
    assert.equal(cancelled, scheduled + 1);

    async function refuseSchedule(p) {
      const revision = await w.revision(p);
      await w.prepare(p, 'Schedule', { Appointment: 'A replacement appointment' }, 'Try to schedule after cancellation', 'visit/phase');
      assert.match(await status(p).innerText(), /TRANSITION: The command is unavailable/);
      assert.equal(await acceptButton(p).count(), 0);
      assert.equal(await w.revision(p), revision);
      assert.match(await p.locator(row).innerText(), /Requires status unscheduled; current status is cancelled/);
      assert.equal(await p.locator(row).getByText('Appointment: ' + appointment, { exact: true }).count(), 1);
      assert.deepEqual(await events(p).allTextContents(), ['Scheduled: ' + appointment, 'Cancelled: Site access withdrawn']);
    }
    await refuseSchedule(page);

    await w.nav(page, 'Your work');
    await clickAndWait(page, page.getByRole('link', { name: 'Site visit', exact: true }));
    await w.prepare(page, 'Edit the text document', {
      'Values document': 'phase = "unscheduled"\nappointment = "' + appointment + '"\n',
    }, 'Try to reset the lifecycle through a field edit', 'visit/phase');
    assert.match(await status(page).innerText(), /Use the scheduling or cancellation command/);
    assert.equal(await w.revision(page), cancelled);

    await w.nav(page, 'History');
    await w.prepare(page, 'Restore revision ' + scheduled, {}, 'Try to remove the cancellation by restoring', 'revision/' + scheduled);
    assert.match(await status(page).innerText(), /Restore cannot discard or change accepted lifecycle events/);
    assert.equal(await w.revision(page), cancelled);

    await w.stop();
    await page.close();
    page = await w.open();
    assert.equal(await w.revision(page), cancelled);
    await w.nav(page, 'Projections');
    await refuseSchedule(page);
    await w.nav(page, 'History');
    const receipt = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Revision ' + cancelled, exact: true }) });
    assert.match(await receipt.innerText(), /Cancel occurrence · Site visit \(visit\) · phase: scheduled → cancelled/);
    await receipt.getByText('Decision receipt', { exact: true }).click();
    assert.match(await receipt.locator('pre').innerText(), /Source: application\.rel#occurrences\/visits\/cancel/);
    console.log('PASS occurrence commands: cancellation kept the appointment and both events; later scheduling refused before and after cold reopen');
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
