#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {ROOT,read,json,hash,compile,propose,publishPlan,basis}=require('./bootstrap/runtime.cjs');
const local=path.join(ROOT,'.local');fs.mkdirSync(local,{recursive:true});
const argv=process.argv.slice(2),cmd=argv.shift()||'help';
const option=(key,fallback)=>{const i=argv.indexOf('--'+key);return i>=0?argv[i+1]:fallback;};
const config=()=>json(path.join(local,'config.json'));
const run=(file,args)=>new Promise((resolve,reject)=>{const child=spawn(file,args,{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Native process failed: '+code)));});
async function commitEdit(input){
 const {after}=await propose(input);const history=path.join(local,'revisions',input.expectedBasis);fs.mkdirSync(history,{recursive:true});
 fs.copyFileSync(path.join(ROOT,'source/composition.rel'),path.join(history,'composition.rel'));
 fs.copyFileSync(path.join(ROOT,'source/composition.encounter'),path.join(history,'composition.encounter'));
 if(basis()!==input.expectedBasis)throw Error('AIR-E001: Source basis changed before local replacement.');
 // One source owner per editable field; no browser-owned project database.
 const destination=path.join(ROOT,'source/composition.rel'),stage=destination+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(stage,after.input.factText);fs.renameSync(stage,destination);
 fs.writeFileSync(path.join(history,'proposal.json'),JSON.stringify({kind:'local-file-edit',...input,afterBasis:after.plan.basis,limits:'Single local host; no signed-human retention or general platform admission claimed.'},null,2));
 publishPlan(after);return after;
}
async function render(compiled){
 const lock=path.join(local,'render.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('AIR-R001: A render owns .local/render.lock. If its process was interrupted, inspect the recorded PID before removing that lock.');throw e;}
 try{
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,basis:compiled.plan.basis,startedAt:new Date().toISOString()}));
  publishPlan(compiled);const snapshot=path.join(local,'plan-'+hash(JSON.stringify(compiled.plan)).slice(0,16)+'.json');
  fs.writeFileSync(snapshot,JSON.stringify(compiled.plan,null,2));const c=config();
  await run(c.python,[path.join(ROOT,'native/render.py'),'--config',path.join(local,'config.json'),'--plan',snapshot]);
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function streamFile(req,res,file,type){
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}
 const size=fs.statSync(file).size;const range=req.headers.range;res.setHeader('Content-Type',type);res.setHeader('Accept-Ranges','bytes');
 if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);return res.end();}const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);}
 else{res.writeHead(200,{'Content-Length':size});fs.createReadStream(file).pipe(res);}
}
async function serve(){
 let state=await compile(),queue=Promise.resolve(),job={status:'idle'};publishPlan(state);
 const token=crypto.randomBytes(24).toString('hex');let server;
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   if(req.method==='GET'&&route==='/api/state'){
    if(state.plan.basis!==basis()||state.plan.projectHash!==hash(JSON.stringify(json(path.join(ROOT,'source/project.json'))))||state.plan.graphicsHash!==hash(JSON.stringify(json(path.join(ROOT,'source/graphics.json')))))state=await compile();
    const receipt=fs.existsSync(path.join(local,'render-receipt.json'))?json(path.join(local,'render-receipt.json')):null;
    return send(res,200,{plan:state.plan,analysis:json(path.join(local,'analysis.json')),project:json(path.join(ROOT,'source/project.json')),projections:state.projections.map(p=>({source:p.source,view:p.view,edits:p.edits})),receipt,job,token});
   }
   if(req.method==='POST'&&['/api/edit','/api/render'].includes(route)){
    if(req.headers['x-air-token']!==token)return send(res,403,{error:'Local session token required.'});
    if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${server.address().port}`)return send(res,403,{error:'Unexpected origin.'});
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Request too large');}const input=JSON.parse(body||'{}');
    if(route==='/api/edit'){
     if(job.status==='rendering')return send(res,409,{error:'Wait for the current render to finish before changing its source.'});
     const work=queue.then(()=>commitEdit(input));queue=work.catch(()=>{});state=await work;return send(res,200,{basis:state.plan.basis});
    }
    if(job.status==='rendering')return send(res,409,{error:'A render is already running.'});
    job={status:'rendering',startedAt:new Date().toISOString()};
    try{await queue;state=await compile();job.basis=state.plan.basis;}catch(error){job={status:'failed',error:error.message};throw error;}
    render(state).then(()=>{job={...job,status:'complete'};},error=>{job={...job,status:'failed',error:error.message};});
    return send(res,202,{job});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed'});
   if(route==='/output/result.mp4'){
    const receiptFile=path.join(local,'render-receipt.json');if(!fs.existsSync(receiptFile))return send(res,404,{error:'No rendered picture yet'});
    const receipt=json(receiptFile);if(!/^church-on-air-(?:v2|[a-f0-9]{16})\.mp4$/.test(receipt.file))throw Error('Invalid local rendered artifact identity');
    return streamFile(req,res,path.join(local,receipt.file),'video/mp4');
   }
   const source=/^\/media\/(\d{19})\.mp4$/.exec(route);
   if(source&&state.plan.shots.some(s=>s.clip===source[1]))return streamFile(req,res,path.join(config().mediaDir,source[1]+'.mp4'),'video/mp4');
   const thumb=/^\/assets\/(thumb-\d{19}-\d+\.jpg|poster-v2\.jpg|contact-v2\.jpg)$/.exec(route);
   if(thumb)return streamFile(req,res,path.join(local,thumb[1]),'image/jpeg');
   const staticFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
   if(staticFiles[route]){const [f,t]=staticFiles[route];return streamFile(req,res,path.join(ROOT,'surface',f),t+'; charset=utf-8');}
   return send(res,404,{error:'Unknown route'});
  }catch(e){console.error(e.message);if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(option('port',4186)),'127.0.0.1',resolve);});
 console.log(`Church on Air studio: http://127.0.0.1:${server.address().port}`);
 process.on('SIGINT',()=>server.close(()=>process.exit(0)));
}
async function main(){
 if(cmd==='init'){
  const c={mediaDir:path.resolve(option('media-dir','')),ffmpeg:path.resolve(option('ffmpeg','')),python:path.resolve(option('python',''))};
  for(const [flag,key] of [['font-mono','fontMono'],['font-bold','fontBold'],['font-regular','fontRegular']]){
   const file=option(flag);if(file)c[key]=path.resolve(file);
  }
  for(const [k,v]of Object.entries(c))if(!fs.existsSync(v))throw Error('Missing '+k+': '+v);
  fs.writeFileSync(path.join(local,'config.json'),JSON.stringify(c,null,2));console.log('Bound local media and native tools. Run analyze, then compile.');
 }else if(cmd==='analyze'){const c=config();await run(c.python,[path.join(ROOT,'native/analyze.py'),'--config',path.join(local,'config.json')]);}
 else if(cmd==='compile'){const c=await compile();publishPlan(c);console.log(JSON.stringify({basis:c.plan.basis,shots:c.plan.shots.length,seconds:c.plan.frames/c.plan.fps,usage:c.plan.usage,plan:path.join(local,'plan.json')},null,2));}
 else if(cmd==='inspect'){const c=await compile();const shot=c.plan.shots.find(s=>s.id===argv[0]);console.log(JSON.stringify(shot?{shot,projection:c.projections.find(p=>p.source===shot.id),basis:c.plan.basis}:c.plan,null,2));}
 else if(cmd==='set'){const c=await commitEdit({shot:argv[0],field:argv[1],value:argv[2],expectedBasis:option('basis')});console.log('Saved checked source proposal: '+c.plan.basis);}
 else if(cmd==='render')await render(await compile());
 else if(cmd==='narrate')await require('./bootstrap/behind-the-scenes.cjs').narrate();
 else if(cmd==='bts-plan'){const {plan}=await require('./bootstrap/behind-the-scenes.cjs').compileBts();console.log(JSON.stringify({title:plan.title,seconds:plan.frames/25,voice:plan.voice,beats:plan.beats.map(b=>({id:b.id,in:b.inFrame/25,out:b.outFrame/25,scene:b.scene})),usage:plan.usage},null,2));}
 else if(cmd==='bts')await require('./bootstrap/behind-the-scenes.cjs').renderBts();
 else if(cmd==='bts-verify'){const c=config();await run(c.python,[path.join(ROOT,'native/verify_bts.py'),'--config',path.join(local,'config.json')]);}
 else if(cmd==='serve')await serve();
 else if(cmd==='verify'){const c=config();await run(c.python,[path.join(ROOT,'native/verify.py'),'--config',path.join(local,'config.json')]);}
 else console.log('Church on Air — Encounter / Temple broadcast composition\n\n  init --media-dir PATH --ffmpeg EXE --python EXE\n  analyze                 observe RMS, onset/tempo candidates and frame surveys\n  compile                 Encounter -> algebra -> checked render plan\n  inspect [shot]          inspect source, projection and declared edits\n  set SHOT FIELD VALUE --basis HASH\n                          forward-verify one source edit and retain its predecessor\n  render                  render the checked plan with original church audio\n  verify                  decode and verify the rendered artifact\n  serve [--port 4186]      open the local production studio\n\nNo publication or general Encounter authoring admission is performed.');
}
if(require.main===module)main().then(()=>{if(cmd==='help')console.log('\nDot making-of: narrate | bts-plan | bts | bts-verify\n  narrate: synthesize the authored local voice and observe word/audio timings\n  bts-plan: compile the making-of Encounter projections and measured voice beats\n  bts: render the film-to-studio reveal and Dot commentary\n  bts-verify: decode the complete film and check current source/voice receipts\n');}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={commitEdit,streamFile};
