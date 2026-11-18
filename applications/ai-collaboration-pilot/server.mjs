import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const route = '/ai-collaboration/';
const usewordsRoute = '/usewords/';
const launcherRoute = '/_appdev-private-usewords';
const require = createRequire(import.meta.url);
let hostedMatter;
const cookie = '__Host-encounter_' + createHash('sha256').update('/identity-management').digest('hex');
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
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    // Same-origin form posts need a serialized Origin for the write check.
    'Referrer-Policy': 'same-origin',
  });
  response.end(body);
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

createServer(async (request, response) => {
  try {
    const project = request.url === usewordsRoute && ['GET', 'POST'].includes(request.method);
    const styles = request.url === '/usewords/style.css' && request.method === 'GET';
    const launcher = request.url === launcherRoute && request.method === 'GET';
    const formerProject = request.url === route && request.method === 'GET';
    if (!config.usewords || (!project && !styles && !launcher && !formerProject)) {
      return send(response, 404, 'Not found');
    }
    const signedIn = await member(request);
    if (launcher) {
      const headers = { 'Cache-Control': 'private, no-store' };
      if (signedIn) headers['X-Usewords-Visible'] = 'yes';
      return response.writeHead(204, headers).end();
    }
    if (!signedIn) return send(response, 404, 'Not found');
    if (formerProject) {
      return response.writeHead(303, { Location: usewordsRoute, 'Cache-Control': 'private, no-store' }).end();
    }
    if (!hostedMatter) {
      const { createHostedMatter } = require(config.usewords.adapter);
      hostedMatter = createHostedMatter({ ...config.usewords, origin: config.origin }, config.members)
        .catch(error => { hostedMatter = undefined; throw error; });
    }
    const handle = await hostedMatter;
    return await handle({ request, response, signedIn, recheck: () => member(request), readForm: form,
      send: (status, body, type) => send(response, status, body, type) });
  } catch {
    send(response, 503, 'The request could not be completed. Please try again.');
  }
}).listen(config.port, '127.0.0.1');
