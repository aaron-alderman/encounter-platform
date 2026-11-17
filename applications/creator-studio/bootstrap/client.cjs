'use strict';
// Generic native browser host. Domain selection, edits, UI composition,
// persistence/replay and acceptance are exclusively admitted process queries.
// Only a successful preparation in the trusted root can register a child.
function childBoundary(model, freeze) {
  freeze({value:model});
  const admitted=new WeakSet();
  function remember(query,owner,result){
    if(query==='ec.prepare' && owner===model){
      freeze({value:result.model});
      admitted.add(result.model);
    }
    return result;
  }
  function ports(kernelPorts,resolveKernel){
    const bridge=kernelPorts(resolveKernel);
    return {
      ...bridge,
      'kernel.invoke':async (args,env)=>remember(args.query,env.model,await bridge['kernel.invoke'](args,env)),
      'kernel.execute':(args,env)=>{
        if(!admitted.has(args.model))throw Error('EC-CHILD: Child model has no preparation admission.');
        return bridge['kernel.execute'](args,env);
      },
    };
  }
  return {ports,remember};
}
async function start({model,data,manifest},modules){
  const {createKernel}=modules.seed;
  const boundary=childBoundary(model,modules.value.valuePorts()['value.freeze']);
  const state=new Map(),host={document,window,fetch,state,URL,Blob,setTimeout:window.setTimeout.bind(window),reportError:(error)=>{document.querySelector('[data-temple-errors]').textContent=String(error.message??error);}};
  let queue=Promise.resolve();
  const dispatch=(query,eventInput={})=>{
    const execution=queue.then(async()=>{
      let kernel;
      const available={...modules.value.valuePorts(),...modules.effects.computationalPorts(),...modules.effects.browserEffects(host,dispatch),...modules.browser.browserPorts(host,dispatch),...boundary.ports(modules.bridge.kernelPorts,()=>kernel)};
      const ports=Object.fromEntries(manifest.grants.map(name=>{if(!Object.hasOwn(available,name))throw Error('Missing granted mechanism: '+name);return [name,available[name]];}));
      kernel=createKernel(ports,manifest.budget);
      const env={...data.bindings,model,data,eventInput};
      if(!Object.hasOwn(model.queries,query))throw Error('Unknown process entry');
      await kernel.run(model.queries[query],env);
      return boundary.remember(query,model,env.result);
    });
    queue=execution.catch(()=>{});
    return execution;
  };
  // This is a local, explicit developer/agent surface, not a remote authenticated MCP server.
  window.usewords=Object.freeze({invoke:input=>dispatch(manifest.agentEntry,input)});
  await dispatch(manifest.entry);
}
module.exports={start,childBoundary};
