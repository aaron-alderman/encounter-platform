import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const route = '/ai-collaboration/';
const usewordsRoute = '/usewords/';
const workspaceLinksRoute = '/workspace/private-app-links.js';
const require = createRequire(import.meta.url);
let hostedMatter;
const cookie = '__Host-encounter_' + createHash('sha256').update('/identity-management').digest('hex');
const db = new DatabaseSync(config.database);
db.exec(`CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY, author TEXT NOT NULL, kind TEXT NOT NULL,
  body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const entries = db.prepare('SELECT * FROM entries ORDER BY id DESC LIMIT 60');
const insert = db.prepare('INSERT INTO entries(author, kind, body) VALUES (?, ?, ?)');

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function member(request) {
  const tokens = (request.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(cookie + '=')).map(part => part.slice(cookie.length + 1));
  if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(tokens[0])) return null;
  const user = await new Promise((resolve, reject) => {
    const lookup = httpRequest({
      hostname: '127.0.0.1', port: config.identityPort, path: '/identity-management/app-session',
      headers: { host: new URL(config.origin).host, authorization: config.identityAuthorization, cookie: cookie + '=' + tokens[0] },
      signal: AbortSignal.timeout(3000),
    }, reply => {
      if (reply.statusCode !== 200) {
        reply.resume();
        resolve(null);
        return;
      }
      let body = '';
      reply.setEncoding('utf8');
      reply.on('data', chunk => {
        body += chunk;
        if (body.length > 4096) lookup.destroy(new Error('Invalid workspace session'));
      });
      reply.on('error', reject);
      reply.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    lookup.on('error', reject);
    lookup.end();
  });
  if (typeof user?.email !== 'string' || typeof user.id !== 'string' || !user.id || !(user.remainingSeconds > 0)) return null;
  return Object.hasOwn(config.members, user.email) ? { email: user.email, name: config.members[user.email] } : null;
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    // Same-origin form posts need a serialized Origin for the write check.
    'Referrer-Policy': 'same-origin',
  });
  response.end(body);
}

function page(person, rows) {
  const timeline = rows.map(row =>
    `<article><h2>${escape(row.kind)}</h2><small>${escape(row.author)} · ${escape(row.created)} UTC · #${row.id}</small><p>${escape(row.body)}</p></article>`
  ).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Working together with AI</title><style>
