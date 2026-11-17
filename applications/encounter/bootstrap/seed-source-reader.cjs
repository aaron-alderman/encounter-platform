'use strict';
// Explicit irreducible bootstrap reader, used only on the pinned foundation.
// No application source enters here in the publication/runtime path. The image
// it reads is discarded after Encounter re-parses, REL-hydrates and admits itself.
const {atom}=require('./rel-values.cjs');
function syntaxMechanisms({atom}){
const LIMITS=Object.freeze({units:160000,tokens:36000,depth:64});
function parseEncounter(text,file='<Encounter>',observe=false){
  if(typeof text!=='string'||text.length>LIMITS.units)throw Error(file+': Encounter source bound exceeded');
  const tokens=[];let i=0,line=1,column=0;
  function push(type,value,start,startLine,startColumn){if(tokens.length>=LIMITS.tokens)throw Error(file+': Encounter token bound exceeded');tokens.push({type,value,start,line:startLine,column:startColumn});}
  while(i<text.length){
    const c=text[i],start=i,ln=line,col=column;
    if(c==='\r'&&text[i+1]==='\n'){i++;continue;}
    if(c==='\n'){push('nl','\n',i,line,column);i++;line++;column=0;continue;}
    if(c===' '){i++;column++;continue;}
    if(c==='\t'||c==='\r')throw Error(file+':'+line+': tabs or bare CR are not Encounter indentation');
    if(c==='#'){while(i<text.length&&text[i]!=='\n'){i++;column++;}continue;}
    if(c==='"'){
      i++;column++;let closed=false;while(i<text.length){const q=text[i++];column++;if(q==='\n'||q==='\r')throw Error(file+':'+line+': multiline scalar');if(q==='\\'){i++;column++;}else if(q==='"'){closed=true;break;}}
      if(!closed)throw Error(file+':'+line+': unclosed string');push('string',atom(text.slice(start,i)),start,ln,col);continue;
    }
    const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if(number){i+=number[0].length;column+=number[0].length;const n=Number(number[0]);if(!Number.isFinite(n))throw Error('Nonfinite Encounter number');push('number',n,start,ln,col);continue;}
    const name=/^\$?[A-Za-z_][A-Za-z0-9_.-]*/.exec(text.slice(i));
    if(name){i+=name[0].length;column+=name[0].length;push('name',name[0],start,ln,col);continue;}
    if('{}[](),;:=→'.includes(c)){push(c,c,start,ln,col);i++;column++;continue;}
    throw Error(file+':'+line+':'+column+': invalid Encounter token');
  }
  tokens.push({type:'nl',value:'\n',line,column,start:i},{type:'eof',line,column:0,start:i});let pos=0;
  const kinds=new Set(['nl','eof','name','number','string']);
  const peek=()=>tokens[pos],is=v=>peek().type===v||(!kinds.has(v)&&peek().type==='name'&&peek().value===v);
  const fail=message=>{throw Error(file+':'+peek().line+':'+peek().column+': '+message);};
  const take=v=>{if(v!==undefined&&!is(v))fail('Expected '+v);return tokens[pos++];};
  const nls=()=>{while(is('nl'))pos++;};
  const name=()=>{const t=take('name');if(t.value[0]==='$')fail('Expected a lexical name');return t.value;};
  function expression(depth=0){
    if(depth>LIMITS.depth)fail('Expression nesting exceeds bound');const t=take();
    if(t.type==='string'){if(t.value.startsWith('$'))fail('Quoted leading-dollar text is ambiguous; use REL data for literal values');return t.value;}
    if(t.type==='number')return t.value;
    if(t.type==='['){take(']');return [];}
    if(t.type==='name'){
      if(t.value[0]==='$')return t.value;
      if(t.value==='true'||t.value==='false')return t.value==='true';if(t.value==='null')return null;
      take('(');nls();const args=[];while(!is(')')){args.push(expression(depth+1));nls();if(!is(')')){take(',');nls();if(is(')'))fail('Trailing argument comma');}}take(')');return [t.value,...args];
    }
    if(t.type==='{'){
      const record=Object.create(null);nls();while(!is('}')){const k=peek().type==='string'?take().value:name();if(Object.hasOwn(record,k)||['__proto__','constructor','prototype'].includes(k))fail('Duplicate or forbidden field');take('=');nls();record[k]=expression(depth+1);nls();if(!is('}')){take(';');nls();}}take('}');return record;
    }
    fail('Expected an Encounter expression');
  }
  function end(){take('nl');nls();}
  function suite(indent,depth=0,fold=false){
    if(depth>LIMITS.depth)fail('Statement nesting exceeds bound');nls();const steps=[];let yielded;
    while(!is('eof')&&peek().column>=indent){
      if(peek().column!==indent)fail('Unexpected indentation');const form=name();
      if(form==='yield'){
        if(!fold||yielded)fail('Unexpected fold yield');const value=expression();take('→');const into=name();end();yielded={value,into};if(peek().column>=indent&&!is('eof'))fail('Yield must end a fold suite');break;
      }
      let step;
      if(form==='let'){const binding=name();take('=');step={let:binding,value:expression()};end();}
      else if(form==='call'){step={call:name()};end();}
      else if(form==='port'){const port=name(),args=expression();if(!args||Array.isArray(args)||typeof args!=='object')fail('Port arguments must be a record');take('→');step={port,args,into:name()};end();}
      else if(form==='assert'){const condition=expression();end();if(peek().column!==indent+2)fail('Expected indented otherwise message');take('otherwise');const message=take('string').value;end();step={assert:condition,message};}
      else if(form==='when'){const condition=expression();take(':');end();step={when:condition,then:suite(indent+2,depth+1).steps};}
      else if(form==='each'){const collection=expression();take('as');const binding=name();take(':');end();step={each:collection,as:binding,steps:suite(indent+2,depth+1).steps};}
      else if(form==='fold'){
        const collection=expression();take('as');const binding=name();take(';');const accumulator=name();take('starts');const initial=expression();take(':');end();const body=suite(indent+2,depth+1,true);if(!body.yielded)fail('Fold requires yield');step={fold:collection,as:binding,accumulator,initial,steps:body.steps,yield:body.yielded.value,into:body.yielded.into};
      }else if(form==='try'){
        take(':');end();const body=suite(indent+2,depth+1).steps;if(peek().column!==indent)fail('Expected matching catch');take('catch');const error=name();take(':');end();step={try:body,error,catch:suite(indent+2,depth+1).steps};
      }else fail('Unknown statement '+form);
      steps.push(step);
    }
    return {steps,yielded};
  }
  nls();take('process-module');const protocol=take('string').value;if(protocol!=='temple/surface-process-module/1')fail('Unsupported process module');end();let profile;
  if(is('profile')){take();profile=take('string').value;end();}
  const queries=Object.create(null),origins=[];while(!is('eof')){if(peek().column!==0)fail('Process declaration must begin at column zero');const begin=take('process');const q=name();if(Object.hasOwn(queries,q))fail('Duplicate process '+q);take(':');end();queries[q]=suite(2).steps;if(observe){let stop=peek().start;while(stop>begin.start&&/\s/.test(text[stop-1]))stop--;origins.push({pointer:'/queries/'+q.replaceAll('~','~0').replaceAll('/','~1'),kind:'process-definition',file,start:begin.start,end:stop,line:begin.line,column:begin.column+1,synthetic:false});}}
  if(!Object.keys(queries).length)fail('Empty process module');const module={protocol,queries};return observe?{module,origins}:module;
}
return {parseEncounter,LIMITS};
}
module.exports={...syntaxMechanisms({atom}),syntaxMechanisms};
