"""Bounded observations, not lyric transcription or an editorial decision."""
from pathlib import Path
import argparse, json, subprocess, hashlib
import numpy as np
from PIL import Image, ImageDraw

p=argparse.ArgumentParser();p.add_argument('--config',required=True);a=p.parse_args()
cfg=json.loads(Path(a.config).read_text());out=Path(a.config).parent;media=Path(cfg['mediaDir']);ff=cfg['ffmpeg']
results=[]
for f in sorted(media.glob('*.mp4')):
    meta=json.loads(f.with_suffix('.json').read_text(encoding='utf-8-sig'))
    duration=meta['mediaDetails'][0]['video_info']['duration_millis']/1000
    scope=min(120,duration)
    raw=subprocess.check_output([ff,'-v','error','-i',str(f),'-t',str(scope),'-vn','-ac','1','-ar','11025','-f','f32le','pipe:1'])
    audio=np.frombuffer(raw,dtype='<f4');hop=256;win=1024
    frames=np.lib.stride_tricks.sliding_window_view(audio,win)[::hop]
    rms=np.sqrt(np.mean(frames**2,axis=1));spec=np.abs(np.fft.rfft(frames*np.hanning(win),axis=1))
    novelty=np.maximum(np.diff(np.log1p(spec*12),axis=0),0).mean(axis=1)
    novelty=np.maximum(novelty-np.mean(novelty),0);rate=11025/hop
    ac=np.correlate(novelty,novelty,'full')[len(novelty)-1:]
    lo=int(rate*60/170);hi=int(rate*60/65)
    lag=lo+int(np.argmax(ac[lo:hi]));bpm=60*rate/lag
    beat=60/bpm;times=np.arange(len(novelty))/rate
    phases=np.arange(0,beat,1/rate)
    scores=[float(novelty[(np.abs((times-phase+beat/2)%beat-beat/2)<0.045)].mean()) for phase in phases]
    phase=float(phases[int(np.argmax(scores))])
    peaks=[i for i in range(2,len(novelty)-2) if novelty[i]>max(novelty[i-2:i]) and novelty[i]>=max(novelty[i+1:i+3])]
    strong=sorted(peaks,key=lambda i:novelty[i],reverse=True)[:100]
    grid=[round(float(t),3) for t in np.arange(phase,scope,beat)]
    wave=[round(float(np.max(v)),4) for v in np.array_split(rms,600)]
    windows=[]
    for start in range(4,max(5,int(scope)-20),4):
        chunk=rms[int(start*rate):int((start+16)*rate)]
        windows.append({'in':start,'out':start+16,'rms':round(float(chunk.mean()),4),'contrast':round(float(chunk.std()),4)})
    sheet=Image.new('RGB',(1280,5*165),'#0d0f15');d=ImageDraw.Draw(sheet)
    thumb_times=list(range(0,min(120,int(duration)),5))[:25]
    for i,t in enumerate(thumb_times):
        jpg=out/f'thumb-{f.stem}-{t}.jpg'
        subprocess.run([ff,'-v','error','-y','-ss',str(t),'-i',str(f),'-frames:v','1','-vf','scale=256:144',str(jpg)],check=True)
        x=(i%5)*256;y=(i//5)*165;sheet.paste(Image.open(jpg),(x,y));d.text((x+6,y+146),f'{t:03d}s',fill='white')
    sheet.save(out/f'survey-{f.stem}.jpg')
    h=hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
    results.append({'id':f.stem,'sha256':h,'duration':duration,'analyzedSeconds':scope,'tweet':meta['text'],'bpmCandidate':round(bpm,2),'phaseCandidate':round(phase,3),'tempoConfidence':'heuristic; half/double tempo and phrase alignment require review','waveform':wave,'beatCandidates':grid,'strongOnsets':sorted(round(i/rate,3) for i in strong),'windows':sorted(windows,key=lambda w:w['contrast'],reverse=True)[:8]})
    print(f'{f.stem}: {scope:.1f}s observed, tempo candidate {bpm:.2f}, phase {phase:.3f}',flush=True)
(out/'analysis.json').write_text(json.dumps({'method':'mono 11025 Hz; 1024-sample Hann spectral flux / 256 hop; 65–170 BPM autocorrelation; RMS; 5-second frame survey','limits':'First 120 seconds maximum per source. Tempo candidates are not certified beats or lyric/phrase detection. Same-run observations, not independent evidence.','sources':results},indent=2),encoding='utf-8')
