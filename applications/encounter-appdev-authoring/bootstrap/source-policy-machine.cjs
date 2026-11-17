'use strict';
// Mechanical source-policy interpreter adapter. Seed source reading is confined
// to the trusted bootstrap descriptor; application text uses foundation.compile.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseEncounter:readSeed}=require('./seed-source-reader.cjs');
const {createKernel}=require('./temple-seed.cjs');
const {synchronousSeed}=require('./seed-sync.cjs');
const rel=require('./rel-values.cjs'),{valuePorts}=require('./ports/value.cjs'),{computationalPorts}=require('./ports/browser-effects.cjs');
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const {trustedRegexObservations}=require('./isolated-regexp.cjs');
function policyMechanisms({readSeed,createKernel,synchronousSeed,rel,valuePorts,numberCalculate,hash,regexObservations}){
  function sourcePolicyMachine({sources,basis,limit},observations={}){
    let definitions,profile;
    const primitives=createKernel.operators,seedQueries=Object.create(null),identities=[];
    for(const source of sources){const observed=readSeed(source.text,source.file);for(const [name,programme]of Object.entries(observed.queries)){if(Object.hasOwn(seedQueries,name))throw Error('Duplicate trusted bootstrap query');seedQueries[name]=programme;}identities.push({file:source.file,sha256:hash(source.text)});}
    const mechanics={...valuePorts(),...observations,...regexObservations,'number.calculate':numberCalculate,'digest.sha256':({text})=>hash(text),
      'scalar.read':({text})=>{const value=rel.decodeData(text);if(value!==null&&typeof value==='object')throw Error('Scalar text required');return value;},
      'rel.encode':({value,kind})=>rel.encode(value,kind),'rel.decode':({text,kind})=>rel.decode(text,kind)};
    const measurements=Object.create(null);
    function compute(model,query,input,bindings={},meter=null){
      let kernel;
      const ports={...mechanics,'kernel.invoke':({query,input},env)=>{const local={...env,eventInput:input};kernel.run(env.model.queries[query],local);return local.result;}};
      kernel=synchronousSeed(createKernel,ports,limit,meter);
      const before=kernel.usage.steps,env={...bindings,definitions,primitives,profile,compilerBasis:basis,model,eventInput:input};
      try{kernel.run(model.queries[query],env);return {value:env.result,usage:kernel.usage};}
      finally{
        const steps=kernel.usage.steps-before,measurement=measurements[query]??(measurements[query]={calls:0,sharedCaller:0,maxSteps:0,totalSteps:0});measurement.calls++;if(meter)measurement.sharedCaller++;measurement.maxSteps=Math.max(measurement.maxSteps,steps);measurement.totalSteps+=steps;
      }
    }
    const primitiveImage={queries:seedQueries};
    definitions=compute(primitiveImage,'foundation.laws',null).value;
    profile=compute(primitiveImage,'foundation.schema',null).value;
    let lowered=compute(primitiveImage,'lower.start',null,{mode:'model',input:primitiveImage}).value.value;
    compute(lowered,'foundation.checkLimit',{limit});
    const selfModules=[];
    for(const source of sources){
      const parsed=compute(lowered,'foundation.hydrate',{file:source.file,text:source.text,expectedTextSha256:hash(source.text),expectedBasis:basis}).value;
      if(rel.encode(parsed.surface)!==rel.encode({protocol:'temple/surface-process-module/1',queries:readSeed(source.text,source.file).queries}))throw Error('Bootstrap compiler correspondence failed: '+source.file);
      selfModules.push(parsed.surface);
    }
    // The operative image is reconstituted by the Encounter compiler itself.
    const bootstrapGrants=[...Object.keys(mechanics),'kernel.invoke'];
    const selfQueries=compute(lowered,'foundation.link',{modules:selfModules,selected:null,roots:null}).value.queries;
    lowered={queries:compute(lowered,'foundation.admit',{queries:selfQueries,entries:['foundation.compile'],grants:bootstrapGrants,available:bootstrapGrants}).value.queries};
    const hydrationCache=new Map(),inspectionCache=new Map();
    const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    return Object.freeze({identities,basis,get measurements(){return rel.decode(rel.encode(measurements));},
      compute:(query,input,bindings,meter)=>{
        if(query!=='foundation.hydrate')return compute(lowered,query,input,bindings,meter);
        const key=rel.encode(input);if(!hydrationCache.has(key)){const result=freeze(compute(lowered,query,input,bindings,meter));hydrationCache.set(key,result);inspectionCache.set(input.file+'\0'+input.text,result.value.inspection);}
        const cached=hydrationCache.get(key);return meter?{value:cached.value,usage:meter.usage}:cached;
      },
      observe:(file,text,meter)=>{compute(lowered,'foundation.sourceBounds',{file,text},{},meter);return inspectionCache.get(file+'\0'+text)??compute(lowered,'foundation.observe',{file,text,expectedTextSha256:hash(text),expectedBasis:basis},{},meter).value;},
      compile:(file,text,meter)=>{compute(lowered,'foundation.sourceBounds',{file,text},{},meter);return compute(lowered,'foundation.compile',{file,text,expectedTextSha256:hash(text),expectedBasis:basis},{},meter);}
    });
  }
  return {sourcePolicyMachine};
}
const {sourcePolicyMachine}=policyMechanisms({readSeed,createKernel,synchronousSeed,rel,valuePorts,numberCalculate:computationalPorts()['number.calculate'],hash:digest,regexObservations:trustedRegexObservations()});
function loadSourcePolicyDescriptor(){
  const root=path.resolve(__dirname,'..');
  const read=file=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(fs.readFileSync(file));
  const text=read(path.join(__dirname,'foundation.rel')),declaration=rel.parse(text);
  const files=declaration.filter(f=>f.s==='foundation'&&f.p==='module').map(f=>f.o);
  const pinnedRead=file=>{
    const target=path.resolve(root,file);if(path.relative(root,target).startsWith('..')||path.isAbsolute(path.relative(root,target)))throw Error('Bootstrap source escapes root');
    let cursor=root;for(const part of path.relative(root,target).split(path.sep)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())throw Error('Bootstrap source link refused');}
    const body=read(target),pins=declaration.filter(f=>f.s===file&&f.p==='sha256');
    if(pins.length!==1||pins[0].o!==digest(body))throw Error('Bootstrap source pin mismatch: '+file);return body;
  };
  const sources=files.map(file=>({file,text:pinnedRead(file)}));
  const basis=digest(rel.encode({declaration:digest(text),sources:sources.map(s=>({file:s.file,sha256:digest(s.text)}))}));
  const limits=declaration.filter(f=>f.s==='foundation'&&f.p==='limit');if(limits.length!==1)throw Error('Bootstrap resource declaration required');
  return {sources,basis,limit:Number(limits[0].o),declaration:digest(text)};
}
let shared;
function loadSourcePolicyMachine(){const computational=computationalPorts();return sourcePolicyMachine(loadSourcePolicyDescriptor(),{
  'markup.parse':({text})=>require('./markup-observation.cjs').observeHtml(text),
  'url.observe':({value,base})=>{const url=new URL(value,base);return {href:url.href,origin:url.origin,protocol:url.protocol,path:decodeURIComponent(url.pathname.slice(1)),fragment:url.hash,search:url.search};},
  'text.replace':computational['text.replace'],'text.match':computational['text.match']
});}
function getSourcePolicyMachine(){return shared??(shared=loadSourcePolicyMachine());}
module.exports={sourcePolicyMachine,policyMechanisms,loadSourcePolicyDescriptor,loadSourcePolicyMachine,getSourcePolicyMachine};

