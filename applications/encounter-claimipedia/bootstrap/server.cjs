'use strict';
// HTTP/session/source-observation transport only. Authoring policy is Encounter.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),rel=require('./rel-values.cjs'),{createFrontDoor}=require('./encounter-source-front.cjs'),{openStore}=require('./store.cjs');
const ROOT=path.resolve(__dirname,'..'),digest=text=>crypto.createHash('sha256').update(text).digest('hex');
// Reject noncanonical and low-order Edwards encodings before OpenSSL verification.
const ed25519Prime=Buffer.from('7f'+'ff'.repeat(30)+'ed','hex');
const ed25519LowOrderY=new Set([
 '00'.repeat(32), '01'+'00'.repeat(31), 'ec'+'ff'.repeat(30)+'7f',
 '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
]);
function strongEd25519Point(bytes) {
 const y=Buffer.from(bytes);
 y[31]&=0x7f;
 return !ed25519LowOrderY.has(y.toString('hex'))&&Buffer.compare(y.reverse(),ed25519Prime)<0;
}
function verifyEd25519({text, publicKey, signature}) {
 if(typeof text!=='string'||typeof publicKey!=='string'||typeof signature!=='string')throw Error('Expected Ed25519 verification text and hex inputs');
 if(Buffer.byteLength(text)>16384||publicKey.length!==64||signature.length!==128||!/^[0-9a-f]{64}$/.test(publicKey)||!/^[0-9a-f]{128}$/.test(signature))return false;
 const signatureBytes=Buffer.from(signature,'hex');
 if(!strongEd25519Point(Buffer.from(publicKey,'hex'))||!strongEd25519Point(signatureBytes.subarray(0,32)))return false;
 const key=Buffer.from('302a300506032b6570032100'+publicKey,'hex');
 try{return crypto.verify(null,Buffer.from(text),{key,format:'der',type:'spki'},signatureBytes);}
 catch{return false;}
}
async function start({directory,port=0,fault,attachmentRoot,operatorFile,declarationFile=path.join(ROOT,'products/claimipedia/application.rel')}={}){
 if(!directory)throw Error('Choose a local workspace directory');
 const declaration=fs.readFileSync(declarationFile,'utf8'),facts=rel.parse(declaration),values=p=>facts.filter(f=>f.s==='application'&&f.p===p).map(f=>f.o),sources=values('module').map(file=>({file,text:fs.readFileSync(path.join(ROOT,file),'utf8')}));
 const verifyOperator = operatorFile ? require('./operator.cjs').operators(operatorFile) : null;
 const attachment = attachmentRoot ? require('./attachment.cjs').mountAttachments(attachmentRoot) : null;
 if(attachment && !values('entry').includes('app.attachment'))throw Error('An attachment mount requires the declared app.attachment entry');
 const datasets=new Map(),dataSources=[],indexes=new Map();
 const readData=(name,dataPaths,formats,pins)=>{
  if(dataPaths.length!==1||datasets.has(name))throw Error('Expected one REL source for each application dataset');
  const file=dataPaths[0],resolved=fs.realpathSync(path.resolve(ROOT,file)),relative=path.relative(fs.realpathSync(ROOT),resolved);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.extname(resolved)!=='.rel')throw Error('Application data source must be a REL file inside this workspace');
  const bytes=fs.readFileSync(resolved);
  if(formats.length>1||pins.length>1||(formats.length&&!['rel-facts','typed-rel'].includes(formats[0])))throw Error('Invalid declared data format or hash');
  if((formats[0]==='rel-facts'&&pins.length!==1)||(pins.length&&digest(bytes)!==pins[0]))throw Error('Application data hash differs from its pin');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  dataSources.push({file,text});
  datasets.set(name,formats[0]==='rel-facts'?rel.parse(text):rel.decode(text,'ApplicationData'));
 };
 if(values('dataSource').length)readData('',values('dataSource'),values('dataFormat'),values('dataSha256'));
 for(const name of values('dataset')){
  if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error('Invalid application dataset name');
  const field=p=>facts.filter(f=>f.s==='data.'+name&&f.p===p).map(f=>f.o);
  readData(name,field('source'),field('format'),field('sha256'));
 }
 if(values('stateProfile').length!==1)throw Error('One explicit state profile is required');const profile=values('stateProfile')[0],store=openStore(directory,{fault,profile});
 const foundation=require('./source-policy-machine.cjs').loadSourcePolicyDescriptor();
 const ports={'signature.ed25519.verify':verifyEd25519,'attachment.verify':input=>Boolean(attachment?.(input)),...require('./ports/value.cjs').valuePorts(),'number.calculate':require('./ports/browser-effects.cjs').computationalPorts()['number.calculate'],
  'rel.encode':({value,kind})=>rel.encode(value,kind),'rel.decode':({text,kind})=>rel.decode(text,kind),'scalar.read':({text})=>rel.decodeData(text.trim()),'scalar.quoteValue':({value})=>rel.literal(value),'digest.sha256':({text})=>digest(text),
  'source.observe':({file,text},_env,gate)=>gate.observe(file,text),'source.catalogue':()=>[...sources,...foundation.sources].map(s=>({path:s.file,text:s.text})),
  'storage.snapshot':({revision})=>store.snapshot(revision),'storage.operation':({operationId})=>store.operation(operationId),'storage.history':()=>store.history(),'storage.cas':input=>store.cas(input)};
 if(datasets.size)ports['application.data']=({name='',...request})=>{
  if(!datasets.has(name))throw Error('Unknown application dataset');
  const data=datasets.get(name);
  if(data?.dataTransport!=='indexed-rel/1')return data;
  if(!Object.keys(request).length)return {...data,indexed:true};
  if(!indexes.has(name))indexes.set(name,require('./indexed-data.cjs').openIndexedData(fs.realpathSync(ROOT),data));
  return indexes.get(name).read(request);
 };
 const basisSources=[...sources,...dataSources];
 let front,handle,attachmentHandle;
 try{
  const profiles={author:values('grant')};
  if(attachment)profiles.attachment=profiles.author.filter(name=>['application.data','kernel.invoke'].includes(name));
  front=createFrontDoor({profiles,ports,basis:digest(declaration+basisSources.map(s=>s.file+'\n'+digest(s.text)).join('\n'))});
  if(front.policyBasis!==foundation.basis)throw Error('Foundation changed while loading');
  const modules=sources.map(s=>front.hydrate(s.file,s.text));
  handle=front.admit(front.link(modules),{profile:'author',entries:values('entry')});
  if(attachment)attachmentHandle=front.admit(front.link(modules,{roots:['app.attachment']}),{profile:'attachment',entries:['app.attachment']});
 }catch(error){store.close();throw error;}
 const nativeFiles=['server.cjs','indexed-data.cjs','operator.cjs','attachment.cjs','store.cjs','encounter-source-front.cjs','source-policy-machine.cjs','temple-seed.cjs','seed-sync.cjs','seed-source-reader.cjs','rel-values.cjs','isolated-regexp.cjs','ports/value.cjs','ports/browser-effects.cjs'],basis=digest(rel.encode({policy:front.policyBasis,application:digest(handle.receipt),native:nativeFiles.map(file=>({file,sha256:digest(fs.readFileSync(path.join(__dirname,file)))}))}));
 const css=(await front.run(handle,'ui.styles')).value,sessions=new Map(),metrics={requests:0,maximumSteps:0,latencies:[]};let queue=Promise.resolve(),origin,sessionCookie;
 const server=http.createServer((req,res)=>{const processRequest=async()=>{const start=performance.now(),headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};try{
  if(req.headers.host!==new URL(origin).host)throw Object.assign(Error('Wrong host'),{status:403});const url=new URL(req.url,origin);
  const operator=verifyOperator?.(req.headers.authorization)??null;
  if(verifyOperator&&!operator){res.writeHead(401,{...headers,'WWW-Authenticate':'Basic realm="Encounter", charset="UTF-8"'});res.end('Operator credentials required.');return;}
  if(req.method==='POST'&&operator?.role==='observer'){res.writeHead(403,headers);res.end('Observer sessions are read-only.');return;}
  if(req.method==='GET'&&url.pathname==='/styles.css'){res.writeHead(200,{...headers,'Content-Type':'text/css; charset=utf-8'});res.end(css);return;}
  if(url.pathname.startsWith('/attachments/')){
   if(req.method!=='GET'){res.writeHead(405,headers);res.end('Expected GET.');return;}
   const id=url.pathname.slice('/attachments/'.length);
   const selected=attachment&&/^[A-Za-z0-9._-]{1,128}$/.test(id)
    ? attachment((await front.run(attachmentHandle,'app.attachment',{input:id})).value) : null;
   if(!selected){res.writeHead(404,headers);res.end('Attachment unavailable.');return;}
   res.writeHead(200,{...headers,'Content-Type':'application/octet-stream','Content-Disposition':selected.disposition});
   res.end(selected.body);return;
  }
  if(req.method!=='GET'&&req.method!=='POST')throw Object.assign(Error('Method unavailable'),{status:405});
  const cookie=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
  let session=cookie&&sessions.get(cookie);
  if(session?.operatorId!==operator?.id)session=null;
  if(!session){if(req.method==='POST')throw Object.assign(Error('Open the workspace first'),{status:403});const id=crypto.randomBytes(24).toString('hex');session={operatorId:operator?.id,csrf:crypto.randomBytes(24).toString('hex'),value:(await front.run(handle,'app.newSession')).value};sessions.set(id,session);headers['Set-Cookie']=sessionCookie+'='+id+'; HttpOnly; SameSite=Strict; Path=/';}
  let params=url.searchParams;
  if(req.method==='POST'){if(req.headers.origin!==origin)throw Object.assign(Error('Wrong origin'),{status:403});const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw Object.assign(Error('Transport bound exceeded'),{status:413});chunks.push(chunk);}params=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(params.get('_csrf')!==session.csrf)throw Object.assign(Error('Wrong session'),{status:403});params.delete('_csrf');}
  const fields=Object.create(null);for(const[k,v]of params){if(Object.hasOwn(fields,k))throw Error('Duplicate transport field');Object.defineProperty(fields,k,{value:v,enumerable:true});}
  const result=await front.run(handle,'app.request',{input:{method:req.method,path:url.pathname,fields,session:session.value,snapshot:store.snapshot(),csrf:session.csrf,nonce:crypto.randomUUID(),basis,profile,...(operator?{operator,now:Date.now()}:{}),attachments:Boolean(attachment)}});session.value=result.value.session;metrics.requests++;metrics.maximumSteps=Math.max(metrics.maximumSteps,result.usage.steps);metrics.latencies.push(performance.now()-start);
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(result.value.html);
 }catch(error){console.error(error.stack);res.writeHead(error.status||500,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(String(error.message));}};const pending=queue.then(processRequest);queue=pending.catch(()=>{});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 // Browser cookies are shared across ports on the same loopback hostname.
 sessionCookie='encounter_'+server.address().port;
 return{url:origin,directory,metrics,identity:{policy:front.policyBasis,application:digest(handle.receipt),basis,profile},async close(){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await queue;for(const index of indexes.values())index.close();store.close();}};
}
module.exports={start};
if(require.main===module)start({directory:path.resolve(process.argv[2]||'.local/workspace'),declarationFile:process.argv[3],attachmentRoot:process.env.ENCOUNTER_ATTACHMENT_ROOT,operatorFile:process.env.ENCOUNTER_OPERATOR_FILE,port:Number(process.env.ENCOUNTER_PORT||4187)}).then(server=>{console.log('Encounter '+server.url);let closing=false;async function close(){if(closing)return;closing=true;await server.close();process.exit(0);}process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.trim()==='close')close();});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);}).catch(e=>{console.error(e.stack);process.exitCode=1;});
