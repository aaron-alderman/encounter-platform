'use strict';

function reportBrowserError(error,query) {
  // Generic host fault display. The document opts into a sink; no application
  // recovery, model mutation, retry or fresh execution budget is introduced.
  const sink=document.querySelector('[data-temple-errors]');
  if(sink)sink.textContent=error ? (query ? query+': ' : '')+String(error.message??error) : '';
  if(error)console.error(error);
}

function browserPorts(host, dispatch) {
  const {document, fetch, reportError} = host;
  const bindings=host.bindings??new Map();
  const mounts=host.mounts??new Map();
  const node = selector => { const result = document.querySelector(selector); if (!result) throw Error('Missing DOM target: ' + selector); return result; };
  return {
    'state.get': ({key}) => host.state.get(key),
    'state.set': ({key, value}) => {host.state.set(key,value);return true;},
    'dom.setValue': ({selector,value}) => {const target=node(selector);if(target.value!==value)target.value=value;return true;},
    'dom.readOnly': ({selector,value}) => {node(selector).readOnly=Boolean(value);return true;},
    'dom.selection': ({selector}) => {const target=node(selector);return {start:target.selectionStart??0,end:target.selectionEnd??0};},
    'dom.setSelection': ({selector,start,end}) => {node(selector).setSelectionRange(start,end);return true;},
    'dom.disabled': ({selector,value}) => {node(selector).disabled=Boolean(value);return true;},
    'dom.hidden': ({selector,value}) => {node(selector).hidden=Boolean(value);return true;},
    'dom.focus': ({selector}) => {node(selector).focus();return true;},
    'download.text': ({name,text}) => {
      const url=host.URL.createObjectURL(new host.Blob([text],{type:'text/plain;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=name;
      document.body.appendChild(link);link.click();link.remove();
      host.setTimeout(()=>host.URL.revokeObjectURL(url),0);return true;
    },
    'dom.exists': ({selector}) => Boolean(document.querySelector(selector)),
    'dom.on': ({selector, event, query, preventDefault, input, observeEvent, preventKeys}) => { const target=node(selector);bindings.set(selector+'\0'+event,{selector,event,query,input:input??null,target});target.addEventListener(event, e => {
      if (preventDefault || preventKeys?.includes(e.key)) e.preventDefault();
      reportError(null);
      const observed=observeEvent?{...input,event:{key:e.key??'',code:e.code??'',ctrl:Boolean(e.ctrlKey),alt:Boolean(e.altKey),shift:Boolean(e.shiftKey),meta:Boolean(e.metaKey),target:e.target?.id??'',tag:e.target?.tagName??''}}:input;
      dispatch(query,observed).catch(error=>reportError(error,query));
    }); return true; },
    'dom.mount': ({selector,parent}) => {
      const target=node(selector);
      if(parent!==null){
        const destination=node(parent);
        if(destination===target||target.contains(destination))throw Error('Cannot mount a DOM region inside itself');
        if(!mounts.has(selector)){const marker=document.createComment('mounted region');target.parentNode.insertBefore(marker,target);mounts.set(selector,marker);}
        destination.appendChild(target);
      }else{
        const marker=mounts.get(selector);
        if(marker){if(!marker.parentNode)throw Error('The original DOM region is no longer present');marker.parentNode.insertBefore(target,marker);marker.remove();mounts.delete(selector);}
      }
      return true;
    },
    'dom.bindings': () => [...bindings.values()].filter(binding=>document.querySelector(binding.selector)===binding.target).map(({target,...binding})=>({...binding,label:target.getAttribute('aria-label')||Array.from(target.labels??[]).map(label=>label.textContent).join(' ')||(target.tagName==='DETAILS'?target.querySelector?.('summary')?.textContent:null)||target.textContent||binding.selector,visible:Boolean(target.getClientRects?.().length)})),
    'dom.value': ({selector}) => node(selector).value,
    'dom.checked': ({selector}) => node(selector).checked,
    'dom.attribute': ({selector, name}) => node(selector).getAttribute(name),
    'dom.setAttribute': ({selector, name, value}) => { node(selector).setAttribute(name, String(value)); return true; },
    'dom.classToggle': ({selector, name, value}) => { node(selector).classList.toggle(name, value); return true; },
    'dom.text': ({selector, text}) => { node(selector).textContent = text; return true; },
    'dom.content': ({selector, html}) => { const target=node(selector);for(const [key,binding]of bindings)if(binding.target!==target&&target.contains?.(binding.target))bindings.delete(key);target.innerHTML = html; return true; },
    'dom.reset': ({selector}) => { node(selector).reset(); return true; },
    'http.json': async ({url, method, body}) => {
      const response = await fetch(url, {method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      return {ok: response.ok, status: response.status, data};
    },
  };
}

module.exports = {browserPorts,reportBrowserError};
