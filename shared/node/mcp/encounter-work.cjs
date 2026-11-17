'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { decode } = require('../rel-values.cjs');

const origin = new URL(process.env.ENCOUNTER_WORK_ORIGIN);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' ||
    origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('ENCOUNTER_WORK_ORIGIN must be a loopback Encounter HTTP origin.');
}
const authorization = process.env.ENCOUNTER_WORK_AUTHORIZATION;
if (!/^Basic [A-Za-z0-9+/]+=*$/.test(authorization ?? '')) {
  throw new Error('Set ENCOUNTER_WORK_AUTHORIZATION to the configured Encounter operator authorization.');
}

let cookie;
async function request(path, fields, kind, submission) {
  const url = new URL(path, origin);
  if (!submission) url.search = new URLSearchParams(fields);
  const headers = { authorization };
  if (cookie) headers.cookie = cookie;
  if (submission) {
    headers.origin = origin.origin;
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  const response = await fetch(url, {
    method: submission ? 'POST' : 'GET', headers, redirect: 'error',
    body: submission ? new URLSearchParams(fields) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Encounter returned HTTP ' + response.status);
  const session = response.headers.get('set-cookie');
  if (session) cookie = session.split(';', 1)[0];
  return decode(await response.text(), kind);
}

function work(task, extra = {}) {
  return request('/', { task, 'work-interface': '1', ...extra }, 'EncounterWorkReply');
}

function result(value) {
  const { csrf, ...visible } = value;
  return {
    content: [{ type: 'text', text: JSON.stringify(visible) }],
    structuredContent: visible,
    isError: visible.status === 'refused'
  };
}

const server = new McpServer({ name: 'encounter-work', version: '0.1.0' });
const task = z.string().min(1).max(128);
server.registerTool('inspect', {
  description: 'Inspect the current implementation, available moves and pinned evidence. Omit task to inspect the project queue.',
  inputSchema: { task: task.optional() }
}, async ({ task }) => result(task ? await work(task) :
  await request('/project', { format: 'rel', 'work-interface': '1' }, 'EncounterWorkQueue')));

server.registerTool('act', {
  description: 'Submit a move against the inspected revision. Reuse the operation ID when retrying the exact command.',
  inputSchema: {
    task, review: z.string().min(1).max(128), revision: z.number().int().nonnegative().safe(),
    operation: z.string().regex(/^[A-Za-z0-9_.-]{1,63}$/),
    action: z.enum(['open-investigation', 'return-investigation', 'accept-implementation', 'acknowledge-handoff']),
    item: z.string().max(128).optional(), investigation: z.string().max(128).optional(),
    question: z.string().max(500).optional(), finding: z.string().max(1200).optional()
  }
}, async ({ task, review, revision, operation, action, item, investigation, question, finding }) => {
  const inspected = await work(task);
  if (inspected.status !== 'ok') return result(inspected);
  const fields = { task, implementation: review, base: String(revision), operation, action,
    'work-interface': '1', _csrf: inspected.csrf };
  for (const [key, value] of Object.entries({ 'review-item': item, investigation, question, finding })) {
    if (value !== undefined) fields[key] = value;
  }
  return result(await request('/', fields, 'EncounterWorkReply', true));
});

server.registerTool('follow', {
  description: 'Read durable events after a revision cursor. Recipients can omit task to follow their handoff queue.',
  inputSchema: { task: task.optional(), after: z.number().int().nonnegative().max(999999999) }
}, async ({ task, after }) => result(task ? await work(task, { after: String(after) }) :
  await request('/project', { format: 'rel', 'work-interface': '1', after: String(after) }, 'EncounterWorkQueue')));

server.connect(new StdioServerTransport()).catch(error => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});
