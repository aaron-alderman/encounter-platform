'use strict';
// Fixed computational worker. Caller strings are structured-clone data, never
// worker source. Deadlines and input limits arrive from Encounter policy.
function regexpTask({operation,args}){
  const regex=new RegExp(args.pattern,args.flags);
  if(operation==='matches')return regex.test(args.value);
  if(operation==='split')return args.value.split(regex);
  if(operation==='replace')return args.value.replace(regex,args.replacement);
  if(operation==='match'){const match=regex.exec(args.value);return match?{text:match[0],groups:match.slice(1).map(x=>x??null),index:match.index}:null;}
  if(operation==='matchAll'){const flags=args.flags===undefined?'':args.flags;return [...args.value.matchAll(new RegExp(args.pattern,flags.includes('g')?flags:(flags+'g')))].map(match=>({text:match[0],groups:match.slice(1).map(x=>x??null),index:match.index}));}
  throw Error('Unknown regex mechanism');
}
// Private observation table for the pinned source compiler/policy interpreter.
// Public port registries contain refusal stubs, never these synchronous methods.
function trustedRegexObservations(){return Object.fromEntries([['text.matches','matches'],['text.split','split'],['text.replace','replace'],['text.match','match'],['text.matchAll','matchAll']].map(([name,operation])=>[name,args=>regexpTask({operation,args})]));}
function isolatedRegexp({makeWorker}){
  let worker=null,sequence=0,queue=Promise.resolve();
  async function request(operation,args,budget){
    if(!Number.isFinite(budget.milliseconds)||budget.milliseconds<=0)throw Error('A source-owned native deadline is required');
    const execute=()=>new Promise((resolve,reject)=>{
      if(!worker)worker=makeWorker();const current=worker,id=++sequence;
      const fail=message=>{const error=Object.assign(Error(message),{code:'TEMPLE-NATIVE-LIMIT'});current.terminate();if(worker===current)worker=null;reject(error);};
      let timer;
      const cleanup=()=>{clearTimeout(timer);current.offMessage(message);current.offError(error);};
      const message=value=>{if(value.id!==id)return;cleanup();if(value.error)reject(Object.assign(Error(value.error.message),{name:value.error.name}));else resolve(value.value);};
      const error=value=>{cleanup();fail(value.message??'Native worker failed');};
      current.onMessage(message);current.onError(error);timer=setTimeout(()=>{cleanup();fail('Native regular-expression deadline exceeded');},budget.milliseconds);
      current.postMessage({id,operation,args});
    });
    const result=queue.then(execute);queue=result.catch(()=>{});return result;
  }
  return {request,close:()=>{worker?.terminate();worker=null;}};
}
let nodeService;
function nodeRegexp(){
  if(!nodeService){const {Worker}=require('node:worker_threads');nodeService=isolatedRegexp({makeWorker:()=>{
    const code='const {parentPort}=require("node:worker_threads");const task=('+regexpTask.toString()+');parentPort.on("message",message=>{try{parentPort.postMessage({id:message.id,value:task(message)});}catch(error){parentPort.postMessage({id:message.id,error:{name:String(error.name),message:String(error.message)}});}});';
    const worker=new Worker(code,{eval:true});worker.unref();
    return {postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate(),onMessage:fn=>worker.on('message',fn),offMessage:fn=>worker.off('message',fn),onError:fn=>worker.on('error',fn),offError:fn=>worker.off('error',fn)};
  }});}
  return nodeService;
}
module.exports={regexpTask,trustedRegexObservations,isolatedRegexp,nodeRegexp};
