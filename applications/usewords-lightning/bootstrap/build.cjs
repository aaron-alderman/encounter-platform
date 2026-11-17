'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadRuntime, root, digest, read } = require('./runtime.cjs');
const { within } = require('./frontend.cjs');

async function main() {
  const runtime=await loadRuntime();
  const publication=runtime.bootstrap.publication;
  const out=path.join(root,'dist');
  const html=(await runtime.run(publication.document)).value;
  const css=(await runtime.run(publication.styles)).value;
  const moduleFiles=publication.browserModules;
  const native = Object.entries(moduleFiles).map(([key, file]) => {
    const bytes = fs.readFileSync(within(root, file));
    if (digest(bytes) !== runtime.sources[file]) throw Error('Browser module differs from measured bytes: ' + file);
    return `modules[${JSON.stringify(key)}]=(()=>{const module={exports:{}};\n${bytes.toString('utf8')}\nreturn module.exports;})();`;
  }).join('\n');
  const json=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
  const bundle=`/* Generated from pinned native mechanisms and admitted process definitions. */\n(async()=>{'use strict';const modules={};\n${native}\nawait modules.client.start(${json({model:runtime.model,data:runtime.data,manifest:runtime.manifest})},modules);})().catch(error=>{document.querySelector('[data-temple-errors]').textContent=String(error.message??error);console.error(error);});\n`;
  const artifacts={[publication.html]:'<!doctype html>\n'+html,[publication.css]:css,[publication.script]:bundle};
  for(const item of runtime.compiled){
   artifacts[item.spec.output]=JSON.stringify(item.result.surface,null,2)+'\n';
   artifacts[item.spec.output+'.map.json']=JSON.stringify({file:item.spec.file,sourceHash:item.result.sourceHash,basis:item.result.basis,origins:item.result.origins},null,2)+'\n';
   artifacts[item.spec.file]=item.text;
  }
  const origin=item=>({file:item.file,sourceHash:item.result.sourceHash,basis:item.result.basis,origins:item.result.origins});
  for(const item of runtime.definitions){
   artifacts[item.output]=JSON.stringify(item.value,null,2)+'\n';
   const map=origin(item);
   if(item.name==='page')map.fragments=runtime.fragments.map(origin);
   artifacts[item.output+'.map.json']=JSON.stringify(map,null,2)+'\n';
   artifacts[item.file]=item.text;
  }
  for(const item of runtime.fragments)artifacts[item.file]=item.text;
  for (const [file, text] of Object.entries(artifacts)) {
    const target = within(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  const receipt={protocol:publication.receiptProtocol,programHash:runtime.identity,sources:runtime.sources,artifacts:Object.fromEntries(Object.entries(artifacts).map(([file,text])=>[file,digest(text)])),budget:runtime.manifest.budget,canonical:read('source/origin.json')};
  fs.writeFileSync(within(out,publication.receipt),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({output:out,programHash:runtime.identity,artifacts:receipt.artifacts}));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
