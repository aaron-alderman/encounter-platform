import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createProcessCompiler}=require('../vendor/worldwright/bootstrap/ports/process-source.cjs');
// Keep app-local logical names for source maps and measured receipts.
const libraries=new Map([
  ['source/presentation/source-algebra.encounter','source-presentation/source-algebra.encounter'],
  ['source/journeys.encounter','journeys/journeys.encounter'],
  ['source/journeys.rel','journeys/journeys.rel'],
  ['source/journeys-contracts.rel','journeys/journeys-contracts.rel'],
  ['source/assurance/child-execution.encounter','assurance/child-execution.encounter'],
  ['source/assurance/library-integrity.encounter','assurance/library-integrity.encounter'],
  ['source/shared/workspace.encounter','workflows/workspace.encounter'],
  ['source/shared/workspace-ui.encounter','workflows/workspace-ui.encounter'],
  ['source/shared/party-work.encounter','workflows/party-work.encounter'],
  ['source/shared/party-work-ui.encounter','workflows/party-work-ui.encounter'],
  ['source/shared/matter-management.encounter','workflows/matter-management.encounter'],
  ['source/shared/matter-management-ui.encounter','workflows/matter-management-ui.encounter'],
  ['source/assurance/application-boundary.encounter','assurance/application-boundary.encounter'],
]);
export function sourceFile(root,file){
  return libraries.has(file)
    ? path.join(root,'../encounter-libraries',libraries.get(file))
    : path.join(root,file);
}
// Generic selected-frontend bridge. Syntax, parsing, ASTs, linking and source
// correspondence are executed by the retained process compiler, never here.
export async function compileSources({root,manifest,digest}){
 const host={read:async file=>fs.readFileSync(sourceFile(root,file),'utf8'),digest};
 const compilers=new Map(),compiled=[];
 for(const spec of manifest.processModules){
  if(!compilers.has(spec.frontend))compilers.set(spec.frontend,await createProcessCompiler(host,spec.frontend,manifest.budget));
  const compiler=compilers.get(spec.frontend),text=await host.read(spec.file),result=await compiler.compile(spec.file,text);
  compiled.push({spec,text,result,compiler});
 }
 return compiled;
}
