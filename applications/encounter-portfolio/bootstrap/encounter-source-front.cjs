'use strict';
// Mechanical capability transport. Language, linking, lowering, grants and
// admission decisions are computed by the declared Encounter policy machine.
const {createHash}=require('node:crypto'),rel=require('./rel-values.cjs');
const {createKernel}=require('./temple-seed.cjs');
const {getSourcePolicyMachine}=require('./source-policy-machine.cjs');
function sourceFrontMechanisms({createKernel,rel,policy,hash,regexp}){
  const seal=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(seal);Object.freeze(value);}return value;};
  function makeFrontDoor({profiles,ports,basis,limit},caller=null){
    const decide=(query,input,meter=caller)=>policy.compute(query,input,{},meter).value;
    const config=decide('foundation.configuration',null);
    if(limit===undefined)limit=config.runtimeLimit;
    decide('foundation.checkLimit',{limit});
    const available=Object.assign(Object.create(null),ports),bridges=['kernel.invoke','encounter.evaluate','encounter.execute','encounter.source'],names=[...Object.keys(available),...bridges];
    if(Object.values(available).some(value=>typeof value!=='function'))throw TypeError('Mechanical ports must be callable');
    const profileTable=rel.decode(rel.encode(profiles));decide('foundation.profiles',{profiles:profileTable,available:names});
    const candidates=new WeakMap(),links=new WeakMap(),admissions=new WeakMap(),models=new WeakMap(),indices=new WeakMap();
    function hydrate(file,text,meter=caller){
      decide('foundation.sourceBounds',{file,text},meter);
      const hydrated=decide('foundation.hydrate',{file,text,expectedTextSha256:hash(text),expectedBasis:policy.basis},meter);
      const token=Object.freeze({file,sourceSha256:hydrated.sourceSha256,hydrationSha256:hydrated.hydrationSha256,rel:hydrated.rel,basis,policyBasis:policy.basis});
      candidates.set(token,{file,sourceSha256:hydrated.sourceSha256,hydrationSha256:hydrated.hydrationSha256,surface:seal(hydrated.surface)});return token;
    }
    function link(values,{queries,roots}={}){
      if(!Array.isArray(values)||!values.length)throw Error('Compiler candidates required');
      const modules=[],sources=[],origins=Object.create(null);
      for(const value of values){const candidate=candidates.get(value);if(!candidate)throw Error('Foreign or forged Encounter hydration');modules.push(candidate.surface);sources.push({file:candidate.file,sha256:candidate.sourceSha256,hydrationSha256:candidate.hydrationSha256});for(const name of Object.keys(candidate.surface.queries))origins[name]={file:candidate.file,sha256:candidate.sourceSha256};}
      const linked=decide('foundation.link',{modules,selected:queries??null,roots:roots??null});
      const token=Object.freeze({basis,policyBasis:policy.basis,sourceCount:sources.length});links.set(token,{queries:seal(linked.queries),sources,origins});return token;
    }
    function check(queries,grants,entries,meter){return decide('foundation.admit',{queries,grants,entries,available:names},meter);}
    function admit(token,{profile,entries}={}){
      const linked=links.get(token);if(!linked)throw Error('Compiler-owned linked hydration required');
      const grants=decide('foundation.selectProfile',{profiles:profileTable,name:profile}),checked=check(linked.queries,grants,entries);
      const model=seal({queries:checked.queries}),receipt=rel.encode({basis,policyBasis:policy.basis,profile,sources:linked.sources,queries:Object.keys(model.queries),entries:checked.entries,grants:checked.grants},'AdmissionReceipt');
      models.set(model,{queries:linked.queries,origins:linked.origins});const handle=Object.freeze({receipt});admissions.set(handle,{model,entries:new Set(checked.entries),grants:checked.grants});return handle;
    }
    async function index(handle,{facts}={}){
      const admitted=admissions.get(handle);if(!admitted||!Object.hasOwn(admitted.model.queries,config.factIndexer))throw Error('An admitted Encounter fact indexer is required');
      const text=rel.print(facts),checked=rel.parse(text),mechanics=Object.create(null),kernel=createKernel(mechanics,limit);
      const grants=decide('foundation.indexGrants',{available:names},kernel);
      for(const name of grants)mechanics[name]=available[name];Object.freeze(mechanics);
      const env={model:admitted.model,input:checked};await kernel.run(admitted.model.queries[config.factIndexer],env);
      const encoded=rel.encode(env.result),value=rel.decode(encoded);decide('foundation.indexResult',{value,count:checked.length},kernel);
      const receipt=rel.encode({basis,policyBasis:policy.basis,admissionSha256:hash(handle.receipt),factsSha256:hash(text),indexSha256:hash(encoded),factCount:checked.length,usage:kernel.usage},'FactIndexReceipt');
      const token=Object.freeze({receipt});indices.set(token,{owner:handle,value});return token;
    }
    async function run(handle,entry,{input=null,facts=[],factSnapshot=null,data=null,bindings={}}={}){
      const admitted=admissions.get(handle);if(!admitted||!admitted.entries.has(entry))throw Error('An admitted entry is required');
      const checkedFacts=rel.parse(rel.print(facts)),snapshot=factSnapshot===null?null:indices.get(factSnapshot);
      if(factSnapshot!==null&&(!snapshot||snapshot.owner!==handle||checkedFacts.length))throw Error('Compiler-owned fact snapshot for this admission is required');
      const clone=value=>rel.decode(rel.encode(value)),scope=(value,meter=null)=>{const data=clone(value??{});decide('foundation.bindings',{value:data},meter);return data;};
      const selected=Object.create(null),kernel=createKernel(selected,limit);
      const safeBindings=scope(bindings,kernel),pure=decide('foundation.childGrants',{available:names},kernel),trace=[];
      const childImages=new Map();
      function child(text,entry,expression=false){
        const source=expression?decide('foundation.expressionText',{text},kernel):text;
        if(childImages.has(source)){const cached=childImages.get(source);if(expression)decide('foundation.expressionImage',{queries:cached.model.queries},kernel);decide('foundation.entry',{queries:cached.model.queries,entry},kernel);trace.push(rel.encode({...rel.decode(cached.receipt,'AdmissionReceipt'),entry},'AdmissionReceipt'));return cached.model;}
        const candidate=candidates.get(hydrate(expression?config.expressionFile:config.dynamicFile,source,kernel));
        if(expression)decide('foundation.expressionImage',{queries:candidate.surface.queries},kernel);
        const checked=check(candidate.surface.queries,pure,[entry],kernel),model=seal({queries:checked.queries});
        models.set(model,{queries:candidate.surface.queries,origins:Object.fromEntries(Object.keys(candidate.surface.queries).map(name=>[name,{file:candidate.file,sha256:candidate.sourceSha256}]))});
        const receipt=rel.encode({basis,policyBasis:policy.basis,profile:'source-owned-child',source:{file:candidate.file,sha256:candidate.sourceSha256,hydrationSha256:candidate.hydrationSha256},entry,grants:pure},'AdmissionReceipt');trace.push(receipt);childImages.set(source,{model,receipt});return model;
      }
      for(const name of new Set([...admitted.grants,...pure])){
        if(name==='kernel.invoke')selected[name]=async({query,input},env)=>{if(!models.has(env.model)||!Object.hasOwn(env.model.queries,query))throw Error('Unknown admitted Encounter query');const local={...env,eventInput:input??{}};await kernel.run(env.model.queries[query],local);return local.result??null;};
        else if(name==='encounter.source')selected[name]=({query},env)=>{const origin=models.get(env.model);if(!origin||!Object.hasOwn(origin.queries,query))throw Error('Unknown compiler-owned source query');return seal({...origin.origins[query],programme:origin.queries[query]});};
        else if(name==='encounter.evaluate')selected[name]=(args)=>{decide('foundation.bridgeArguments',{method:name,arguments:args},kernel);const model=child(args.text,'expression',true);return kernel.evaluate(model.queries.expression[0].value,scope(args.bindings,kernel));};
        else if(name==='encounter.execute')selected[name]=async(args,env)=>{decide('foundation.bridgeArguments',{method:name,arguments:args},kernel);const model=child(args.text,args.entry),local={...scope(args.bindings,kernel),model,factIndex:clone(env.factIndex),data:clone(env.data??null),eventInput:clone(args.input??null)};await kernel.run(model.queries[args.entry],local);return local.result??null;};
        else if(Object.hasOwn(config.regex,name))selected[name]=args=>{const operation=config.regex[name],budget=decide('foundation.regexBudget',{operation,arguments:args},kernel);return regexp.request(operation,budget.arguments,budget);};
        else selected[name]=(args,env)=>available[name](args,env,{configuration:config,authorize:(query,input)=>decide(query,input,kernel),observe:(file,text)=>policy.observe(file,text,kernel),
          qualify:({options,sources,selection,admission})=>{
            const front=makeFrontDoor(options,kernel);
            return front.admit(front.link(sources.map(source=>front.hydrate(source.file,source.text)),selection),admission).receipt;
          }});
      }
      Object.freeze(selected);
      let factIndex=seal({objects:Object.create(null),subjects:Object.create(null)});
      if(snapshot)factIndex=snapshot.value;
      else if(Object.hasOwn(admitted.model.queries,config.factIndexer)){const env={model:admitted.model,input:checkedFacts};await kernel.run(admitted.model.queries[config.factIndexer],env);factIndex=seal(env.result);}
      else if(checkedFacts.length)throw Error('The admitted Encounter fact indexer is required');
      const env={...safeBindings,model:admitted.model,factIndex,data:clone(data),eventInput:clone(input)};
      try{await kernel.run(admitted.model.queries[entry],env);}catch(error){error.execution={entry,usage:kernel.usage};throw error;}return {value:env.result,usage:kernel.usage,admissions:trace};
    }
    // The shared meter is compiler-owned and never a public hydration argument.
    return Object.freeze({hydrate:(file,text)=>hydrate(file,text),link,admit,index,run,policyBasis:policy.basis});
  }
  return {createFrontDoor:options=>makeFrontDoor(options)};
}
function createFrontDoor(options){return sourceFrontMechanisms({createKernel,rel,policy:getSourcePolicyMachine(),regexp:require('./isolated-regexp.cjs').nodeRegexp(),hash:text=>createHash('sha256').update(text).digest('hex')}).createFrontDoor(options);}
module.exports={createFrontDoor,sourceFrontMechanisms};
