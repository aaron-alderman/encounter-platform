'use strict';
// Inert syntax observation only. Admission decisions are Encounter-owned.
const parser=require('./vendor/node_modules/parse5/index.js');
function observeHtml(text){
  const convert=node=>({tag:node.tagName??'',namespace:node.namespaceURI??'',attrs:(node.attrs??[]).map(a=>({name:(a.prefix?a.prefix+':':'')+a.name,value:a.value})),text:node.tagName==='script'?(node.childNodes??[]).map(n=>n.value??'').join(''):'',location:{tagEnd:node.sourceCodeLocation?.startTag?.endOffset??null,integrityStart:node.sourceCodeLocation?.attrs?.integrity?.startOffset??null,integrityEnd:node.sourceCodeLocation?.attrs?.integrity?.endOffset??null},children:(node.childNodes??[]).map(convert),...(node.content?{content:convert(node.content)}:{})});
  const root=convert(parser.parse(text,{sourceCodeLocationInfo:true}));let baseHref=null;
  function find(node){if(baseHref!==null)return;if(node.tag==='base'&&node.namespace==='http://www.w3.org/1999/xhtml'){const href=node.attrs.find(a=>a.name==='href');if(href){baseHref=href.value;return;}}for(const child of node.children)find(child);}
  find(root);root.baseHref=baseHref;return root;
}
module.exports={observeHtml};
