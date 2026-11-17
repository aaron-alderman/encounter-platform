'use strict';
// Mechanical REL scalar/value codec. It never interprets values as instructions.
// No object parser, executable deserialiser, filesystem access or fallback.
function relMechanisms(){
const forbidden = new Set(['__proto__','prototype','constructor']);
function quote(value) {
  if(typeof value!=='string')throw Error('REL atom must be text');
  return '"'+value.replace(/["\\\u0000-\u001f\u2028\u2029\ud800-\udfff]/g,c=>({'"':'\\"','\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t','\b':'\\b','\f':'\\f'}[c]??'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))) +'"';
}
function atom(text) {
  if(typeof text!=='string'||text[0]!=='"'||text.at(-1)!=='"')throw Error('Expected a quoted REL atom');
  let out='';
  for(let i=1;i<text.length-1;i++){
    let c=text[i];
    if(c==='"'||c.charCodeAt(0)<32)throw Error('Invalid REL scalar');
    if(c==='\\'){
      c=text[++i];if(i>=text.length-1)throw Error('Unclosed scalar escape');
      const escapes={'"':'"','\\':'\\','/':'/','n':'\n','r':'\r','t':'\t','b':'\b','f':'\f'};
      if(c==='u'){
        const hex=text.slice(i+1,i+5);if(!/^[0-9a-fA-F]{4}$/.test(hex))throw Error('Invalid scalar escape');
        out+=String.fromCharCode(parseInt(hex,16));i+=4;
      } else {if(!Object.hasOwn(escapes,c))throw Error('Invalid scalar escape');out+=escapes[c];}
    }else out+=c;
  }
  return out;
}
function parse(text,{maxFacts=500000,maxUnits=32000000}={}){
  if(typeof text!=='string'||text.length>maxUnits)throw Error('REL source bound exceeded');
  const facts=[];let i=0;
  const ws=()=>{while(i<text.length){if(/\s/.test(text[i]))i++;else if(text.slice(i,i+2)==='//'){while(i<text.length&&text[i]!=='\n')i++;}else break;}};
  const take=c=>{ws();if(text[i++]!==c)throw Error('Invalid REL punctuation at '+(i-1));};
  const read=()=>{ws();const start=i;if(text[i++]!=='"')throw Error('Expected REL atom at '+start);let closed=false;while(i<text.length){const c=text[i++];if(c==='\\')i++;else if(c==='"'){closed=true;break;}}if(!closed)throw Error('Unclosed REL atom');return atom(text.slice(start,i));};
  ws();while(i<text.length){take('(');const s=read();take(',');const p=read();take(',');const o=read();ws();let pol='is';if(text[i]===','){i++;pol=read();}take(')');if(!['is','is-not'].includes(pol))throw Error('Invalid polarity');if(facts.length>=maxFacts)throw Error('REL fact bound exceeded');facts.push(Object.freeze({s,p,o,pol}));ws();}
  return Object.freeze(facts);
}
function print(facts){
  // Read own-data descriptors, never caller-owned getters or array methods.
  if(!Array.isArray(facts))throw Error('REL facts require an own-data array');
  const descriptors=Object.getOwnPropertyDescriptors(facts),length=descriptors.length.value,keys=Reflect.ownKeys(facts);
  if(keys.length!==length+1)throw Error('REL facts require a dense data array');
  const data=[];
  for(let i=0;i<length;i++){
    const item=descriptors[String(i)];if(!item?.enumerable||!Object.hasOwn(item,'value'))throw Error('REL fact accessor refused');
    const value=item.value;if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('REL fact record required');
    const fields=Object.getOwnPropertyDescriptors(value);
    if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!fields[key].enumerable||!Object.hasOwn(fields[key],'value')))throw Error('REL fact accessor refused');
    const fact={};for(const key of ['s','p','o','pol']){const field=fields[key];if(field)fact[key]=field.value;}
    data.push(fact);
  }
  return printAtoms(data);
}
function printAtoms(facts){return facts.map(f=>'('+[f.s,f.p,f.o,...(f.pol&&f.pol!=='is'?[f.pol]:[])].map(quote).join(', ')+')').join('\n')+'\n';}
function encode(value,kind='StaticValue'){
  const facts=[{s:'rel.document',p:'kind',o:kind}],seen=new Set();let serial=0;
  const fact=(s,p,o)=>facts.push({s,p,o});
  function node(v,depth){
    if(depth>256||serial>200000)throw Error('REL value bound exceeded');
    const id='v'+serial++;const type=v===null?'Null':Array.isArray(v)?'Sequence':typeof v==='object'?'Record':({string:'String',number:'Number',boolean:'Boolean'})[typeof v];
    if(!type||typeof v==='number'&&!Number.isFinite(v))throw Error('Nonportable REL value');fact(id,'type',type);
    if(type==='Record'||type==='Sequence'){
      if(seen.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Nonportable REL structure');seen.add(v);
      const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v).filter(key=>!(type==='Sequence'&&key==='length'));
      if(keys.some(key=>typeof key!=='string'||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))throw Error('REL values require enumerable own-data fields');
      if(type==='Sequence'){
        if(keys.length!==v.length||keys.some((key,index)=>key!==String(index)))throw Error('Sparse or extended REL sequence');
        for(let j=0;j<v.length;j++)fact(id,'item',node(descriptors[String(j)].value,depth+1));
      }else for(const key of keys){
        if(forbidden.has(key))throw Error('Forbidden REL field');const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('REL fields must be own data');
        const entry='v'+serial++;fact(id,'entry',entry);fact(entry,'type','Entry');fact(entry,'key',key);fact(entry,'value',node(d.value,depth+1));
      }
      seen.delete(v);
    }else if(type!=='Null')fact(id,'scalar',Object.is(v,-0)?'-0':String(v));
    return id;
  }
  fact('rel.document','root',node(value,0));return printAtoms(facts);
}
function decode(text,expectedKind='StaticValue'){
  const facts=parse(text),cells=new Map(),visited=new Set(),active=new Set();
  for(const f of facts){if(f.pol!=='is')throw Error('Value documents cannot retract');if(!cells.has(f.s))cells.set(f.s,new Map());const row=cells.get(f.s);if(!row.has(f.p))row.set(f.p,[]);row.get(f.p).push(f.o);}
  const one=(id,p)=>{const v=cells.get(id)?.get(p);if(v?.length!==1)throw Error('REL cardinality: '+id+'.'+p);return v[0];};
  const shape=(id,keys)=>{const row=cells.get(id);if(visited.has(id))throw Error('Shared REL value ownership');if(visited.size>=200000)throw Error('REL decoded-node bound exceeded');if(!row||[...row.keys()].some(k=>!keys.includes(k)))throw Error('Unexpected REL field: '+id);visited.add(id);};
  shape('rel.document',['kind','root']);if(one('rel.document','kind')!==expectedKind)throw Error('Wrong REL document kind');
  function node(id,depth){
    if(depth>256||active.has(id))throw Error('Cyclic or deep REL value');active.add(id);const type=one(id,'type');let result;
    if(type==='Record'){
      shape(id,['type','entry']);result=Object.create(null);
      for(const entry of cells.get(id).get('entry')??[]){shape(entry,['type','key','value']);if(one(entry,'type')!=='Entry')throw Error('Expected REL entry');const key=one(entry,'key');if(forbidden.has(key)||Object.hasOwn(result,key))throw Error('Duplicate or forbidden REL field');result[key]=node(one(entry,'value'),depth+1);}
    }else if(type==='Sequence'){shape(id,['type','item']);result=(cells.get(id).get('item')??[]).map(ref=>node(ref,depth+1));}
    else if(type==='Null'){shape(id,['type']);result=null;}
    else {shape(id,['type','scalar']);const scalar=one(id,'scalar');if(type==='String')result=scalar;else if(type==='Boolean'&&['true','false'].includes(scalar))result=scalar==='true';else if(type==='Number'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(scalar)&&Number.isFinite(Number(scalar)))result=Number(scalar);else throw Error('Invalid REL scalar type/value');}
    active.delete(id);return result&&typeof result==='object'?Object.freeze(result):result;
  }
  const result=node(one('rel.document','root'),0);if(visited.size!==cells.size)throw Error('Unreachable REL value nodes');return result;
}
function literal(value){if(typeof value==='string')return quote(value);if(value===null)return 'null';if(typeof value==='boolean')return String(value);if(typeof value==='number'&&Number.isFinite(value))return Object.is(value,-0)?'-0':String(value);return encode(value);}
function decodeData(text){
  if(typeof text!=='string'||text.length>32000000)throw Error('REL data bound exceeded');const trimmed=text.trim();
  if(trimmed.startsWith('(')||trimmed.startsWith('//'))return decode(text);
  if(trimmed.startsWith('"'))return atom(trimmed);if(trimmed==='null')return null;if(trimmed==='true')return true;if(trimmed==='false')return false;
  if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)&&Number.isFinite(Number(trimmed)))return Number(trimmed);
  throw Error('Expected typed REL data or a scalar REL literal');
}
return {quote,atom,parse,print,encode,decode,literal,decodeData};
}
module.exports={...relMechanisms(),relMechanisms};
