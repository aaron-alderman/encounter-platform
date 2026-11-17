'use strict';

// Invocation mechanics only. Compilation, admission, target selection and
// application policy remain authored programmes. Both ports use the dispatch's
// existing kernel, so nested work consumes the same budget and fault identity.
function kernelPorts(resolveKernel) {
  return {
    'kernel.evaluate': ({expression,bindings}) => resolveKernel().evaluate(expression,bindings),
    'kernel.invoke': async ({query,input},env) => {
      if (!Object.hasOwn(env.model.queries,query)) throw Error('Unknown admitted process: '+query);
      const local={...env,eventInput:input??{}};
      await resolveKernel().run(env.model.queries[query],local);
      return Object.hasOwn(local,'result') ? local.result : null;
    },
    'kernel.execute': async ({model,entry,input},env) => {
      if(!model||!Object.hasOwn(model.queries??{},entry))throw Error('Unknown candidate process: '+entry);
      const local={...env,model,eventInput:input??{}};
      await resolveKernel().run(model.queries[entry],local);
      return Object.hasOwn(local,'result')?local.result:null;
    },
  };
}

module.exports={kernelPorts};
