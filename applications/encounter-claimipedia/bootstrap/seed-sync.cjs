'use strict';
// Mechanical synchronous driver for the same primitive seed. Used only for
// source compiler/checker computation, never asynchronous application effects.
function synchronousSeed(createKernel,ports,limit,meter=null){
  const seed=meter??createKernel({},limit),evaluate=(value,env)=>seed.evaluate(value,env);
  function run(programme,env){
    for(const step of programme){
      evaluate(null,env);
      const kind=['let','assert','when','each','fold','call','port','try'].find(key=>Object.hasOwn(step,key));
      if(kind==='let')env[step.let]=evaluate(step.value,env);
      else if(kind==='assert'){if(!evaluate(step.assert,env))throw Error(step.message);}
      else if(kind==='when'){if(evaluate(step.when,env))run(step.then,env);}
      else if(kind==='each'){for(const item of evaluate(step.each,env))run(step.steps,{...env,[step.as]:item});}
      else if(kind==='fold'){let value=evaluate(step.initial,env);for(const item of evaluate(step.fold,env)){const local={...env,[step.as]:item,[step.accumulator]:value};run(step.steps,local);value=evaluate(step.yield,local);}env[step.into]=value;}
      else if(kind==='call')run(env.model.queries[step.call],env);
      else if(kind==='port'){if(!Object.hasOwn(ports,step.port))throw Error('Unavailable mechanical port: '+step.port);const result=ports[step.port](evaluate(step.args,env),env);if(result&&typeof result.then==='function')throw Error('Asynchronous effect in synchronous source computation');env[step.into]=result;}
      else if(kind==='try'){try{run(step.try,env);}catch(error){if(error.code==='TEMPLE-K001'||error.code==='TEMPLE-NATIVE-LIMIT')throw error;env[step.error]={name:error.name,message:error.message};run(step.catch,env);}}
      else throw Error('Unknown primitive seed form');
    }
    return env;
  }
  return {run,evaluate,get usage(){return seed.usage;}};
}
module.exports={synchronousSeed};
