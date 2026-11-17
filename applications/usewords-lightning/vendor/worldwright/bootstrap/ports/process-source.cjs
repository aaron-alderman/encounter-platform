'use strict';
// Generic source loading, identity, lowering, admission and invocation only.
// Language grammar and AST construction belong to the selected algebra frontend.
const {createKernel}=require('../temple-seed.cjs');
const {lower}=require('./algebra-lower.cjs');
const {invoke}=require('./programme.cjs');
const {valuePorts}=require('./value.cjs');
const {computationalPorts}=require('./browser-effects.cjs');
async function createProcessCompiler(host,manifestFile,limit=20000000){
 const manifest=JSON.parse(await host.read(manifestFile)),unsigned={...manifest};delete unsigned.identity;
 if(manifest.protocol!=='temple/process-frontend/1'||host.digest(JSON.stringify(unsigned))!==manifest.identity)throw Error('Process frontend identity mismatch');
 const files=new Map();for(const item of manifest.files){const text=await host.read(item.path);if(host.digest(text)!==item.sha256)throw Error('Process frontend source drift: '+item.path);files.set(item.path,text);}
 const read=file=>{if(!files.has(file))throw Error('Undeclared process frontend dependency: '+file);return JSON.parse(files.get(file));};
 const queries=Object.create(null);for(const selection of manifest.modules){const module=read(selection.file);for(const name of selection.queries??Object.keys(module.queries)){if(Object.hasOwn(queries,name))throw Error('Duplicate compiler query: '+name);queries[name]=module.queries[name];}}
 const mechanisms={...valuePorts(),...computationalPorts()},ports={};for(const name of manifest.grants){if(name==='kernel.invoke')continue;if(!Object.hasOwn(mechanisms,name))throw Error('Nonmechanical compiler port: '+name);ports[name]=mechanisms[name];}
 const compile=input=>lower({compiler:read(manifest.lowering),definitions:read(manifest.operators),primitives:createKernel.operators,input,mode:'model',ports:valuePorts(),limit});
 const model=await compile({entry:manifest.entry,queries}),admission=await compile(read(manifest.admission)),profile=read(manifest.kernelProfile),admissions=[];
 for(const entry of ['admit.model','admit.effects']){const r=await invoke({model:admission,entry,input:{target:model,profile,grants:manifest.grants},ports:valuePorts(),limit});admissions.push(r.usage.steps);}
 const data={};for(const [name,spec]of Object.entries(manifest.data)){let value=read(spec.file);for(const key of spec.path??[])value=value[key];data[name]=value;}
 const basis={runtime:manifest.identity};
 return {identity:manifest.identity,model,data,basis,admissions,async link(surface,dependencies){return invoke({model,entry:'language.process.link',input:{...data,lpFile:'process-source-link',lpText:'',lpDependencies:dependencies,eventInput:{surface}},ports,nested:['kernel.invoke'],limit});},async compile(file,text){const result=await invoke({model,entry:manifest.entry,input:{...data,lpBasis:basis,eventInput:{file,text,expectedTextSha256:host.digest(text),expectedBasis:basis}},ports,nested:['kernel.invoke'],limit});if(!result.value.ok)throw Object.assign(Error(result.value.diagnostic.summary),{diagnostic:result.value.diagnostic});return {...result.value,steps:result.usage.steps};}};
}
module.exports={createProcessCompiler};
