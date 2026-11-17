'use strict';

function valuePorts() {
  // JSON transport refuses lossy host values; evaluator-internal absence is not JSON.
  const transport=(value,seen=new Set())=>{
    if(value===null || typeof value==='string' || typeof value==='boolean')return;
    if(typeof value==='number' && Number.isFinite(value))return;
    if(!value || typeof value!=='object' || seen.has(value))throw Error('Nonportable JSON value [TEMPLE-V001]');
    const array=Array.isArray(value), descriptors=Object.getOwnPropertyDescriptors(value);
    if(!array && ![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Nonportable JSON record [TEMPLE-V001]');
    const keys=Reflect.ownKeys(value).filter(key=>!(array && key==='length'));
    if(array && (keys.length!==value.length || keys.some((key,index)=>key!==String(index))))throw Error('Nonportable JSON array [TEMPLE-V001]');
    seen.add(value);
    for(const key of keys){
      const descriptor=descriptors[key];
      if(typeof key!=='string' || !descriptor.enumerable || !Object.hasOwn(descriptor,'value'))throw Error('Nonportable JSON field [TEMPLE-V001]');
      transport(descriptor.value,seen);
    }
    seen.delete(value);
  };
  return {
    'value.describe': ({value}) => {
      const object=value!==null && typeof value==='object';
      const descriptors=object?Object.getOwnPropertyDescriptors(value):{};
      return {type:typeof value,array:Array.isArray(value),null:value===null,
        plain:object && [Object.prototype,null].includes(Object.getPrototypeOf(value)),
        finite:typeof value==='number' && Number.isFinite(value),
        dataOnly:Reflect.ownKeys(descriptors).every(key=>typeof key==='string' && Object.hasOwn(descriptors[key],'value') && (descriptors[key].enumerable || (Array.isArray(value) && key==='length'))),
        dense:!Array.isArray(value) || (Object.keys(value).length===value.length && Object.keys(value).every((key,index)=>key===String(index)))};
    },
    'json.parse': ({text}) => {const value=JSON.parse(text);transport(value);return value;},
    'json.stringify': ({value,space}) => {transport(value);return JSON.stringify(value,null,space);},
    'value.string': ({value}) => String(value),
    'value.type': ({value}) => typeof value,
    'record.entries': ({value}) => Object.entries(value),
    'record.fromEntries': ({entries}) => Object.fromEntries(entries),
    'record.put': ({record,key,value}) => Object.assign(Object.create(null),record,{[key]:value}),
    'value.freeze': ({value}) => {
      const freeze=item=>{if(item&&typeof item==='object'&&!Object.isFrozen(item)){Object.values(item).forEach(freeze);Object.freeze(item);}return item;};
      return freeze(value);
    },
    'record.get': ({record, key}) => record != null && Object.hasOwn(record, key) ? record[key] : null,
    'text.replaceAll': ({value, search, replacement}) => value.replaceAll(search, replacement),
    'text.split': ({value, pattern}) => value.split(new RegExp(pattern)),
    'text.join': ({values, separator}) => values.join(separator),
    'text.slice': ({value,start,end}) => value.slice(start,end),
    'text.indexOf': ({value,search,from}) => value.indexOf(search,from),
    // Native collation observation only; ordering policy stays in algebra.
    'text.compare': ({left,right}) => left.localeCompare(right),
    'text.trim': ({value}) => value.trim(),
    'text.lowerCase': ({value}) => value.toLowerCase(),
    'text.matches': ({value, pattern, flags}) => new RegExp(pattern, flags).test(value),
  };
}

module.exports = {valuePorts};
