import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const route = '/ai-collaboration/';
const usewordsRoute = '/usewords/';
const signInReturn = '/encounter-pilot/open-usewords';
const launcherRoute = '/_appdev-private-usewords';
const require = createRequire(import.meta.url);
let hostedMatter;
const cookie = '__Host-encounter_' + createHash('sha256').update('/identity-management').digest('hex');
async function workspaceSession(request) {
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
        if (reply.statusCode === 401) resolve(null);
        else reject(new Error('Workspace session check failed'));
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
  return user;
}

function member(user) {
  return user && Object.hasOwn(config.members, user.email)
    ? { email: user.email, name: config.members[user.email] }
    : null;
}

function redirect(response, destination) {
  response.writeHead(303, { Location: destination, 'Cache-Control': 'private, no-store' }).end();
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
    const bookmark = [route, signInReturn].includes(request.url) && request.method === 'GET';
    if (!config.usewords || (!project && !styles && !launcher && !bookmark)) {
      return send(response, 404, 'Not found');
    }
    const user = await workspaceSession(request);
    const signedIn = member(user);
    if (launcher) {
      const headers = { 'Cache-Control': 'private, no-store' };
      if (signedIn) headers['X-Usewords-Visible'] = 'yes';
      return response.writeHead(204, headers).end();
    }
    if (!user && request.method === 'GET' && (project || bookmark)) {
      return redirect(response, '/identity-management/?' + new URLSearchParams({ 'workspace-return': signInReturn }));
    }
    if (!signedIn) return send(response, 404, 'Not found');
    if (bookmark) return redirect(response, usewordsRoute);
    if (!hostedMatter) {
      const { createHostedMatter } = require(config.usewords.adapter);
      hostedMatter = createHostedMatter({ ...config.usewords, origin: config.origin }, config.members)
        .catch(error => { hostedMatter = undefined; throw error; });
    }
    const handle = await hostedMatter;
    return await handle({ request, response, signedIn, recheck: async () => member(await workspaceSession(request)), readForm: form,
      send: (status, body, type) => send(response, status, body, type) });
  } catch {
    send(response, 503, 'The request could not be completed. Please try again.');
  }
}).listen(config.port, '127.0.0.1');
