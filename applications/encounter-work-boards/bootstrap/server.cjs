'use strict';
// HTTP/session/source-observation transport only. Authoring policy is Encounter.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),rel=require('./rel-values.cjs'),{createFrontDoor}=require('./encounter-source-front.cjs'),{openStore}=require('./store.cjs');
const ROOT=path.resolve(__dirname,'..'),digest=text=>crypto.createHash('sha256').update(text).digest('hex');
async function start({directory,port=0,fault,declarationFile=path.join(__dirname,'application.rel')}={}){
 if(!directory)throw Error('Choose a local workspace directory');
 const declaration=fs.readFileSync(declarationFile,'utf8'),facts=rel.parse(declaration),values=p=>facts.filter(f=>f.s==='application'&&f.p===p).map(f=>f.o),sources=values('module').map(file=>({file,text:fs.readFileSync(path.join(ROOT,file),'utf8')}));if(values('stateProfile').length!==1)throw Error('One explicit state profile is required');const profile=values('stateProfile')[0],store=openStore(directory,{fault,profile});
 const foundation=require('./source-policy-machine.cjs').loadSourcePolicyDescriptor();
 const ports={...require('./ports/value.cjs').valuePorts(),'number.calculate':require('./ports/browser-effects.cjs').computationalPorts()['number.calculate'],
  'rel.encode':({value,kind})=>rel.encode(value,kind),'rel.decode':({text,kind})=>rel.decode(text,kind),'scalar.read':({text})=>rel.decodeData(text.trim()),'scalar.quoteValue':({value})=>rel.literal(value),'digest.sha256':({text})=>digest(text),
  'source.observe':({file,text},_env,gate)=>gate.observe(file,text),'source.catalogue':()=>[...sources,...foundation.sources].map(s=>({path:s.file,text:s.text})),
  'storage.snapshot':({revision})=>store.snapshot(revision),'storage.operation':({operationId})=>store.operation(operationId),'storage.history':()=>store.history(),'storage.cas':input=>store.cas(input)};
 let front,handle;
 try{front=createFrontDoor({profiles:{author:values('grant')},ports,basis:digest(declaration+sources.map(s=>s.file+'\n'+digest(s.text)).join('\n'))});if(front.policyBasis!==foundation.basis)throw Error('Foundation changed while loading');handle=front.admit(front.link(sources.map(s=>front.hydrate(s.file,s.text))),{profile:'author',entries:values('entry')});}catch(error){store.close();throw error;}
 const nativeFiles=['server.cjs','store.cjs','encounter-source-front.cjs','source-policy-machine.cjs','temple-seed.cjs','seed-sync.cjs','seed-source-reader.cjs','rel-values.cjs','isolated-regexp.cjs','ports/value.cjs','ports/browser-effects.cjs'],basis=digest(rel.encode({policy:front.policyBasis,application:digest(handle.receipt),native:nativeFiles.map(file=>({file,sha256:digest(fs.readFileSync(path.join(__dirname,file)))}))}));
 const css=(await front.run(handle,'ui.styles')).value,sessions=new Map(),metrics={requests:0,maximumSteps:0,latencies:[]};let queue=Promise.resolve(),origin;
 const server=http.createServer((req,res)=>{const processRequest=async()=>{const start=performance.now(),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};try{
  if(req.headers.host!==new URL(origin).host)throw Object.assign(Error('Wrong host'),{status:403});const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/styles.css'){res.writeHead(200,{...headers,'Content-Type':'text/css; charset=utf-8'});res.end(css);return;}
  if(req.method!=='GET'&&req.method!=='POST')throw Object.assign(Error('Method unavailable'),{status:405});
  const cookie=/\bencounter=([a-f0-9]{48})\b/.exec(req.headers.cookie||'')?.[1];let session=cookie&&sessions.get(cookie);
  if(!session){if(req.method==='POST')throw Object.assign(Error('Open the workspace first'),{status:403});const id=crypto.randomBytes(24).toString('hex');session={csrf:crypto.randomBytes(24).toString('hex'),value:(await front.run(handle,'app.newSession')).value};sessions.set(id,session);headers['Set-Cookie']='encounter='+id+'; HttpOnly; SameSite=Strict; Path=/';}
  let params=url.searchParams;
  if(req.method==='POST'){if(req.headers.origin!==origin)throw Object.assign(Error('Wrong origin'),{status:403});const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw Object.assign(Error('Transport bound exceeded'),{status:413});chunks.push(chunk);}params=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(params.get('_csrf')!==session.csrf)throw Object.assign(Error('Wrong session'),{status:403});params.delete('_csrf');}
  const fields=Object.create(null);for(const[k,v]of params){if(Object.hasOwn(fields,k))throw Error('Duplicate transport field');Object.defineProperty(fields,k,{value:v,enumerable:true});}
  const result=await front.run(handle,'app.request',{input:{method:req.method,path:url.pathname,fields,session:session.value,snapshot:store.snapshot(),csrf:session.csrf,nonce:crypto.randomUUID(),basis,profile}});session.value=result.value.session;metrics.requests++;metrics.maximumSteps=Math.max(metrics.maximumSteps,result.usage.steps);metrics.latencies.push(performance.now()-start);
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(result.value.html);
 }catch(error){console.error(error.stack);res.writeHead(error.status||500,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(String(error.message));}};const pending=queue.then(processRequest);queue=pending.catch(()=>{});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 return{url:origin,directory,metrics,identity:{policy:front.policyBasis,application:digest(handle.receipt),basis,profile},async close(){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await queue;store.close();}};
}
module.exports={start};
if(require.main===module)start({directory:path.resolve(process.argv[2]||'.local/workspace'),declarationFile:process.argv[3],port:Number(process.env.ENCOUNTER_PORT||4187)}).then(server=>{console.log('Encounter '+server.url);let closing=false;async function close(){if(closing)return;closing=true;await server.close();process.exit(0);}process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.trim()==='close')close();});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);}).catch(e=>{console.error(e.stack);process.exitCode=1;});
