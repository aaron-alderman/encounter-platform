'use strict';
// Loopback HTTP Basic credential verification. Only the principal reaches Encounter.
const fs = require('node:fs');
const { createHash, timingSafeEqual } = require('node:crypto');
const { parse } = require('./rel-values.cjs');

function operators(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 32768) throw Error('Expected a private operator file');
  const rows = parse(fs.readFileSync(file, 'utf8'));
  const version = rows.filter(row => row.s === 'operators' && row.p === 'version');
  if (version.length !== 1 || version[0].o !== 'encounter/operators/1') throw Error('Unsupported operator contract');
  const entries = new Map();
  for (const { s, p, o, pol } of rows) {
    if (pol !== 'is') throw Error('Expected operator facts');
    if (s === 'operators' && p === 'version') continue;
    if (s === 'operators' || !/^[A-Za-z0-9._-]{1,80}$/.test(s) || !['role', 'basicSha256'].includes(p)) throw Error('Invalid operator coordinate');
    if (!entries.has(s)) entries.set(s, new Map());
    const entry = entries.get(s);
    if (entry.has(p)) throw Error('Duplicate operator field');
    entry.set(p, o);
  }
  if (!entries.size || entries.size > 32) throw Error('Expected between 1 and 32 operators');
  const pins = new Set();
  const records = [...entries].map(([id, fields]) => {
    const role = fields.get('role'), pin = fields.get('basicSha256');
    if (!['proposer', 'reviewer', 'observer', 'worker', 'verifier', 'reconciler', 'curator'].includes(role) || !/^[a-f0-9]{64}$/i.test(pin ?? '') || pins.has(pin.toLowerCase())) {
      throw Error('Expected a valid distinct operator pin and role');
    }
    pins.add(pin.toLowerCase());
    return { id, role, digest: Buffer.from(pin, 'hex') };
  });
  return authorization => {
    const match = /^basic ([A-Za-z0-9+/=]{44,512})$/i.exec(authorization ?? '');
    if (!match) return null;
    const digest = createHash('sha256').update(match[1]).digest();
    let operator = null;
    for (const entry of records) {
      if (timingSafeEqual(entry.digest, digest)) operator = { id: entry.id, role: entry.role };
    }
    return operator;
  };
}
module.exports = { operators };
