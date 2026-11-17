'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getSourcePolicyMachine } = require('../../applications/encounter/bootstrap/source-policy-machine.cjs');
const { createKernel } = require('./temple-seed.cjs');
const { print } = require('./rel-values.cjs');

const applications = path.resolve(__dirname, '../../applications');
const budget = 20000000;
const packages = ['encounter', 'encounter-work-boards', 'encounter-portfolio'];
const defaults = packages.map(name => path.join(applications, name, 'bootstrap/application.rel'));
const defaultOwner = path.resolve(__dirname, '../authoring/application.loader.encounter');

function platformDeclarations() {
  const products = packages.slice(1).flatMap(name => {
    const directory = path.join(applications, name, 'products');
    return fs.readdirSync(directory, {withFileTypes:true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(directory, entry.name, 'application.rel'));
  });
  const runtime = path.join(applications, 'encounter-runtime');
  const profiles = new Set(fs.readdirSync(path.join(runtime, 'profiles'))
    .filter(name => /(?:\.rel|\.loader\.encounter)$/.test(name))
    .map(name => path.join(runtime, 'profiles', name.replace(/\.loader\.encounter$/, '.rel'))));
  const frontGate = ['directory.rel', 'pilot.rel'].map(name => path.join(applications, 'front-gate', name));
  return [...defaults, ...products, ...profiles, ...frontGate, path.join(runtime, 'release-applications-platform.rel')].sort();
}

async function render(file, text) {
  const {value} = getSourcePolicyMachine().compile(file, text);
  if (!value.ok) throw Error(file + ': ' + value.diagnostic.summary);
  const {queries} = value.surface;
  const steps = queries['loader.declaration'];
  if (Object.keys(queries).length !== 1 || steps?.length !== 1 ||
      steps[0].let !== 'result' || Object.keys(steps[0]).length !== 2 || !Object.hasOwn(steps[0], 'value'))
    throw Error('Expected one static loader declaration in ' + file);

  const env = {};
  await createKernel({}, budget).run(steps, env);
  if (!env.result || typeof env.result !== 'object' || Array.isArray(env.result))
    throw Error('Expected a loader declaration record in ' + file);
  const {notes = [], sections, ...extra} = env.result;
  if (Object.keys(extra).length || !Array.isArray(notes) ||
      !notes.every(note => typeof note === 'string' && !/[\r\n]/.test(note)) ||
      !Array.isArray(sections) || sections.length === 0)
    throw Error('Invalid loader declaration in ' + file);

  const facts = sections.flatMap(section => {
    if (!section || typeof section !== 'object' || Array.isArray(section))
      throw Error('Expected a loader section record in ' + file);
    const {subject, ...properties} = section;
    if (typeof subject !== 'string' || !subject.length || !Object.keys(properties).length)
      throw Error('Invalid loader section in ' + file);
    return Object.entries(properties).flatMap(([predicate, value]) => {
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || !values.every(item => typeof item === 'string'))
        throw Error('Invalid loader field ' + predicate + ' in ' + file);
      return values.map(object => ({s:subject, p:predicate, o:object}));
    });
  });
  return notes.map(note => '// ' + note + '\n').join('') + print(facts);
}

async function synchronize(files, write) {
  // Validate the complete selected set before replacing any projection.
  const projections = [];
  for (const file of files) {
    if (!file.endsWith('.rel')) throw Error('Expected a loader REL path: ' + file);
    const owner = defaults.includes(file) ? defaultOwner : file.replace(/\.rel$/, '.loader.encounter');
    let text;
    try {
      text = await render(path.basename(owner), fs.readFileSync(owner, 'utf8'));
    } catch (error) {
      throw new Error(owner + ': ' + error.message, {cause:error});
    }
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (text !== previous) projections.push({file, text});
  }
  if (!write && projections.length)
    throw Error('Generated loader REL differs from Encounter:\n' + projections.map(item => item.file).join('\n'));
  for (const {file, text} of projections) {
    const stage = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(stage, text, {flag:'wx'});
      fs.renameSync(stage, file);
    } finally {
      fs.rmSync(stage, {force:true});
    }
  }
  return {checked:files.length, updated:projections.length};
}

if (require.main === module) {
  const [mode, ...paths] = process.argv.slice(2);
  Promise.resolve().then(() => {
    if (!['--check', '--write'].includes(mode))
      throw Error('Usage: node shared/node/loader-declarations.cjs --check|--write [loader.rel ...]');
    const files = paths.length ? paths.map(file => path.resolve(file)) : platformDeclarations();
    return synchronize(files, mode === '--write');
  }).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {platformDeclarations, render, synchronize};
