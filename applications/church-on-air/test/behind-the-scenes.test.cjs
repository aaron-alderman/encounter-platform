'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileBts}=require('../bootstrap/behind-the-scenes.cjs');
test('the making-of compiles measured local speech and actual Encounter beats',async()=>{
 const {plan}=await compileBts();assert.equal(plan.frames,1826);assert.equal(plan.voiceIn,240);assert.equal(plan.beats.length,7);
 assert.equal(plan.beats[0].inFrame,plan.voiceIn);assert.equal(plan.beats.at(-1).outFrame,plan.voiceOut);
 for(let i=1;i<plan.beats.length;i++)assert.equal(plan.beats[i].inFrame,plan.beats[i-1].outFrame);
 assert.equal(plan.beats[0].filmIn,9.6);assert.equal(Math.round(plan.beats.at(-1).filmIn*25)+plan.beats.at(-1).frames+plan.closingFrames,985);
 assert.equal(plan.voice.name,'Microsoft Catherine');assert.equal(plan.voice.sampleRate,16000);
 assert.ok(plan.usage.prepare.steps<20000000);assert.equal(plan.captures.checks.observedRefusal,'AIR-P008');
 for(const beat of plan.beats){assert.ok(beat.audio.words.length>0);assert.ok(beat.audio.words.every(w=>w.time>=0&&w.time<beat.audio.seconds));assert.equal(beat.text,beat.audio.text);}
});
test('changed spoken text refuses an old local voice binding',async()=>{
 const before=await compileBts();await assert.rejects(compileBts({factText:before.input.factText.replace('I helped make this.','I secretly made everything.')}),/BTS-P004/);
});
test('unknown scenes refuse before native rendering',async()=>{
 const before=await compileBts();await assert.rejects(compileBts({factText:before.input.factText.replace('"N.scene","overview"','"N.scene","hidden-execution"')}),/BTS-P006/);
});
test('making-of source windows remain on the frame grid',async()=>{
 const before=await compileBts();await assert.rejects(compileBts({factText:before.input.factText.replace('"N.filmIn","9.6"','"N.filmIn","9.61"')}),/BTS-P009/);
});
