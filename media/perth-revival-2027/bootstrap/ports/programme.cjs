'use strict';
const {createKernel}=require('../temple-seed.cjs');
const {kernelPorts}=require('./kernel.cjs');

// Generic invocation bridge. Admission and language semantics live in algebra.
async function invoke({model,entry,input={},ports,limit=20000000,nested=[]}) {
  let kernel;
  const bridge=kernelPorts(()=>kernel);
  const selected=Object.fromEntries(nested.map(name=>{if(!Object.hasOwn(bridge,name))throw Error('Unknown kernel bridge grant: '+name);return [name,bridge[name]]}));
  kernel=createKernel({...ports,...selected},limit);
  const env={...input,model};
  await kernel.run(model.queries[entry],env);
  return {value:env.result,usage:kernel.usage};
}

module.exports={invoke};
