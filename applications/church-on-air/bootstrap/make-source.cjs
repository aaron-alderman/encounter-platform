'use strict';
// One-time source-authoring utility. The emitted REL/Encounter files are source owners.
const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..');
const fields=['title','clip','in','duration','layout','transition','tracking','caption','reason'];
let contracts='// Broadcast v1: explicit closed source and projection contracts.\n';
for(const [type,prefix]of [['Shot','S'],['Cut','C']]){
 const id='broadcast.contract.'+type;
 for(const [p,v]of [['isa','Interface'],['type',type],['mode','closed']])contracts+=JSON.stringify([id,p,v]).replace(/^\[/,'(').replace(/\]$/,')')+'\n';
 for(const field of fields){const slot=id+'.'+field;for(const tuple of [[id,'slot',slot],[slot,'isa','Slot'],[slot,'predicate',prefix+'.'+field],[slot,'valueType','string'],[slot,'cardinality','one']])contracts+=JSON.stringify(tuple).replace(/^\[/,'(').replace(/\]$/,')')+'\n';}
}
const shots=[
 ['signal','CHURCH ON AIR','2118035556764684571','35','3.36','card','cut','heavy','FAITH. WORSHIP. COMMUNITY.','A short receiver lock breaks the expectation of a conventional worship montage.'],
 ['overflow','GET READY FOR THE OVERFLOW','2118035556764684571','38.36','10.04','split','push','burst','A LOCAL CHURCH. / AN OPEN INVITATION.','Continue the same audio phrase; a large typographic panel opens the graphics surface without covering faces.'],
 ['names','PERTH REVIVAL','2118033330834997550','30.36','6.32','hero','venetian','burst','YAHWEH / RAPHA / ELOHIM','A new song and a fresh colour field; two short movements instead of another equal-length block.'],
 ['room','MAKE ROOM','2118033330834997550','36.68','6.32','full','iris','soft','FOR WORSHIP. FOR COMMUNITY.','Continue the same source and audio while the graphic enclosure opens out.'],
 ['worship','THERE IS NO OTHER NAME','2112164997589774488','50.32','13.36','full','cut','soft','SUNDAY SERVICE / PERTH','A longer, nearly unadorned worship passage is the deliberate symmetry break and emotional centre.'],
 ['home','A PLACE TO CALL HOME','2106759066815225895','57.08','13','split','spin','burst','I LOVE MY CHURCH. / - AARON',"Return to invitation language using the author's own statement, over the next worship source."],
 ['glory','ALL THE GLORY','2048307680318750886','13.2','13.36','hero','push','soft','ALL THE PRAISE. / UNTO YOU JESUS.','Let the bright final source expand and settle; use its original audio at a matched level.'],
 ['invitation','COME AS YOU ARE','2048307680318750886','26.56','6.72','card','iris','burst','KINGDOMCITY / PERTH / @TanksAaron','Close over continuous final-source audio, with a generous held invitation and no fabricated service time.']
];
let facts='// Authored edit decisions. Numeric seconds are explicit strings under the retained Encounter profile.\n';
let code='# Typed broadcast projections; direct edits return to these REL facts.\nmodule broadcast\n\n';
for(const [id,...vals]of shots){
 facts+=JSON.stringify([id,'isa','Shot']).replace(/^\[/,'(').replace(/\]$/,')')+'\n';
 for(const [i,field]of fields.entries())facts+=JSON.stringify([id,'S.'+field,vals[i]]).replace(/^\[/,'(').replace(/\]$/,')')+'\n';
 code+=`view broadcast.${id} of @${id} isa Cut:\n`;
 for(const field of fields)code+=`  C.${field}: source.S.${field}\n`;
 for(const field of fields.filter(f=>!['clip','reason'].includes(f)))code+=`  edit C.${field} through source.S.${field}\n`;
 code+='  show as TimelineShot\n\n';
}
code+='representation TimelineShot:\n  given navigation as Cut\n  return Cut:\n';
for(const field of fields)code+=`    C.${field}: navigation.C.${field}\n`;
code+='  render:\n    tag: "article"\n    children:\n      - navigation.C.title\n      - navigation.C.reason\n';
for(const [file,text]of [['contracts.rel',contracts],['composition.rel',facts],['composition.encounter',code]])fs.writeFileSync(path.join(root,'source',file),text);
