'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compile,propose,basis,sources}=require('../bootstrap/runtime.cjs');
const replace=(source,from,to)=>{assert.ok(source.includes(from),'fixture target exists');return source.replace(from,to);};
test('Encounter compiles to the asymmetric, frame-exact eight-shot plan',async()=>{
 const {plan,projections}=await compile();assert.equal(plan.frames,1812);assert.equal(plan.shots.length,8);
 assert.equal(plan.shots.filter(s=>!s.audioContinuous).length,5);assert.deepEqual(plan.shots.filter(s=>s.audioContinuous).map(s=>s.id),['overflow','room','invitation']);
 assert.deepEqual(plan.shots.map(s=>s.layout),['card','split','hero','full','full','split','hero','card']);
 assert.deepEqual(plan.shots[1].scene.videoBox,[236,92,392,221]);assert.ok(plan.graphicsHash);
 assert.equal(projections[0].edits.find(e=>e.field==='C.title').destination.kind,'source');
 assert.ok(plan.usage.prepare.steps<plan.usage.prepare.limit);assert.ok(plan.runtime.some(s=>s.path.endsWith('temple-seed.cjs')));
});
test('source-bound title proposal updates its forward projection and preserves unrelated source',async()=>{
 const before=sources(),result=await propose({shot:'signal',field:'title',value:'TUNE IN',expectedBasis:basis()});
 assert.equal(result.after.plan.shots[0].title,'TUNE IN');assert.equal(result.after.plan.shots[1].title,'GET READY FOR THE OVERFLOW');assert.deepEqual(sources(),before);
});
test('stale basis refuses before proposing an edit',async()=>assert.rejects(propose({shot:'signal',field:'title',value:'No',expectedBasis:'old'}),/AIR-E001/));
test('undeclared source field has no invented reverse route',async()=>assert.rejects(propose({shot:'signal',field:'reason',value:'No',expectedBasis:basis()}),/EC-E011/));
test('checked edit refuses a frame fraction rather than silently snapping',async()=>assert.rejects(propose({shot:'signal',field:'in',value:'35.01',expectedBasis:basis()}),/AIR-P008/));
test('checked edit refuses source overrun',async()=>assert.rejects(propose({shot:'signal',field:'in',value:'123',expectedBasis:basis()}),/AIR-P010/));
test('checked edit refuses undeclared transition',async()=>assert.rejects(propose({shot:'signal',field:'transition',value:'eval',expectedBasis:basis()}),/AIR-P005/));
test('negative and expression times refuse as data',async()=>{
 const source=sources().factText;
 for(const v of ['-1','1+2','Infinity','1e2'])await assert.rejects(compile({factText:replace(source,'("signal","S.in","35")',`("signal","S.in","${v}")`)}),/AIR-P007/);
});
test('closed Encounter contract refuses competing fact owner values',async()=>assert.rejects(compile({factText:sources().factText+'\n("signal","S.title","Second title")\n'}),/EC-T019/));
test('text budget refuses destructive layout overflow',async()=>assert.rejects(propose({shot:'signal',field:'title',value:'X'.repeat(49),expectedBasis:basis()}),/AIR-P011/));
