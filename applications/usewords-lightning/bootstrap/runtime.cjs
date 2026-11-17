'use strict';

const fs = require('node:fs');
const {
  root, read, digest, definitionFrontend, executionBudget, compileSources, sourceFile,
  createDefinitionCompiler, loadDefinition, loadBootstrap
} = require('./frontend.cjs');
const {createKernel}=require('../vendor/worldwright/bootstrap/temple-seed.cjs');
const {lower}=require('../vendor/worldwright/bootstrap/ports/algebra-lower.cjs');
const {valuePorts}=require('../vendor/worldwright/bootstrap/ports/value.cjs');
const {computationalPorts}=require('../vendor/worldwright/bootstrap/ports/browser-effects.cjs');
const {kernelPorts}=require('../vendor/worldwright/bootstrap/ports/kernel.cjs');
const {childBoundary}=require('./client.cjs');
const purePorts=()=>({...valuePorts(),...computationalPorts()});

async function loadRuntime(){
  const compiler=await createDefinitionCompiler();
  const bootstrap=await loadBootstrap(compiler);
  const {libraries}=bootstrap.value;
  const fragments=[], fragmentBindings={}, definitions=[];
  for(const [binding,name] of Object.entries(bootstrap.value.fragments)){
   const fragment=await loadDefinition(compiler,name);
   fragments.push(fragment);
   fragmentBindings[binding]=fragment.value;
  }
  for(const spec of bootstrap.value.definitions){
   const definition=await loadDefinition(compiler,spec.name,spec.fragments?fragmentBindings:{});
   definitions.push({...definition,output:spec.output});
  }
  const definitionSources=[...definitions,...fragments,bootstrap];
  const {runtime:manifest,page,style,words}=Object.fromEntries(definitions.map(item=>[item.name,item.value]));
  if(manifest.protocol!=='usewords/runtime/1'||manifest.budget!==executionBudget||
     !definitionSources.every(item=>manifest.sources.includes(item.file))||definitions.some(item=>manifest.sources.includes(item.output)))
   throw Error('USEWORDS-DEFINITION: The runtime must measure the Encounter owners and preserve the execution budget.');
  const sources=Object.fromEntries(manifest.sources.map(file=>[file,digest(fs.readFileSync(sourceFile(root,file,libraries)))]));
  for(const item of definitionSources)if(item.result.sourceHash!==sources[item.file])
   throw Error('Compiled definition differs from measured bytes: '+item.file);
  const identity=digest(JSON.stringify(sources));
  const queries={};
  for(const selection of manifest.modules){
   const file=typeof selection==='string'?selection:selection.file, module=read(file);
   for(const name of (typeof selection==='string'?Object.keys(module.queries):selection.queries)){
    if(Object.hasOwn(queries,name))throw Error('Duplicate process owner: '+name);
    queries[name]=module.queries[name];
   }
  }
  const compiled=await compileSources({root,manifest,digest,compilers:new Map([[definitionFrontend,compiler]]),libraries});
  for(const item of compiled){
   if(item.result.sourceHash!==sources[item.spec.file])throw Error('Compiled source differs from measured bytes: '+item.spec.file);
   for(const [name,steps]of Object.entries(item.result.surface.queries)){
    if(Object.hasOwn(queries,name))throw Error('Duplicate process owner: '+name);
    queries[name]=steps;
   }
  }
  for(const item of compiled)await item.compiler.link(item.result.surface,queries);
  const model=await lower({compiler:read(manifest.lowerer),definitions:read(manifest.definitions),primitives:createKernel.operators,input:{queries,entry:manifest.entry},mode:'model',ports:purePorts(),limit:manifest.budget});
  const authored=compiled.find(item=>item.spec.file===manifest.policySource);
  const data={canonical:read('source/canonical.json'),canonicalHash:digest(JSON.stringify(read('source/canonical.json'))),programHash:identity,identity:sources,words,page,style,policy:authored.result.surface,policySource:authored.text,languages:read('source/languages.json'),sourceMap:{file:authored.spec.file,sourceHash:authored.result.sourceHash,basis:authored.result.basis,origins:authored.result.origins},bindings:{...read('vendor/worldwright/frontend/presentation.json'),lexPolicy:read('vendor/worldwright/frontend/lexical.json')}};
  data.journeys=read('source/journeys.json');
  data.journeyCanonical={...data.canonical,codeText:fs.readFileSync(sourceFile(root,'source/journeys.encounter',libraries),'utf8'),factText:fs.readFileSync(sourceFile(root,'source/journeys.rel',libraries),'utf8'),contractText:fs.readFileSync(sourceFile(root,'source/journeys-contracts.rel',libraries),'utf8')};
  data.journeyCanonicalHash=digest(JSON.stringify(data.journeyCanonical));
  data.workspaceSeed=read('source/workspace-seed.json');
  data.applicationBoundary={
    grants:manifest.grants,
    owners:Object.fromEntries(compiled.flatMap(({spec,result})=>
      Object.keys(result.surface.queries).map(query=>[query,spec.file]))),
  };
  const boundary=childBoundary(model,valuePorts()['value.freeze']);
  const dispatch=async(entry,eventInput={},ports={},bindings={})=>{
    let kernel;
    const bridge=boundary.ports(kernelPorts,()=>kernel);
    kernel=createKernel({...purePorts(),...ports,...bridge},manifest.budget);
    const env={...data.bindings,eventInput,data,...bindings,model};
    if(!Object.hasOwn(model.queries,entry))throw Error('Unknown process entry');
    await kernel.run(model.queries[entry],env);
    return {value:boundary.remember(entry,model,env.result),usage:kernel.usage};
  };
  for(const entry of ['admit.model','admit.effects'])await dispatch(entry,{}, {},{
    target:model,profile:read('vendor/worldwright/bootstrap/kernel-profile.json'),grants:manifest.grants,
  });
  return {model,data,manifest,sources,identity,compiled,definitions,fragments,bootstrap:bootstrap.value,run:(entry,input,ports)=>dispatch(entry,input,ports)};
}

module.exports = { loadRuntime, root, read, digest, purePorts };
