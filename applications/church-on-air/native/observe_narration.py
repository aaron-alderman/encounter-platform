"""Observe local WAVs and retain exact script/word/audio correspondence."""
from pathlib import Path
import json, wave, hashlib, math, re
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
source=ROOT/'source/behind-the-scenes.json';script=json.loads(source.read_text());out=ROOT/'.local/bts'
facts=[];observations=[]
for chapter in script['chapters']:
    wav=out/'voice'/f'{chapter["id"]}.wav';words_file=wav.with_suffix('.words.json')
    with wave.open(str(wav)) as w:
        channels=w.getnchannels();rate=w.getframerate();count=w.getnframes();bits=w.getsampwidth()*8
        assert channels==1 and bits==16 and rate==script['voice']['sampleRate'],'Unexpected local speech format'
        audio=np.frombuffer(w.readframes(count),dtype='<i2').astype(np.float32)/32768
    duration=count/rate;frames=math.ceil(duration*script['output']['fps'])
    raw_words=json.loads(words_file.read_text(encoding='utf-8-sig'))
    words=sorted(raw_words,key=lambda word:word['time'])
    assert words and all(0<=w['time']<duration for w in words),'Speech word timebase disagrees with the WAV'
    assert all(a['time']<=b['time'] for a,b in zip(words,words[1:])),'Nonmonotone speech word positions'
    tokens=lambda text:re.findall(r"[a-z]+(?:['-][a-z]+)*",text.lower())
    assert tokens(' '.join(w['text'] for w in words))==tokens(chapter['text']),'Timestamp-ordered speech words disagree with authored text'
    rms=[]
    for i in range(frames):
        v=audio[int(i*rate/25):int((i+1)*rate/25)]
        rms.append(round(float(np.sqrt(np.mean(v*v))) if len(v) else 0,5))
    subject='voice.'+chapter['id']
    fields={'title':chapter['title'],'scene':chapter['scene'],'focus':chapter['focus'],'filmIn':str(chapter['filmIn']),'sprite':chapter['sprite'],'text':chapter['text'],'reason':chapter['reason']}
    facts.append([subject,'isa','Narration'])
    facts.extend([subject,'N.'+k,v] for k,v in fields.items())
    observations.append({'subject':subject,'id':chapter['id'],'file':'voice/'+wav.name,'text':chapter['text'],'voice':script['voice']['name'],'sha256':hashlib.sha256(wav.read_bytes()).hexdigest(),'rate':rate,'samples':count,'seconds':duration,'frames':frames,'words':words,'eventOrderNormalized':words!=raw_words,'rms':rms})
(out/'voice-facts.rel').write_text('// Generated observation binding; authored words belong to source/behind-the-scenes.json.\n'+''.join('('+','.join(json.dumps(v,ensure_ascii=True) for v in f)+')\n' for f in facts),encoding='utf-8')
result={'protocol':'church-on-air/narration-observations/1','scriptHash':hashlib.sha256(source.read_bytes()).hexdigest(),'voice':script['voice'],'chapters':observations,'limits':'Speech event positions validated against the native 16 kHz WAV duration. Timings originate from the local speech engine; not independent transcription.'}
(out/'narration-observations.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'voice':script['voice']['name'],'seconds':sum(v['seconds'] for v in observations),'frames':sum(v['frames'] for v in observations),'chapters':[{'id':o['id'],'seconds':round(o['seconds'],2),'words':len(o['words'])} for o in observations]},indent=2))
