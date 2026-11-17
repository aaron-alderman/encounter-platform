'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createProcessCompiler } = require('../vendor/worldwright/bootstrap/ports/process-source.cjs');
const { createKernel } = require('../vendor/worldwright/bootstrap/temple-seed.cjs');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const definitionFrontend = 'source/languages/usewords-frontend.json';
const executionBudget = 20000000;

function within(base, relative) {
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw Error('Path escapes its source or publication directory: ' + relative);
  return target;
}

// App-local logical names stay in source maps and measured receipts.
function sourceFile(root, file, libraries = {}) {
  return Object.hasOwn(libraries, file)
    ? within(path.resolve(root, '../encounter-libraries'), libraries[file])
    : within(root, file);
}

const compilerHost = (root, digest, libraries) => ({
  read: async file => fs.readFileSync(sourceFile(root, file, libraries), 'utf8'),
  digest
});

function createDefinitionCompiler() {
  return createProcessCompiler(compilerHost(root, digest), definitionFrontend, executionBudget);
}

async function loadDefinition(compiler,name,bindings={}){
 if(!/^[a-z][a-z-]*$/.test(name))throw Error('Invalid static owner name');
 const file='source/owners/'+name+'.encounter';
 const text=fs.readFileSync(sourceFile(root,file),'utf8'),result=await compiler.compile(file,text);
 const steps=result.surface.queries['owner.'+name];
 if(Object.keys(result.surface.queries).length!==1||!steps?.length||steps.at(-1).let!=='result'||
    steps.some(step=>typeof step.let!=='string'||Object.keys(step).length!==2||!Object.hasOwn(step,'value')))
  throw Error('USEWORDS-DEFINITION: Expected one static owner in '+file);
 const env={...bindings};
 await createKernel({},executionBudget).run(steps,env);
 if(!env.result||typeof env.result!=='object'||Array.isArray(env.result))
  throw Error('USEWORDS-DEFINITION: Expected a record from '+file);
 return {name,file,text,result,value:env.result};
}

async function loadBootstrap(compiler) {
  return loadDefinition(compiler ?? await createDefinitionCompiler(), 'bootstrap');
}

async function compileSources({root,manifest,digest,compilers=new Map(),libraries}){
 const host=compilerHost(root,digest,libraries),compiled=[];
 for(const spec of manifest.processModules){
  if(!compilers.has(spec.frontend))compilers.set(spec.frontend,await createProcessCompiler(host,spec.frontend,manifest.budget));
  const compiler=compilers.get(spec.frontend),text=await host.read(spec.file),result=await compiler.compile(spec.file,text);
  compiled.push({spec,text,result,compiler});
 }
 return compiled;
}

module.exports = {
  root, read, digest, definitionFrontend, executionBudget, within, sourceFile, compilerHost,
  createProcessCompiler, createDefinitionCompiler, compileSources, loadDefinition, loadBootstrap
};
