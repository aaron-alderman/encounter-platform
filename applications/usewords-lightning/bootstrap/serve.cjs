'use strict';

const http = require('node:http');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadBootstrap, root, within } = require('./frontend.cjs');

async function serve() {
  execFileSync(process.env.ENCOUNTER || process.env.PORTFOLIO_ENCOUNTER || 'encounter',
    ['check-package', root], { stdio: 'inherit' });
  const { value: { publication, preview } } = await loadBootstrap();
  const port = Number(process.env.USEWORDS_PORT ?? preview.port);
  const base = path.join(root, 'dist');
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? publication.html : pathname.slice(1);
      const file = within(base, relative);
      const bytes = fs.readFileSync(file);
      const mime = preview.mime[path.extname(file)] ?? preview.fallback;
      res.writeHead(200, { 'Content-Type': mime, ...preview.headers });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + server.address().port));
  return server;
}

function main() {
  return serve().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

if (require.main === module) void main();
module.exports = { main };
