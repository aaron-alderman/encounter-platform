import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = pathToFileURL(process.cwd() + '/');
const { decode: readRel } = await import(new URL('projects/applications/encounter-runtime/test/rel-values.mjs',root));
const decode=(...args)=>JSON.parse(JSON.stringify(readRel(...args)));
const { startImage } = await import(new URL('projects/applications/encounter-runtime/test/host.mjs',root));
const { chromium } = await import(new URL('bin/browser-profile.mjs',root));
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const [stage,backupPath] = process.argv.slice(2);
const store = fs.mkdtempSync('/tmp/nr-round-trip-store-');
const operatorFile = path.join(store,'operators.rel');
const actors = [['north-river-owner','author'],['north-river-agent','proposer'],['round-trip-outsider','proposer']].map(([id,role])=>{
  const password = randomBytes(24).toString('hex');
  const basic = Buffer.from(id+':'+password).toString('base64');
  return {id,role,password,authorization:'Basic '+basic,hash:createHash('sha256').update(basic).digest('hex')};
});
const [owner,agent,outsider]=actors;
const facts=[['operators','version','encounter/operators/1'],...actors.flatMap(a=>[[a.id,'role',a.role],[a.id,'basicSha256',a.hash]])];
fs.writeFileSync(operatorFile,facts.map(row=>'('+row.map(JSON.stringify).join(', ')+')').join('\n')+'\n',{mode:0o600});
const file=path.join(stage,'application-image.rel');
const pin=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clients=[];
let server,browser;
const start=()=>startImage(path.join(stage,'encounter'),{file,pin},store,{operatorFile,liveModel:'ollama-loopback'});
const photo=(page,name)=>page.screenshot({path:path.join(process.env.WORKSPACE_RUN_RECEIPTS,name+'.png')});
const workPath='/?task=primary&work=1';
async function mcp(actor) {
  const client = new Client({name:'north-river-round-trip-test',version:'1.0.0'});
  const transport = new StdioClientTransport({command:process.execPath,args:[path.join(stage,'node/mcp/encounter-work.cjs')],
    env:{NODE_PATH:process.env.NODE_PATH ?? '',ENCOUNTER_WORK_ORIGIN:server.url,ENCOUNTER_WORK_AUTHORIZATION:actor.authorization}});
  await client.connect(transport);
  clients.push(client);
  const catalogue=await client.listTools();
  assert.deepEqual(catalogue.tools.map(tool=>tool.name).sort(),['act','follow','inspect']);
  return async (name,args)=>await client.callTool({name,arguments:args});
}
async function http(actor) {
  const session=await fetch(server.url+'/?task=primary&work-interface=1',{headers:{authorization:actor.authorization}});
  assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie')?.split(';',1)[0];
  const inspected=decode(await session.text(),'EncounterWorkReply');
  return {
    inspected,
    async request(extra={}) {
      const query=new URLSearchParams({task:'primary','work-interface':'1',...extra});
      const response=await fetch(server.url+'/?'+query,{headers:{authorization:actor.authorization,cookie}});
      return decode(await response.text(),'EncounterWorkReply');
    },
    async act(fields) {
      const body=new URLSearchParams({task:'primary','work-interface':'1',_csrf:inspected.csrf,...fields});
      const response=await fetch(server.url+'/',{method:'POST',headers:{authorization:actor.authorization,cookie,origin:server.url,
        'content-type':'application/x-www-form-urlencoded'},body});
      return decode(await response.text(),'EncounterWorkReply');
    }
  };
}
try {
  const src = new DatabaseSync(backupPath,{readOnly:true});
  await backup(src,path.join(store,'workspace.sqlite')); src.close();
  server=await start();
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1280,height:720},httpCredentials:{username:owner.id,password:owner.password}});
  const page=await context.newPage();
  page.setDefaultTimeout(8000);
  const agentContext=await browser.newContext({viewport:{width:1280,height:720},httpCredentials:{username:agent.id,password:agent.password}});
  const agentPage=await agentContext.newPage();
  await agentPage.goto(server.url+'/project');
  await agentPage.getByText('No handoff is waiting for you.').waitFor();
  const reviewer=await mcp(owner);
  const transport=await http(owner);
  const first=(await reviewer('inspect',{task:'primary'})).structuredContent.work;
  assert.deepEqual(first,transport.inspected.work);
  assert.deepEqual(first.moves,['open-investigation','accept-implementation']);
  assert.equal((await http(outsider)).inspected.status,'refused');
  assert.equal((await http(agent)).inspected.status,'refused');
  const streamPage=await context.newPage();
  await streamPage.goto(server.url+workPath);
  await streamPage.evaluate(({id,after})=>new Promise((resolve,reject)=>{
    const socket=new WebSocket('ws://'+location.host+'/encounter-events?implementation='+id+'&after='+after);
    window.roundTripFrames=[];
    socket.onmessage=event=>window.roundTripFrames.push(JSON.parse(event.data));
    socket.onopen=()=>resolve();
    socket.onerror=()=>reject(Error('Live subscription refused'));
  }),{id:first.review,after:first.revision});
  await page.goto(server.url+workPath+'&item=confirm');
  const decision=page.getByRole('region',{name:'Current decision'});
  await decision.getByRole('link',{name:'Open investigation',exact:true}).click();
  await decision.getByLabel('Question').fill('Does the manager see 120 minutes until the employee confirms?');
  await decision.getByRole('button',{name:'Open investigation',exact:true}).click();
  await decision.getByLabel('Finding').waitFor();
  await photo(page,'investigation-desktop');
  const waiting=(await reviewer('inspect',{task:'primary'})).structuredContent.work;
  const investigation=waiting.investigations[0];
  assert.equal(waiting.waitingOn,investigation.id);
  assert.equal(investigation.subject.id,'confirm');
  assert.equal(investigation.draft,first.draft);
  assert.equal(investigation.approval,first.approval.receipt.operation);
  const stale=await transport.act({action:'accept-implementation',base:String(first.revision),implementation:first.review,operation:'stale-accept'});
  assert.match(stale.notice,/^STALE:/);
  const blocked=await transport.act({action:'accept-implementation',base:String(waiting.revision),implementation:first.review,operation:'blocked-accept'});
  assert.match(blocked.notice,/^WAITING:/);
  const args={task:'primary',review:first.review,revision:waiting.revision,operation:'return-finding',action:'return-investigation',
    investigation:investigation.id,finding:'The manager sees 120 minutes pending confirmation. After confirmation the value is 90 minutes.'};
  const returned=(await reviewer('act',args)).structuredContent;
  assert.equal(returned.status,'ok',returned.notice);
  assert.equal(returned.work.draft,first.draft);
  assert.equal(returned.work.waitingOn,null);
  const repeated=(await reviewer('act',args)).structuredContent;
  assert.deepEqual(repeated.receipt,returned.receipt);
  assert.equal(repeated.work.revision,returned.work.revision);
  const changed=(await reviewer('act',{...args,finding:'Different finding.'})).structuredContent;
  assert.match(changed.notice,/^OPERATION:/);
  await decision.getByRole('link',{name:'Back to implementation review'}).click();
  await page.setViewportSize({width:360,height:640});
  await decision.getByRole('link',{name:'Finding #'+investigation.number}).waitFor();
  await decision.getByRole('link',{name:'Finding #'+investigation.number}).click();
  await decision.getByText(args.finding).waitFor();
  await page.waitForLoadState('load');
  await photo(page,'finding-mobile');
  const geometry=await page.evaluate(()=>({scrollY,innerWidth,scrollWidth:document.documentElement.scrollWidth,position:document.querySelector('.nb1-editor').getBoundingClientRect().top}));
  assert.ok(geometry.scrollY===0&&geometry.scrollWidth<=geometry.innerWidth,JSON.stringify(geometry));
  await decision.getByRole('link',{name:'Back to implementation review'}).click();
  const link=decision.getByRole('link',{name:'Plan revision 3 and receipt'});
  await link.click();
  const evidence=page.getByRole('region',{name:'Approved plan and receipt'});
  assert.ok((await evidence.innerText()).includes(first.approval.receipt.operation));
  await evidence.getByRole('link',{name:'Close approval context'}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'current-decision');
  await decision.getByRole('button',{name:'Accept for handoff'}).click();
  await decision.getByText(/Awaiting acknowledgement/).waitFor();
  await photo(page,'handoff-mobile');
  const delivered=(await transport.request()).work;
  assert.equal(delivered.handoff.owner,agent.id);
  assert.equal((await http(outsider)).inspected.status,'refused');
  assert.equal(delivered.handoff.draft,first.draft);
  assert.equal(delivered.handoff.approval,first.approval.receipt.operation);
  assert.deepEqual(delivered.handoff.findings,[returned.receipt.operation]);
  const assignee=await mcp(agent);
  const queue=(await assignee('inspect',{})).structuredContent;
  assert.equal(queue.next.handoff.id,delivered.handoff.id);
  const other=await mcp(outsider);
  assert.equal((await other('inspect',{})).structuredContent.next,null);
  await agentPage.getByRole('region',{name:'Your next decision'}).getByRole('link',{name:/Handoff #/}).click();
  await agentPage.getByRole('button',{name:'Acknowledge handoff'}).waitFor();
  await photo(agentPage,'recipient-desktop');
  await agentPage.getByRole('link',{name:'Handoff #'+delivered.handoff.number+' receipt'}).click();
  assert.ok((await agentPage.getByRole('region',{name:'Approved plan and receipt'}).innerText()).includes(delivered.handoff.acceptance));
  const ackArgs={task:'primary',review:first.review,revision:delivered.revision,operation:'acknowledge-once',action:'acknowledge-handoff'};
  assert.equal((await reviewer('act',ackArgs)).structuredContent.status,'refused');
  const ack=(await assignee('act',ackArgs)).structuredContent;
  assert.equal(ack.status,'ok',ack.notice);
  assert.equal(ack.work.handoff.state,'acknowledged');
  assert.equal((await assignee('inspect',{})).structuredContent.next,null);
  const httpEvents=(await transport.request({after:String(first.revision)})).events;
  const mcpEvents=(await reviewer('follow',{task:'primary',after:first.revision})).structuredContent.events;
  const queueEvents=(await assignee('follow',{after:first.revision})).structuredContent.events;
  assert.deepEqual(queueEvents,httpEvents.slice(-2));
  assert.deepEqual((await other('follow',{after:first.revision})).structuredContent.events,[]);
  assert.deepEqual(mcpEvents,httpEvents);
  assert.deepEqual(httpEvents.map(e=>e.action),['open-investigation','return-investigation','accept-implementation','acknowledge-handoff']);
  assert.deepEqual(httpEvents.map(e=>e.operation),[investigation.opened,returned.receipt.operation,delivered.handoff.acceptance,ack.receipt.operation]);
  const socketEvents=await page.evaluate(({id,after,count})=>new Promise((resolve,reject)=>{
    const socket=new WebSocket('ws://'+location.host+'/encounter-events?implementation='+id+'&after='+after);
    const frames=[]; const timeout=setTimeout(()=>{socket.close();reject(Error('WebSocket replay timed out'));},5000);
    socket.onerror=()=>{clearTimeout(timeout);reject(Error('WebSocket refused'));};
    socket.onmessage=event=>{frames.push(JSON.parse(event.data));if(frames.length===count){clearTimeout(timeout);socket.close();resolve(frames);}};
  }),{id:first.review,after:first.revision,count:httpEvents.length});
  assert.deepEqual(socketEvents,httpEvents);
  await streamPage.waitForFunction(count=>window.roundTripFrames.length===count,httpEvents.length);
  assert.deepEqual(await streamPage.evaluate(()=>window.roundTripFrames),httpEvents);
  console.log('PASS Notebook opens the investigation, MCP returns the finding, Notebook accepts, and the assigned recipient acknowledges through MCP.');
  console.log('PASS shared draft, approval and receipts, stale/blocked/unauthorized refusals, exact retry, and HTTP/MCP/WebSocket live and replay parity, and live recipient queue delivery.');
  await server.close();
  server=await start();
  const cold=(await http(owner)).inspected.work;
  assert.deepEqual(cold.handoff,ack.work.handoff);
  assert.deepEqual(cold.investigations,ack.work.investigations);
  console.log('PASS reopening the store retains the finding, the handoff, and the acknowledgement.');
} catch(error) {
  console.error(server?.diagnostics());
  throw error;
} finally {
  await Promise.all(clients.map(client=>client.close()));
  await browser?.close();
  await server?.close();
  fs.rmSync(store,{recursive:true,force:true});
}
