import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createServer} from "node:https";
import {readFile} from "node:fs/promises";
import {once} from "node:events";
const {chromium}=createRequire(process.env.QA_NODE_PACKAGE)("playwright");
const origin="https://appdev.sourcerytech.com.au";
const fixture="http://127.0.0.1:24417";
let observed={};
const server=createServer({
  key:await readFile(process.env.FIXTURE_DIR+"/fixture.key"),
  cert:await readFile(process.env.FIXTURE_DIR+"/fixture.crt"),
},async (request,response)=>{
  try {
    const url=new URL(request.url,origin);
    if(url.pathname==="/workspace/home"){
      response.writeHead(200,{"content-type":"text/html"});
      response.end("<!doctype html><iframe title='Aster Codex' width='900' height='650' src='/aster-codex/chat?id="+process.env.FIXTURE_CHAT+"'></iframe>");
      return;
    }
    if(url.pathname==="/workspace/sourcery-os/shared.css"){response.writeHead(200,{"content-type":"text/css"});response.end();return;}
    if(!url.pathname.startsWith("/aster-codex/")) {response.writeHead(404);response.end();return;}
    if(request.headers.cookie!=="fixture_session=owner"){response.writeHead(401,{"content-type":"text/html"});response.end("<!doctype html><title>Sign in required</title><p>Sign in required.</p>");return;}
    const chunks=[];
    for await (const chunk of request) chunks.push(chunk);
    const method=request.method;
    const headers={"X-Aster-Codex-Admission":process.env.FIXTURE_TOKEN};
    if(request.headers.origin!==undefined)headers.Origin=request.headers.origin;
    if(request.headers["content-type"]!==undefined)headers["Content-Type"]=request.headers["content-type"];
    const upstream=await fetch(fixture+url.pathname+url.search,{method,headers,body:method==="POST"?Buffer.concat(chunks):undefined,redirect:"manual"});
    const forwarded=Object.fromEntries(upstream.headers);
    if(url.pathname==="/aster-codex/send"){
      observed={origin:headers.Origin??"(missing)",status:upstream.status,
        csp:upstream.headers.get("content-security-policy"),location:upstream.headers.get("location")?.split("?")[0]??null};
    }
    response.writeHead(upstream.status,forwarded);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch(error) {
    console.error(error.message); response.writeHead(502); response.end();
  }
});
server.listen(0,"127.0.0.1");
await once(server,"listening");
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,
  args:["--no-sandbox","--no-proxy-server","--host-resolver-rules=MAP appdev.sourcerytech.com.au 127.0.0.1:"+server.address().port]});
try {
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await context.newPage();
  assert.equal((await page.goto(origin+"/aster-codex/")).status(),401);
  await context.addCookies([{name:"fixture_session",value:"owner",url:origin,httpOnly:true,secure:true}]);
  const errors=[];
  page.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await page.goto(origin+"/workspace/home");
  const frame=page.frameLocator("iframe");
  await frame.getByRole("textbox",{name:"Message Codex"}).fill("Disposable fixture prompt");
  await frame.getByRole("button",{name:"Send",exact:true}).click();
  await frame.getByText("Message sent to Codex.",{exact:true}).waitFor({timeout:7000});
  assert.equal(observed.origin,origin);
  assert.equal(observed.status,303);
  assert.equal(observed.location,"/aster-codex/chat");
  assert.ok(!errors.some(e=>e.includes("frame-ancestors 'none'")),JSON.stringify(errors));
  const reject=await fetch(fixture+"/aster-codex/send",{
    method:"POST",headers:{Origin:"null","X-Aster-Codex-Admission":process.env.FIXTURE_TOKEN},
    body:new URLSearchParams({id:process.env.FIXTURE_CHAT,prompt:"Must not be delivered",ticket:"invalid"})
  });
  assert.equal(reject.status,403);
  assert.match(reject.headers.get("content-security-policy"),/frame-ancestors 'self'/);
  console.log("PASS: signed-out blocked, signed-in iframe Send delivered once and displayed confirmation, null origin still rejected with a frameable error.");
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
