"""Explicit raster/video mechanisms for the checked broadcast render plan.
No clip selection, timeline ordering, admission or source edits live here.
"""
from pathlib import Path
import argparse, json, subprocess, math, hashlib, textwrap, shutil, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps, __version__ as pillow_version

p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--plan',required=True);a=p.parse_args()
cfg=json.loads(Path(a.config).read_text());plan=json.loads(Path(a.plan).read_text());root=Path(a.config).parent
script_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
ff=cfg['ffmpeg'];media=Path(cfg['mediaDir']);fps=plan['fps'];W,H=640,480
observations=json.loads((root/'analysis.json').read_text());obs={s['id']:s for s in observations['sources']}
for clip in {s['clip'] for s in plan['shots']}:
    with (media/f'{clip}.mp4').open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
    if h!=obs[clip]['sha256']:raise ValueError(f'Source changed: {clip}; rerun analysis and compile')
FONT=Path('C:/Windows/Fonts')
mono=Path(cfg.get('fontMono',FONT/'CascadiaMono.ttf'))
sans=Path(cfg.get('fontBold',FONT/'arialbd.ttf'))
def font(n,bold=False):return ImageFont.truetype(str(sans if bold else mono),n)
pal=plan['palette'];ink=pal['ink'];cyan=pal['cyan'];yellow=pal['yellow'];pink=pal['pink']
def txt(d,xy,s,n=10,c='white',bold=False,extrude=0):
    f=font(n,bold)
    for k in range(extrude,0,-1):d.text((xy[0]+k,xy[1]+k),s,font=f,fill='#141027')
    d.text(xy,s,font=f,fill=c)
def lines(d,xy,s,width,n=20,c=yellow,bold=True,height=100,extrude=3):
    words=s.split()
    while True:
        rows=[];row='';f=font(n,bold)
        for word in words:
            trial=(row+' '+word).strip()
            if d.textbbox((0,0),trial,font=f)[2]>width and row:rows.append(row);row=word
            else:row=trial
        if row:rows.append(row)
        if n<=6 or (len(rows)*(n+2)<=height and all(d.textbbox((0,0),row,font=f)[2]<=width for row in rows)):break
        n-=1
    for i,row in enumerate(rows):txt(d,(xy[0],xy[1]+i*(n+2)),row,n,c,bold,extrude)
    return len(rows)*(n+2)
