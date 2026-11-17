import assert from 'node:assert/strict';

export const line = unit => '[' + unit.id + '] ' + unit.text;

export function packet(index, ranked) {
  const required = index.units.filter(unit => !unit.optional);
  const optional = index.units.filter(unit => unit.optional);
  const selected = [];
  for (const row of ranked) {
    const unit = optional.find(candidate => candidate.id === row.id);
    assert.ok(unit);
    const candidate = [...selected, unit].map(line).join('\n');
    if (Buffer.byteLength(candidate) <= index.budgetBytes) selected.push(unit);
  }
  return {
    ids: selected.map(unit => unit.id),
    required: required.map(unit => unit.id),
    optionalBytes: Buffer.byteLength(selected.map(line).join('\n')),
    text: 'Mandatory context (same for every arm):\n' + required.map(line).join('\n') +
      '\n\nOptional context (navigation only):\n' + selected.map(line).join('\n')
  };
}
