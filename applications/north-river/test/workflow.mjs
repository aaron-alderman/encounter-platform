import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encode } from '../../encounter-runtime/test/rel-values.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function verifyWorkflow(check, evidence) {
  const result = execFileSync(process.env.ENCOUNTER_RUST_HOST, [
    'run', '--declaration', root, 'north-river/test/workflow.rel',
    check, encode(evidence, 'NorthRiverWorkflowObservation'),
  ], { encoding: 'utf8' });
  if (result.trim() !== 'pass') throw Error('Encounter workflow check did not pass: ' + check);
}
