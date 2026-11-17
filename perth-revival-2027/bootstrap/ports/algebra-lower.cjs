'use strict';
const {createKernel}=require('../temple-seed.cjs');

async function lower({compiler,definitions,primitives,input,mode,ports,limit=20000000}) {
  const env={model:compiler,definitions,primitives,input,mode};
  await createKernel(ports,limit).run(compiler.queries['lower.start'],env);
  return env.result.value;
}

module.exports={lower};
