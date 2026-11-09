'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUTHORING_MODULES = new Set([
  'source/actions.encounter', 'source/application.encounter', 'source/commands.encounter',
  'source/types.encounter', 'source/ui.encounter',
]);

function selectedRoot(root, component) {
  const selector = path.join(root, 'bootstrap', component + '.rel');
  if (!fs.existsSync(selector)) return root;
  const marker = `("${component}", "layout", "encounter-platform/shared-${component}/1")\n`;
  if (fs.realpathSync(selector) !== selector || fs.readFileSync(selector, 'utf8') !== marker) {
    throw Error(`Invalid shared ${component} selector`);
  }
  const applications = path.dirname(root);
  if (path.basename(applications) !== 'applications') throw Error(`Shared ${component} requires platform application layout`);
  const shared = path.join(path.dirname(applications), 'shared', component);
  if (fs.realpathSync(shared) !== shared || !fs.statSync(shared).isDirectory()) {
    throw Error(`Shared ${component} root link refused`);
  }
  return shared;
}

function readApplicationModules(root, files) {
  const rendering = selectedRoot(root, 'rendering');
  const authoring = selectedRoot(root, 'authoring');
  return files.map(file => {
    if (file.includes('\\') || file.split('/').some(part => part === '' || part === '.' || part === '..') ||
        path.isAbsolute(file) || !file.endsWith('.encounter')) {
      throw Error('Expected a portable Encounter application module path');
    }
    let base = root;
    if (/^algebra\/(html|css)\/[^/]+$/.test(file)) base = rendering;
    if (AUTHORING_MODULES.has(file)) base = authoring;
    const target = path.join(base, file);
    const resolved = fs.realpathSync(target);
    const relative = path.relative(base, resolved);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw Error('Application module escapes root');
    }
    if (base !== root && resolved !== target) throw Error('Shared application module link refused');
    return { file, text: fs.readFileSync(resolved, 'utf8') };
  });
}

module.exports = { readApplicationModules };