def cube(d,cx,cy,t,size=24):
    vertices=[]
    for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        xx=x*math.cos(t)-z*math.sin(t);zz=x*math.sin(t)+z*math.cos(t)
        yy=y*math.cos(t*.7)-zz*math.sin(t*.7);zz=y*math.sin(t*.7)+zz*math.cos(t*.7)
        scale=size*3/(zz+5);vertices.append((cx+xx*scale,cy+yy*scale))
    for i,j in [(0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]:d.line([vertices[i],vertices[j]],fill=cyan,width=1)
def star(d,cx,cy,t,words):
    pts=[]
    for i in range(24):
        ang=i*math.pi/12+t*.1;r=28 if i%2==0 else 23;pts.append((cx+math.cos(ang)*r,cy+math.sin(ang)*r))
    d.polygon(pts,fill=yellow,outline='#fffbd1')
    for i,s in enumerate(words):txt(d,(cx-len(s)*2.25,cy-8+i*10),s,8,ink,True)
def background(t):
    im=Image.new('RGB',(320,240),ink);d=ImageDraw.Draw(im)
    for y in range(240):
        amount=(y/240);d.line((0,y,320,y),fill=(int(12+34*amount),int(7+9*amount),int(35+45*amount)))
    horizon=145
    for x in range(-320,641,32):d.line((160,horizon,x,240),fill='#4d327c')
    for k in range(9):
        y=horizon+((k*12+t*7)%100)**1.1*.63;d.line((0,y,320,y),fill='#4d327c')
    d.polygon([(258,12),(310,12),(298,34),(246,34)],outline=pink,width=2)
    return im
def graphics(frame,shot,local,global_time):
    scene=shot['scene'];t=local/fps;g=global_time/fps
    base=background(g).resize((W,H),Image.Resampling.NEAREST)
    if scene['background']=='source-blur':
        base=ImageEnhance.Brightness(ImageOps.fit(frame,(W,H)).filter(ImageFilter.GaussianBlur(10))).enhance(.25)
    elif scene['background']!='perspective':raise ValueError('Undeclared background mechanism')
    x,y,w,h=scene['videoBox']
    # Preserve the source aspect ratio; no generated scenery or simulated people.
    base.paste(frame.resize((w,h),Image.Resampling.BICUBIC),(x,y))
    overlay=Image.new('RGBA',(320,240),(0,0,0,0));d=ImageDraw.Draw(overlay)
    title_height=0
    color=lambda key:pal.get(key,key) if key else None
    for e in scene['elements']:
        if 'visibleUntil' in e and t>=e['visibleUntil']:continue
        kind=e['kind']
        if kind=='masthead':
            txt(d,(8,5),'CHURCH ON AIR',9,cyan,True);txt(d,(254,7),'VHF 07',8,yellow);d.line((8,20,312,20),fill=cyan,width=1)
        elif kind=='title':
            explicit=e.get('linesByText',{}).get(shot[e['field']])
            if explicit:
                title_height=0
                for row in explicit:title_height+=lines(d,(e['xy'][0],e['xy'][1]+title_height),row,e['width'],e['size'],color(e['color']),True,e['height'],e['extrude'])
            else:title_height=lines(d,e['xy'],shot[e['field']],e['width'],e['size'],color(e['color']),True,e['height'],e['extrude'])
        elif kind=='caption':
            x,y=e['xy'];y+=title_height if e.get('afterTitle') else 0
            for row in shot[e['field']].split(' / '):y+=lines(d,(x,y),row,e['width'],e['size'],color(e['color']),False,40,0)+3
        elif kind=='cube':cube(d,*e['center'],g,e['size'])
        elif kind=='star':star(d,*e['center'],g,e['lines'])
        elif kind=='rect':d.rectangle(e['box'],fill=color(e.get('fill')),outline=color(e.get('outline')),width=e.get('width',1))
        elif kind=='line':d.line(e['points'],fill=color(e['color']),width=e['width'])
        elif kind=='text':txt(d,e['xy'],e['text'],e['size'],color(e['color']),e.get('bold',False))
        elif kind=='ticker':
            d.rectangle((0,239,320,240),fill=pink)
            ticker='PERTH, WESTERN AUSTRALIA   ///   FAITH. WORSHIP. COMMUNITY.   ///   @TANKSAARON   ///   '
            if e['prefixCaption']:ticker=shot['caption'].replace(' / ','   ///   ')+'   ///   '+ticker
            offset=int(g*18)%int(d.textlength(ticker,font=font(7)));d.rectangle((0,232,320,239),fill=ink)
            for n in range(3):txt(d,(-offset+n*d.textlength(ticker,font=font(7)),231),ticker,7,cyan)
        elif kind=='meter':
            o=obs[shot['clip']];idx=min(599,int((shot['in']+t)/o['analyzedSeconds']*600));level=min(1,o['waveform'][idx]*4)
            for k in range(9):d.rectangle((278+k*4,220,280+k*4,227),fill=(yellow if k>6 else cyan) if k<level*9 else '#302849')
        else:raise ValueError('Undeclared raster primitive: '+kind)
    entrance=scene['entrance'];off=int(entrance['offsetX']*max(0,1-t/entrance['seconds'])**2) if entrance['seconds'] else 0
    fg=overlay.resize((W,H),Image.Resampling.NEAREST)
    base.paste(fg,(off*2,0),fg)
    return base
def transition(old,new,kind,p):
    if kind=='cut' or p>=1:return new
    p=1-(1-p)**3
    if kind=='push':
        out=Image.new('RGB',(W,H));dx=int(p*W);out.paste(old,(-dx,0));out.paste(new,(W-dx,0));return out
    if kind=='spin':
        size=max(2,int(W*p));tile=new.resize((size,max(2,int(H*p)))).rotate(270*(1-p),resample=Image.Resampling.BICUBIC,expand=True)
        out=old.copy();out.paste(tile,((W-tile.width)//2,(H-tile.height)//2));return out
    mask=Image.new('L',(W,H),0);d=ImageDraw.Draw(mask)
    if kind=='iris':
        r=math.hypot(W,H)*p/2;d.ellipse((W/2-r,H/2-r,W/2+r,H/2+r),fill=255)
    else:
        for y in range(0,H,32):d.rectangle((0,y,W,y+int(32*p)),fill=255)
    return Image.composite(new,old,mask)
def tape(im,shot,i):
    a=np.array(im);t=i/fps;rng=np.random.default_rng(1979+i)
    # Modest chroma delay and scanlines survive the quieter passages.
    a[:,:,0]=np.roll(a[:,:,0],1,axis=1);a[:,:,2]=np.roll(a[:,:,2],-1,axis=1)
    a[1::2]=(a[1::2].astype(np.float32)*.90).astype('uint8')
    mode=shot['tracking'];active=mode=='heavy' or (mode=='burst' and (i%150<15))
    if active:
        y=int((t*235)%H);band=min(12,H-y)
        for row in range(y,y+band):a[row]=np.roll(a[row],int(9*math.sin(row*1.7+t*14)),axis=0)
        if i%5==0:a[y:y+2]=rng.integers(70,230,(min(2,H-y),W,3),dtype=np.uint8)
        a[-5:]=rng.integers(10,160,(5,W,3),dtype=np.uint8)
    elif i%250<2:
        a[-3:]=rng.integers(15,95,(3,W,3),dtype=np.uint8)
    noise=rng.integers(-3,4,(H,W,1),dtype=np.int16)
    return Image.fromarray(np.clip(a.astype(np.int16)+noise,0,255).astype(np.uint8))

silent=root/'picture.mp4';staged=root/'render-staged.mp4';stderr=(root/'render-native.log').open('w')
prior=root/'render-receipt.json'
if prior.exists():
    old=json.loads(prior.read_text());old_file=root/old['file']
    if old_file.exists():
        history=root/'renders'/old['sha256'];history.mkdir(parents=True,exist_ok=True)
        if not (history/old_file.name).exists():shutil.copyfile(old_file,history/old_file.name)
        receipt_id=hashlib.sha256(prior.read_bytes()).hexdigest()
        shutil.copyfile(prior,history/f'receipt-{receipt_id}.json')
enc=subprocess.Popen([ff,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','640x480','-r',str(fps),'-i','pipe:0','-an','-vf',f'scale={plan["width"]}:{plan["height"]}:flags=neighbor','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(silent)],stdin=subprocess.PIPE,stderr=stderr)
global_frame=0;last=None
try:
    for shot in plan['shots']:
        print(f'PICTURE {shot["index"]+1}/{len(plan["shots"])} {shot["id"]} / {shot["layout"]} / {shot["transition"]}',flush=True)
        dec=subprocess.Popen([ff,'-v','error','-ss',str(shot['in']),'-i',str(media/f'{shot["clip"]}.mp4'),'-an','-vf','fps=25,scale=640:360','-frames:v',str(shot['frames']),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=stderr)
        previous=last
        for i in range(shot['frames']):
            raw=dec.stdout.read(640*360*3)
            if len(raw)!=640*360*3:raise RuntimeError('Decoder ended before checked frame count')
            frame=Image.frombytes('RGB',(640,360),raw);im=graphics(frame,shot,i,global_frame)
            if previous is not None and i<fps*plan['policy']['transitionSeconds']:
                im=transition(previous,im,shot['transition'],i/(fps*plan['policy']['transitionSeconds']))
            im=tape(im,shot,i)
            if global_frame>=plan['frames']-12:im=ImageEnhance.Brightness(im).enhance((plan['frames']-global_frame)/12)
            enc.stdin.write(im.tobytes());last=im;global_frame+=1
        dec.stdout.close()
        if dec.wait()!=0:raise RuntimeError('Decoder failed; inspect render-native.log')
finally:
    enc.stdin.close()
if enc.wait()!=0:raise RuntimeError('Encoder failed; inspect render-native.log')
# Adjacent source ranges form one unbroken audio group. Different sources use
# short edge fades without changing the checked timeline duration.
groups=[]
for shot in plan['shots']:
    if shot['audioContinuous']:
        groups[-1]['duration']+=shot['duration']
    else:groups.append({'clip':shot['clip'],'in':shot['in'],'duration':shot['duration']})
args=[ff,'-hide_banner','-loglevel','error','-y','-i',str(silent)];filters=[];labels=[]
for i,g in enumerate(groups):
    args+=['-ss',str(g['in']),'-t',str(g['duration']),'-i',str(media/f'{g["clip"]}.mp4')]
    # Match observed source RMS, retain original music and room audio.
    avg=float(np.mean(obs[g['clip']]['waveform']));gain=min(2.5,max(.5,.15/max(.01,avg)))
    label=f'a{i}';labels.append(f'[{label}]')
    edge=plan['policy']['audioEdgeFadeSeconds'];dur=g['duration']
    filters.append(f'[{i+1}:a]aresample=48000,atrim=duration={dur},asetpts=PTS-STARTPTS,volume={gain:.4f},highpass=f=55,lowpass=f=10500,alimiter=limit=0.9:level=false,afade=t=in:d={edge},afade=t=out:st={dur-edge}:d={edge}[{label}]')
filters.append(''.join(labels)+f'concat=n={len(groups)}:v=0:a=1[audio]')
# A 120 ms edge fade, not an overlap: this preserves exact checked shot timings.
args+=['-filter_complex',';'.join(filters),'-map','0:v','-map','[audio]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',str(plan['frames']/fps),'-movflags','+faststart',str(staged)]
print('AUDIO original sources / continuous groups / short boundary fades',flush=True)
subprocess.run(args,stderr=stderr,check=True)
with staged.open('rb') as f:render_hash=hashlib.file_digest(f,'sha256').hexdigest()
output=root/f'church-on-air-{render_hash[:16]}.mp4'
if output.exists():
    with output.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==render_hash,'Artifact identity collision'
else:staged.rename(output)
subprocess.run([ff,'-v','error','-y','-i',str(output),'-vf','fps=1/8,scale=320:240,tile=3x3','-frames:v','1',str(root/'contact-v2.jpg')],stderr=stderr,check=True)
subprocess.run([ff,'-v','error','-y','-ss','1.6','-i',str(output),'-frames:v','1',str(root/'poster-v2.jpg')],stderr=stderr,check=True)
stderr.close()
with output.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==script_hash,'Renderer source changed during execution; rerun with a stable native source'
mechanisms={str(Path(__file__).name):script_hash,'plan':hashlib.sha256(Path(a.plan).read_bytes()).hexdigest(),'analysis':hashlib.sha256((root/'analysis.json').read_bytes()).hexdigest()}
mechanisms['versions']={'python':sys.version,'numpy':np.__version__,'pillow':pillow_version,'ffmpeg':subprocess.check_output([ff,'-version'],text=True).splitlines()[0]}
for file in [Path(ff),mono,sans]:
    with file.open('rb') as f:mechanisms[file.name]=hashlib.file_digest(f,'sha256').hexdigest()
(root/'render-receipt.json').write_text(json.dumps({'protocol':'church-on-air/render-receipt/1','basis':plan['basis'],'projectHash':plan['projectHash'],'graphicsHash':plan['graphicsHash'],'frames':global_frame,'duration':global_frame/fps,'sha256':h,'file':output.name,'mechanisms':mechanisms,'audio':'Original audio; source RMS matching, edge fades only at source boundaries; no replacement music or synthetic voices.','nativeBoundary':'Pillow/NumPy raster primitives and FFmpeg encoding; same-run evidence.'},indent=2))
print(f'DONE {output} / {global_frame} frames / {global_frame/fps:.2f}s',flush=True)
