'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');const TEMPLE=path.resolve(ROOT,'../../perth-revival-2027');
const {createKernel}=require(path.join(TEMPLE,'bootstrap/temple-seed.cjs'));
const {lower}=require(path.join(TEMPLE,'bootstrap/ports/algebra-lower.cjs'));
const {valuePorts}=require(path.join(TEMPLE,'bootstrap/ports/value.cjs'));
const {invoke}=require(path.join(TEMPLE,'bootstrap/ports/programme.cjs'));
const read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');const json=p=>JSON.parse(read(p));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=['source','language','fact-index','lowering','admission','html','encounter-code-types','encounter-code-compiler','encounter-code-runtime'];
let cached;
async function runtime(){
 if(cached)return cached;
 const entries=files.map(f=>path.join(TEMPLE,'algebra',f+'.process.json'));entries.push(path.join(ROOT,'algebra/broadcast.process.json'),path.join(ROOT,'algebra/behind-the-scenes.process.json'));
 const queries={};for(const file of entries)for(const [name,body]of Object.entries(json(file).queries)){if(queries[name])throw Error('Duplicate query '+name);queries[name]=body;}
 const definitions=json(path.join(TEMPLE,'algebra/operators.expression.json'));const primitives=Array.from(createKernel.operators),profile=json(path.join(TEMPLE,'bootstrap/kernel-profile.json'));
 const ports={...valuePorts(), 'number.compare':({left,right})=>{if(!Number.isFinite(left)||!Number.isFinite(right))throw Error('Nonfinite numeric observation');return Math.sign(left-right);},'number.grid':({value,rate})=>{if(!Number.isFinite(value)||!Number.isSafeInteger(rate)||rate<1)throw Error('Invalid grid');const n=value*rate;return {index:Math.round(n),exact:Math.abs(n-Math.round(n))<1e-7};}};
 const model=await lower({compiler:json(path.join(TEMPLE,'algebra/lowering.process.json')),definitions,primitives,input:{entry:'broadcast.plan',queries},mode:'model',ports});
 await invoke({model,entry:'admit.model',input:{target:model,profile},ports});
 await invoke({model,entry:'admit.effects',input:{target:{...model,entry:'broadcast.plan'},profile,grants:['number.compare','number.grid','text.matches','json.parse','record.get','record.put']},ports});
 const closure=[...entries,...['bootstrap/temple-seed.cjs','bootstrap/ports/algebra-lower.cjs','bootstrap/ports/value.cjs','bootstrap/ports/programme.cjs','bootstrap/ports/kernel.cjs','bootstrap/kernel-profile.json','algebra/operators.expression.json'].map(f=>path.join(TEMPLE,f))];
 const identities=closure.map(file=>({path:path.relative(path.resolve(ROOT,'../..'),file).replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))}));
 const call=(entry,eventInput)=>invoke({model,entry,input:{eventInput},ports,nested:['kernel.invoke','kernel.execute','kernel.evaluate']});
 const admit=(entry,grants)=>invoke({model,entry:'admit.effects',input:{target:{...model,entry},profile,grants},ports});
 cached={call,admit,definitions,primitives,profile,identities};return cached;
}
function sources(){return {codeText:read(path.join(ROOT,'source/composition.encounter')),factText:read(path.join(ROOT,'source/composition.rel')),contractText:read(path.join(ROOT,'source/contracts.rel'))};}
function basis(input=sources()){return hash(JSON.stringify(input));}
async function compile(override={}){
 const rt=await runtime(),input={...sources(),...override},project=json(path.join(ROOT,'source/project.json'));
 if(project.fps!==25||project.width!==960||project.height!==720)throw Error('AIR-H001: Native renderer v1 supports the declared 960x720 / 25fps profile only.');
 const observations=json(path.join(ROOT,'.local/analysis.json')),graphics=json(path.join(ROOT,'source/graphics.json'));
 const prepared=await rt.call('ec.prepare',{...input,definitions:rt.definitions,primitives:rt.primitives,profile:rt.profile});
 const run=await rt.call('ec.run',{candidate:prepared.value});
 const planned=await rt.call('broadcast.plan',{projections:run.value,project,media:observations.sources,graphics});
 return {plan:{...planned.value,basis:basis(input),projectHash:hash(JSON.stringify(project)),graphicsHash:hash(JSON.stringify(graphics)),sourceHashes:Object.entries(input).map(([name,value])=>({name,sha256:hash(value)})),runtime:rt.identities,usage:{prepare:prepared.usage,projection:run.usage,planning:planned.usage}},candidate:prepared.value,projections:run.value,input};
}
async function propose({shot,field,value,expectedBasis}){
 if(expectedBasis!==basis())throw Error('AIR-E001: Source basis changed. Reload before proposing another edit.');
 const before=await compile();const projection=before.projections.find(p=>p.source===shot);if(!projection)throw Error('AIR-E002: Unknown shot.');
 const rt=await runtime();const changed=await rt.call('ec.patch',{candidate:before.candidate,projection,field:'C.'+field,value});
 // ec.patch forward-verifies; broadcast planning adds duration/source/effect laws.
 const after=await compile({factText:changed.value.candidate.inputs.factText,codeText:changed.value.candidate.inputs.codeText});
 if(basis()!==expectedBasis)throw Error('AIR-E001: Source basis changed while planning.');
 return {before,after};
}
function publishPlan(compiled){fs.mkdirSync(path.join(ROOT,'.local'),{recursive:true});fs.writeFileSync(path.join(ROOT,'.local/plan.json'),JSON.stringify(compiled.plan,null,2));}
module.exports={ROOT,TEMPLE,read,json,hash,runtime,compile,propose,publishPlan,basis,sources};