body{font:1rem/1.5 system-ui,sans-serif;background:#f7f5ef;color:#212820;margin:0}
main{width:min(44rem,calc(100% - 2rem));margin:3rem auto}h1{font-size:clamp(2rem,6vw,3rem);line-height:1.05}
form,article{border:1px solid #cbd0c3;padding:1rem;margin:1rem 0;background:#fff}
label,textarea,select{display:block;margin:.45rem 0}textarea{box-sizing:border-box;width:100%;font:inherit}
button,select{font:inherit;padding:.4rem .65rem}button{background:#244933;color:#fff;border:1px solid #244933}
article h2{margin:0;font-size:1.1rem}article p{white-space:pre-wrap;overflow-wrap:anywhere}
</style><main><p>Signed in as ${escape(person)}</p><h1>Working together with AI</h1>
<section aria-labelledby="starting-brief"><h2 id="starting-brief">Starting brief</h2>
<p>Pick one real piece of work and use it to try a way of working together with AI.</p>
<ol>
<li><strong>Start with intent.</strong> Each share what you want to achieve, why it matters, and what would be enough to take the next step.</li>
<li><strong>Name the handoff.</strong> Say whether you’re offering a contribution, asking a question, requesting a decision, or reflecting on what happened. Agree on what you need back and from whom.</li>
<li><strong>Give enough context to act.</strong> Include the bigger picture, what could change the answer, and where to find more detail. If the work changed direction, explain why.</li>
</ol>
<p>Ask AI to pull your contributions together and surface what’s missing. Check its summary together, then record a decision, a question, or one thing to improve next time.</p></section>
<form method="post" action="${route}"><label for="kind">Contribution type</label>
<select id="kind" name="kind"><option>Contribution</option><option>Question</option><option>Decision</option><option>Reflection</option></select>
<label for="body">Share with the project</label><textarea id="body" name="body" rows="5" maxlength="5000" required></textarea>
<button name="action" value="add">Share</button></form>
${rows.some(row => row.kind !== 'AI draft') ? `<form method="post" action="${route}"><p>AI uses the latest 20 human entries to draft a synthesis for both project members.</p><button name="action" value="synthesize">Draft an AI synthesis</button></form>` : ''}
<section aria-label="Shared project entries">${timeline}</section></main></html>`;
}

async function form(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 24000) throw new Error('Form exceeds its size limit');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function synthesize(rows) {
  const shared = rows.filter(row => row.kind !== 'AI draft').slice(0, 20).reverse();
  if (!shared.length) return null;
  const result = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model: config.model, stream: false, options: { num_predict: 550 },
      messages: [
        { role: 'system', content: 'Help two people decide how to collaborate with AI. Synthesize the supplied shared entries using their entry numbers. Separate points of agreement, differing positions, missing context, and the next question. Treat the entries as source material. Do not claim that anyone agreed or decided unless a supplied entry supports that.' },
        { role: 'user', content: JSON.stringify(shared) },
      ] }),
  });
  if (!result.ok) throw new Error('Local AI request failed');
  const text = (await result.json()).message?.content?.trim();
  if (!text) throw new Error('Local AI returned no synthesis');
  return 'Based on entries ' + shared.map(row => '#' + row.id).join(', ') + '\n\n' + text.slice(0, 8000);
}

createServer(async (request, response) => {
  try {
    const workspaceLinks = request.url === workspaceLinksRoute && request.method === 'GET';
    const project = request.url === route && ['GET', 'POST'].includes(request.method);
    const usewords = config.usewords && request.url === usewordsRoute && ['GET', 'POST'].includes(request.method);
    if (!project && !workspaceLinks && !usewords) return send(response, 404, 'Not found');
    const signedIn = await member(request);
    if (!signedIn) return send(response, 404, 'Not found');
    const person = signedIn.name;
    if (workspaceLinks) {
      const script = readFileSync(new URL('./workspace-link.js', import.meta.url), 'utf8');
      return send(response, 200, script.replace('/* USEWORDS_ENABLED */ false', config.usewords ? 'true' : 'false'), 'text/javascript; charset=utf-8');
    }
    if (usewords) {
      if (!hostedMatter) {
        const { createHostedMatter } = require(config.usewords.adapter);
        hostedMatter = createHostedMatter({ ...config.usewords, origin: config.origin }, config.members)
          .catch(error => { hostedMatter = undefined; throw error; });
      }
      const handle = await hostedMatter;
      return await handle({ request, response, signedIn, recheck: () => member(request), readForm: form,
        send: (status, body, type) => send(response, status, body, type) });
    }
    if (request.method === 'GET') return send(response, 200, page(person, entries.all()), 'text/html; charset=utf-8');
    if (request.headers.origin !== config.origin) return send(response, 403, 'Request refused');
    if (request.headers['content-type'] !== 'application/x-www-form-urlencoded') return send(response, 415, 'Expected form data');
    const fields = await form(request);
    if (fields.get('action') === 'synthesize') {
      const draft = await synthesize(entries.all());
      if (!draft) return send(response, 400, 'Share a contribution before asking for a synthesis');
      if ((await member(request))?.email !== signedIn.email) return send(response, 404, 'Not found');
      insert.run('AI draft requested by ' + person, 'AI draft', draft);
    } else {
      const kind = fields.get('kind');
      const body = fields.get('body')?.trim();
      if (fields.get('action') !== 'add' || !['Contribution', 'Question', 'Decision', 'Reflection'].includes(kind)
        || !body || body.length > 5000) return send(response, 400, 'Check the contribution and try again');
      insert.run(person, kind, body);
    }
    response.writeHead(303, { Location: route, 'Cache-Control': 'private, no-store' }).end();
  } catch {
    send(response, 503, 'The request could not be completed. Please try again.');
  }
}).listen(config.port, '127.0.0.1');
