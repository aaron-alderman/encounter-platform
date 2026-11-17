'use strict';

function valuePorts() {
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
    'text.split': () => {throw Error('Isolated regex transport required');},
    'text.join': ({values, separator}) => values.join(separator),
    'text.slice': ({value,start,end}) => value.slice(start,end),
    'text.indexOf': ({value,search,from}) => value.indexOf(search,from),
    // Native collation observation only; ordering policy stays in algebra.
    'text.compare': ({left,right}) => left.localeCompare(right),
    'text.trim': ({value}) => value.trim(),
    'text.lowerCase': ({value}) => value.toLowerCase(),
    'text.matches': () => {throw Error('Isolated regex transport required');},
  };
}

module.exports = {valuePorts};
