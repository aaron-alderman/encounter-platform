'use strict';

// Generic observation/effect mechanisms. Application rules, geometry, timing
// policy and rendering plans are supplied by admitted process programmes.
function computationalPorts(host = {}) {
  // Standard SHA-256 primitive, retained from the captured witness mechanism.
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var withOne = len + 1;
    var total = Math.ceil((withOne + 8) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bitLenHi = Math.floor(len / 0x20000000);
    var bitLenLo = (len * 8) >>> 0;
    var view = new DataView(buf.buffer);
    view.setUint32(total - 8, bitLenHi, false);
    view.setUint32(total - 4, bitLenLo, false);
    var W = new Uint32Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
      for (i = 16; i < 64; i++) {
        var x = W[i - 15], y = W[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    var ov = new DataView(out.buffer);
    for (i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
    return out;
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function encode(text) {
    return new TextEncoder().encode(text);
  }

  function sha256HexSync(text) {
    return toHex(sha256Bytes(encode(text)));
  }


  return {
    'number.calculate': ({operation,values}) => {
      const xs=values.map(Number), [a,b]=xs;
      const operations={add:()=>xs.reduce((x,y)=>x+y,0),subtract:()=>a-b,multiply:()=>xs.reduce((x,y)=>x*y,1),divide:()=>a/b,remainder:()=>a%b,power:()=>a**b,min:()=>Math.min(...xs),max:()=>Math.max(...xs),floor:()=>Math.floor(a),ceil:()=>Math.ceil(a),round:()=>Math.round(a),abs:()=>Math.abs(a),sin:()=>Math.sin(a),cos:()=>Math.cos(a),uint32:()=>a>>>0,less:()=>a<b,lessEqual:()=>a<=b,greater:()=>a>b,greaterEqual:()=>a>=b};
      if(!Object.hasOwn(operations,operation))throw Error('Unknown numeric mechanism');
      const result=operations[operation]();if(typeof result==='number'&&!Number.isFinite(result))throw Error('Nonfinite numeric result');return result;
    },
    'number.format': ({value,digits}) => Number(value).toFixed(digits),
    'number.parse': ({value,radix}) => {const n=radix===undefined?Number(value):parseInt(value,radix);return Number.isFinite(n)?n:null;},
    'value.sort': ({values,mode}) => mode==='numeric'?[...values].sort((a,b)=>a-b):mode==='locale'?[...values].sort((a,b)=>String(a).localeCompare(String(b))):[...values].sort(),
    'text.upperCase': ({value}) => value.toUpperCase(),
    'text.replace': ({value,pattern,flags,replacement}) => value.replace(new RegExp(pattern,flags),replacement),
    'text.match': ({value,pattern,flags}) => {const m=new RegExp(pattern,flags).exec(value);return m?{text:m[0],groups:m.slice(1).map(v=>v??null),index:m.index}:null;},
    'text.matchAll': ({value,pattern,flags=''}) => [...value.matchAll(new RegExp(pattern,flags.includes('g')?flags:flags+'g'))].map(m=>({text:m[0],groups:m.slice(1).map(v=>v??null),index:m.index})),
    'text.utf8Length': ({value}) => new TextEncoder().encode(value).length,
    'digest.sha256': async ({text,fallback=false}) => {
      const crypto=host.crypto===undefined?globalThis.crypto:host.crypto;
      try {
        if(!crypto?.subtle)throw Error('Web Crypto unavailable');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
        return toHex(new Uint8Array(digest));
      } catch(error) {if(!fallback)throw error;return sha256HexSync(text);}
    },
    'clock.read': () => ({iso:(host.date??(()=>new Date()))().toISOString(),monotonic:(host.performance??globalThis.performance).now()}),
    'random.values': ({count}) => Array.from({length:count},()=> (host.random??Math.random)()),
  };
}

function browserEffects(host,dispatch) {
  const doc=host.document, win=host.window??globalThis;
  const records=host.effects??(host.effects=new Map());const allocate=()=>{host.effectNext=(host.effectNext??0)+1;return host.effectNext;};
  const nodes=host.effectNodes??(host.effectNodes=new WeakMap());
  const element=ref=>{const spec=typeof ref==='string'?{selector:ref}:ref;if(spec.handle){const value=records.get(spec.handle)?.node;if(!value)throw Error('Expired DOM observation handle');return value;}const list=doc.querySelectorAll(spec.selector);const value=list[spec.index??0];if(!value)throw Error('Missing DOM observation target: '+spec.selector);return value;};
  const rect=value=>({x:value.x,y:value.y,top:value.top,bottom:value.bottom,left:value.left,right:value.right,width:value.width,height:value.height});
  const reference=el=>{let handle=nodes.get(el);if(!handle){handle=allocate();nodes.set(el,handle);records.set(handle,{kind:'node',node:el});}return {handle};};
  const target=spec=>spec==='window'?win:spec==='document'?doc:spec==='fonts'?doc.fonts:spec?.media?win.matchMedia(spec.media):element(spec);
  const describe=el=>({ref:reference(el),tag:el.tagName,attributes:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),text:el.textContent,rect:rect(el.getBoundingClientRect()),value:el.value??null,checked:Boolean(el.checked),disabled:Boolean(el.disabled),hidden:Boolean(el.hidden)});
  const eventValue=e=>({type:e.type,key:e.key??'',code:e.code??'',matches:e.matches??null,timeStamp:e.timeStamp,clientX:e.clientX??0,clientY:e.clientY??0,target:e.target?.nodeType===1?describe(e.target):null});
  return {
    'storage.read': ({key,maxLength=65536}) => {try{const value=(host.storage??win.localStorage).getItem(key);if(value!==null&&value.length>maxLength)return {ok:false,value:null};return {ok:true,value};}catch{return {ok:false,value:null};}},
    'storage.write': ({key,value}) => {if(typeof value!=='string')throw Error('Storage requires text');try{(host.storage??win.localStorage).setItem(key,value);return {ok:true};}catch{return {ok:false};}},
    'storage.remove': ({key}) => {try{(host.storage??win.localStorage).removeItem(key);return {ok:true};}catch{return {ok:false};}},
    'browser.environment': () => ({width:win.innerWidth,height:win.innerHeight,dpr:win.devicePixelRatio??1,scrollX:win.scrollX,scrollY:win.scrollY,hidden:doc.hidden,visibility:doc.visibilityState,reduced:win.matchMedia('(prefers-reduced-motion: reduce)').matches,secure:win.isSecureContext,crypto:Boolean((host.crypto??win.crypto)?.subtle),intersection:typeof win.IntersectionObserver==='function'}),
    'browser.mediaQuery': ({query}) => win.matchMedia(query).matches,
    'browser.select': ({selector}) => [...doc.querySelectorAll(selector)].map(describe),
    'browser.read': ({ref}) => describe(element(ref)),
    'browser.relative': ({ref,relation,selector}) => {const el=element(ref);const found=relation==='parent'?el.parentElement:relation==='closest'?el.closest(selector):relation==='query'?el.querySelector(selector):null;if(!['parent','closest','query'].includes(relation))throw Error('Unknown DOM relationship');return found?describe(found):null;},
    'browser.property': ({ref,name}) => {const value=element(ref)[name];if(!['string','number','boolean'].includes(typeof value)&&value!==null)throw Error('Nonportable DOM property observation');return value;},
    'browser.write': ({ref,name,value}) => {const allowed=['value','checked','disabled','hidden','readOnly','tabIndex','textContent','className','open','max','min','title'];if(!allowed.includes(name))throw Error('Undeclared DOM property effect');element(ref)[name]=value;return true;},
    'browser.attribute': ({ref,name,value}) => {const el=element(ref);if(/^on/i.test(name)||['srcdoc'].includes(name))throw Error('Executable attribute effect refused');if(value===null)el.removeAttribute(name);else el.setAttribute(name,String(value));return true;},
    'browser.style': ({ref,name,value}) => {const el=element(ref);if(value===null)el.style.removeProperty(name);else el.style.setProperty(name,String(value));return true;},
    'browser.class': ({ref,name,value}) => {element(ref).classList.toggle(name,Boolean(value));return true;},
    'browser.content': ({ref,html}) => {element(ref).innerHTML=html;return true;},
    'browser.insert': ({ref,position,html}) => {if(!['beforebegin','afterbegin','beforeend','afterend'].includes(position))throw Error('Unknown DOM insertion position');element(ref).insertAdjacentHTML(position,html);return true;},
    'browser.replace': ({ref,html}) => {element(ref).outerHTML=html;return true;},
    'browser.remove': ({ref}) => {element(ref).remove();return true;},
    'browser.focus': ({ref,preventScroll}) => {element(ref).focus({preventScroll:Boolean(preventScroll)});return true;},
    'browser.scrollIntoView': ({ref,block,behavior}) => {element(ref).scrollIntoView({block,behavior});return true;},
    'browser.reflow': ({ref}) => element(ref).offsetWidth,
    'browser.on': ({ref,event,query,input,preventDefault,preventKeys,delegate}) => {
      const parent=target(ref),id=allocate();const listener=e=>{if(delegate&&!e.target?.closest?.(delegate))return;if(preventDefault||preventKeys?.includes(e.key))e.preventDefault();dispatch(query,{...input,event:eventValue(e),matched:delegate?describe(e.target.closest(delegate)):null}).catch(error=>host.reportError?.(error,query));};
      parent.addEventListener(event,listener);records.set(id,{kind:'event',parent,event,listener});return id;
    },
    'browser.intersection': ({selector,query,input,rootMargin,threshold}) => {
      const observer=new win.IntersectionObserver(entries=>{dispatch(query,{...input,entries:entries.map(e=>({ref:reference(e.target),isIntersecting:e.isIntersecting,ratio:e.intersectionRatio,rect:rect(e.boundingClientRect)}))}).catch(error=>host.reportError?.(error,query));},{rootMargin,threshold});
      for(const el of doc.querySelectorAll(selector))observer.observe(el);const id=allocate();records.set(id,{kind:'observer',observer});return id;
    },
    'browser.unobserve': ({id,ref}) => {records.get(id)?.observer?.unobserve(element(ref));return true;},
    'browser.cancel': ({id}) => {const record=records.get(id);if(!record)return false;if(record.kind==='event')record.parent.removeEventListener(record.event,record.listener);if(record.kind==='observer')record.observer.disconnect();if(record.kind==='frame')win.cancelAnimationFrame(record.handle);if(record.kind==='timer')win.clearTimeout(record.handle);records.delete(id);return true;},
    'browser.frame': ({query,input}) => {const id=allocate(),handle=win.requestAnimationFrame(time=>{records.delete(id);dispatch(query,{...input,time}).catch(error=>host.reportError?.(error,query));});records.set(id,{kind:'frame',handle});return id;},
    'browser.delay': ({milliseconds}) => new Promise(resolve=>win.setTimeout(()=>resolve(true),milliseconds)),
    'browser.timer': ({query,input,milliseconds}) => {const id=allocate(),handle=win.setTimeout(()=>{records.delete(id);dispatch(query,input).catch(error=>host.reportError?.(error,query));},milliseconds);records.set(id,{kind:'timer',handle});return id;},
    'browser.fontsReady': async () => {await doc.fonts?.ready;return true;},
    'browser.location': () => ({hash:win.location.hash,href:win.location.href,origin:win.location.origin,path:win.location.pathname,base:doc.baseURI}),
    'browser.navigate': ({hash}) => {win.location.hash=String(hash);return true;},
    'browser.title': ({value}) => {doc.title=String(value);return true;},
    'browser.scroll': ({top=0,left=0,behavior='instant'}) => {win.scrollTo({top,left,behavior});return true;},
    'browser.dialog': ({ref,open}) => {const node=element(ref);if(open&&!node.open)node.showModal();if(!open&&node.open)node.close();return true;},
    'document.fragment': ({html,selector,base,removeSelectors=[],urlAttributes=[],keepFragmentLinks=false}) => {
      const parsed=new win.DOMParser().parseFromString(html,'text/html');
      for(const removeSelector of removeSelectors)for(const node of parsed.querySelectorAll(removeSelector))node.remove();
      if(base)for(const name of urlAttributes)for(const node of parsed.querySelectorAll('['+name+']')){
        const value=node.getAttribute(name);if(value&&!(keepFragmentLinks&&value.startsWith('#')))node.setAttribute(name,new win.URL(value,base).href);
      }
      const selected=parsed.querySelector(selector);if(!selected)throw Error('Missing document fragment');return selected.innerHTML;
    },
    'browser.frameContent': ({ref,html,bindings=[],sandbox=[]}) => {
      // Native capability ceiling: this bridge never permits frame scripts.
      if(!Array.isArray(sandbox)||sandbox.some(token=>token!=='allow-same-origin'))throw Error('Unsupported frame capability');
      const frame=element(ref);frame.setAttribute('sandbox',sandbox.join(' '));
      frame.onload=()=>{for(const binding of bindings)frame.contentDocument.addEventListener(binding.event,event=>{
        const matched=binding.delegate?event.target.closest?.(binding.delegate):event.target;
        if(!matched)return;if(binding.preventDefault)event.preventDefault();
        dispatch(binding.query,{...binding.input,event:eventValue(event),matched:describe(matched),frame:reference(frame)}).catch(error=>host.reportError?.(error,binding.query));
      });};frame.srcdoc=html;return true;
    },
    'canvas.draw': ({ref,width,height,dpr,commands}) => {
      const canvas=element(ref);if(width!==undefined)canvas.width=width;if(height!==undefined)canvas.height=height;const ctx=canvas.getContext('2d'),gradients=new Map();if(dpr!==undefined)ctx.setTransform(dpr,0,0,dpr,0,0);
      const methods=['clearRect','fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','fill','stroke','fillText','setLineDash','save','restore','translate','rotate','scale','setTransform'];const properties=['globalAlpha','fillStyle','strokeStyle','lineWidth','font','textAlign','lineCap','lineJoin'];
      for(const command of commands){if(command.kind==='gradient'){const g=ctx.createRadialGradient(...command.args);for(const [offset,color]of command.stops)g.addColorStop(offset,color);gradients.set(command.id,g);}else if(command.kind==='set'){if(!properties.includes(command.name))throw Error('Unknown canvas property');ctx[command.name]=command.gradient?gradients.get(command.gradient):command.value;}else{if(!methods.includes(command.name))throw Error('Unknown canvas effect');ctx[command.name](...command.args);}}return true;
    },
    'image.rasterize': ({width,height,pixels,rows}) => {const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);image.data.set(rows?rows.flat():pixels);ctx.putImageData(image,0,0);return canvas.toDataURL();},
    'media.read': ({ref}) => {const video=element(ref);return {paused:video.paused,muted:video.muted,volume:video.volume,currentTime:video.currentTime,currentSrc:video.currentSrc,readyState:video.readyState,seekable:Array.from({length:video.seekable.length},(_,i)=>[video.seekable.start(i),video.seekable.end(i)])};},
    'media.write': ({ref,name,value}) => {if(!['muted','volume','currentTime','preload','controls','src'].includes(name))throw Error('Unknown media property');element(ref)[name]=value;return true;},
    'media.play': async ({ref}) => {try{await element(ref).play();return {ok:true};}catch(error){return {ok:false,name:error.name};}},
    'media.pause': ({ref}) => {element(ref).pause();return true;},
    'media.load': ({ref}) => {element(ref).load();return true;},
    'browser.once': ({ref,event}) => new Promise(resolve=>target(ref).addEventListener(event,e=>resolve(eventValue(e)),{once:true})),
    'asset.blobURL': async ({url}) => {const response=await (host.fetch??win.fetch)(url);if(!response.ok)throw Error('Asset request failed: '+response.status);return win.URL.createObjectURL(await response.blob());},
    'asset.json': async ({url,cache}) => {const response=await (host.fetch??win.fetch)(url,{cache});if(!response.ok)throw Error('Asset request failed: '+response.status);return response.json();},
    'asset.text': async ({url,cache}) => {const response=await (host.fetch??win.fetch)(url,{cache});if(!response.ok)throw Error('Asset request failed: '+response.status);return response.text();},
  };
}

module.exports={computationalPorts,browserEffects};
