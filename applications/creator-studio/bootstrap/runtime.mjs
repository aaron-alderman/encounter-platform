import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {compileSources,sourceFile} from './frontend.mjs';
const require=createRequire(import.meta.url);
export const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
export const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const {createKernel}=require('../vendor/worldwright/bootstrap/temple-seed.cjs');
const {lower}=require('../vendor/worldwright/bootstrap/ports/algebra-lower.cjs');
const {valuePorts}=require('../vendor/worldwright/bootstrap/ports/value.cjs');
const {computationalPorts}=require('../vendor/worldwright/bootstrap/ports/browser-effects.cjs');
const {kernelPorts}=require('../vendor/worldwright/bootstrap/ports/kernel.cjs');
const {childBoundary}=require('./client.cjs');
export const purePorts=()=>({...valuePorts(),...computationalPorts()});
export async function loadRuntime(){
  const manifest=read('source/runtime.json');
  const sources=Object.fromEntries(manifest.sources.map(file=>[file,digest(fs.readFileSync(sourceFile(root,file)))]));
  const identity=digest(JSON.stringify(sources));
  const queries={};
  for(const selection of manifest.modules){
   const file=typeof selection==='string'?selection:selection.file, module=read(file);
   for(const name of (typeof selection==='string'?Object.keys(module.queries):selection.queries)){
    if(Object.hasOwn(queries,name))throw Error('Duplicate process owner: '+name);
    queries[name]=module.queries[name];
   }
  }
  const compiled=await compileSources({root,manifest,digest});
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
  const data={canonical:read('source/canonical.json'),canonicalHash:digest(JSON.stringify(read('source/canonical.json'))),programHash:identity,identity:sources,words:read('source/words.json'),page:read('source/page.json'),style:read('source/style.json'),policy:authored.result.surface,policySource:authored.text,languages:read('source/languages.json'),sourceMap:{file:authored.spec.file,sourceHash:authored.result.sourceHash,basis:authored.result.basis,origins:authored.result.origins},bindings:{...read('vendor/worldwright/frontend/presentation.json'),lexPolicy:read('vendor/worldwright/frontend/lexical.json')}};
  data.journeys=read('source/journeys.json');
  data.journeyCanonical={...data.canonical,codeText:fs.readFileSync(sourceFile(root,'source/journeys.encounter'),'utf8'),factText:fs.readFileSync(sourceFile(root,'source/journeys.rel'),'utf8'),contractText:fs.readFileSync(sourceFile(root,'source/journeys-contracts.rel'),'utf8')};
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
  return {model,data,manifest,sources,identity,compiled,run:(entry,input,ports)=>dispatch(entry,input,ports)};
}
