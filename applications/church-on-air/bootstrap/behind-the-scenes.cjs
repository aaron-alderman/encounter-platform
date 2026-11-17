'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {ROOT,read,json,hash,runtime}=require('./runtime.cjs');
const work=path.join(ROOT,'.local/bts'),source=path.join(ROOT,'source/behind-the-scenes.json');
const configPath=path.join(ROOT,'.local/config.json');
const run=(file,args)=>new Promise((resolve,reject)=>{const child=spawn(file,args,{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Making-of native process failed: '+code)));});
async function narrate(){
 const cfg=json(configPath);fs.mkdirSync(work,{recursive:true});
 await run(cfg.powershell||'pwsh.exe',['-NoProfile','-File',path.join(ROOT,'native/narrate.ps1'),'-Source',source,'-OutDir',path.join(work,'voice')]);
 await run(cfg.python,[path.join(ROOT,'native/observe_narration.py')]);
}
async function compileBts(overrides={}){
 const rt=await runtime(),project=json(source),observations=json(path.join(work,'narration-observations.json'));
 await rt.admit('bts.plan',['number.grid','number.compare','text.matches','json.parse']);
 if(observations.scriptHash!==hash(fs.readFileSync(source)))throw Error('BTS-H001: Narration source changed; run narrate again.');
 const input={codeText:read(path.join(ROOT,'source/behind-the-scenes.encounter')),contractText:read(path.join(ROOT,'source/behind-the-scenes-contracts.rel')),factText:read(path.join(work,'voice-facts.rel')),...overrides};
 const prepared=await rt.call('ec.prepare',{...input,definitions:rt.definitions,primitives:rt.primitives,profile:rt.profile});
 const projected=await rt.call('ec.run',{candidate:prepared.value});
 const film=json(path.join(ROOT,'.local/render-receipt.json'));
 const planned=await rt.call('bts.plan',{project,observations,projections:projected.value,film});
 const captureFile=path.join(work,'captures.json');const captures=json(captureFile);
 const assets=Object.values(captures).map(c=>({file:c.file,sha256:hash(fs.readFileSync(path.join(work,c.file)))}));
 const plan={...planned.value,scriptHash:observations.scriptHash,basis:hash(JSON.stringify(input)),captures,captureHashes:assets,mascot:json(path.join(work,'mascot-source.json')),runtime:rt.identities,usage:{prepare:prepared.usage,projection:projected.usage,planning:planned.usage}};
 return {plan,input,projections:projected.value};
}
async function renderBts(){
 const {plan}=await compileBts();const file=path.join(work,'plan-'+hash(JSON.stringify(plan)).slice(0,16)+'.json'),lock=path.join(work,'render.lock');
 let fd;try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('BTS-R001: A making-of render already owns its lock. Inspect its PID before recovery.');throw e;}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));fs.writeFileSync(file,JSON.stringify(plan,null,2));fs.writeFileSync(path.join(work,'plan.json'),JSON.stringify(plan,null,2));await run(json(configPath).python,[path.join(ROOT,'native/render_bts.py'),'--config',configPath,'--plan',file]);}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={narrate,compileBts,renderBts};
