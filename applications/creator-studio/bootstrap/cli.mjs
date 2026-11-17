import fs from 'node:fs';import {loadRuntime} from './runtime.mjs';
try{
 const runtime=await loadRuntime(),[action,file]=process.argv.slice(2);
 if(!file)throw Error('Usage: node bootstrap/cli.mjs <action> <JSON file>');
 const input=JSON.parse(fs.readFileSync(file,'utf8'));
 const result=(await runtime.run(runtime.manifest.cliEntry,{action,input})).value;
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
