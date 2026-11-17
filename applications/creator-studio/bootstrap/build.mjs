import fs from 'node:fs';
import path from 'node:path';
import {loadRuntime,root,digest,read} from './runtime.mjs';
const runtime=await loadRuntime();
const out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
const html=(await runtime.run('uw.document')).value;
const css=(await runtime.run('uw.styles')).value;
const moduleFiles={seed:'vendor/worldwright/bootstrap/temple-seed.cjs',value:'vendor/worldwright/bootstrap/ports/value.cjs',effects:'vendor/worldwright/bootstrap/ports/browser-effects.cjs',browser:'vendor/worldwright/bootstrap/ports/browser.cjs',bridge:'vendor/worldwright/bootstrap/ports/kernel.cjs',client:'bootstrap/client.cjs'};
const native=Object.entries(moduleFiles).map(([key,file])=>`modules[${JSON.stringify(key)}]=(()=>{const module={exports:{}};\n${fs.readFileSync(path.join(root,file),'utf8')}\nreturn module.exports;})();`).join('\n');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const bundle=`/* Generated from pinned native mechanisms and admitted process definitions. */\n(async()=>{'use strict';const modules={};\n${native}\nawait modules.client.start(${json({model:runtime.model,data:runtime.data,manifest:runtime.manifest})},modules);})().catch(error=>{document.querySelector('[data-temple-errors]').textContent=String(error.message??error);console.error(error);});\n`;
const artifacts={'index.html':'<!doctype html>\n'+html,'style.css':css,'app.js':bundle};
for(const item of runtime.compiled){
 artifacts[item.spec.output]=JSON.stringify(item.result.surface,null,2)+'\n';
 artifacts[item.spec.output+'.map.json']=JSON.stringify({file:item.spec.file,sourceHash:item.result.sourceHash,basis:item.result.basis,origins:item.result.origins},null,2)+'\n';
 artifacts[item.spec.file]=item.text;
}
for(const [file,text]of Object.entries(artifacts)){fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.writeFileSync(path.join(out,file),text);}
const receipt={protocol:'usewords/build-receipt/1',programHash:runtime.identity,sources:runtime.sources,artifacts:Object.fromEntries(Object.entries(artifacts).map(([file,text])=>[file,digest(text)])),budget:runtime.manifest.budget,canonical:read('source/origin.json')};
fs.writeFileSync(path.join(out,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output:out,programHash:runtime.identity,artifacts:receipt.artifacts}));
