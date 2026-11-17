"""Composites actual studio captures, retained footage, local voice and mascot art."""
from pathlib import Path
import argparse,json,subprocess,math,hashlib,wave,bisect,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageEnhance,__version__ as pillow_version

ROOT=Path(__file__).resolve().parent.parent
FONT=Path('C:/Windows/Fonts');REG=FONT/'arial.ttf';BOLD=FONT/'arialbd.ttf';MONO=FONT/'CascadiaMono.ttf'
INK='#100e19';LAV='#c2adff';MINT='#8de2cb';MUTED='#aaa3b8';WHITE='#f6f2ff'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def f(n,bold=False,mono=False):return ImageFont.truetype(str(MONO if mono else BOLD if bold else REG),n)
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def boxxy(box):return (round(box['x']),round(box['y']),round(box['width']),round(box['height']))
def wrap(draw,text,width,size,bold=False):
    rows=[];row='';font=f(size,bold)
    for word in text.split():
        trial=(row+' '+word).strip()
        if draw.textlength(trial,font=font)>width and row:rows.append(row);row=word
        else:row=trial
    if row:rows.append(row)
    return rows
def multiline(draw,xy,text,width,size,color=WHITE,bold=False,leading=1.25):
    rows=wrap(draw,text,width,size,bold)
    for i,row in enumerate(rows):draw.text((xy[0],xy[1]+i*size*leading),row,font=f(size,bold),fill=color)
    return len(rows)*size*leading

class Film:
    def __init__(self,config,plan):
        self.cfg=config;self.plan=plan;self.work=ROOT/'.local/bts';self.ff=config['ffmpeg'];self.fps=25
        self.path=ROOT/'.local'/plan['film']['file'];assert sha(self.path)==plan['film']['sha256'],'Retained film changed'
        self.sheet=Image.open(self.work/'codex-spritesheet.webp').convert('RGBA')
        assert self.sheet.size==(1536,2288) and sha(self.work/'codex-spritesheet.webp')==plan['mascot']['sha256'],'Mascot source changed'
        self.captures={k:Image.open(self.work/v['file']).convert('RGB') for k,v in plan['captures'].items()}
        for item in plan['captureHashes']:assert sha(self.work/item['file'])==item['sha256'],'A studio capture changed'
        for beat in plan['beats']:assert sha(self.work/beat['audio']['file'])==beat['audio']['sha256'],'A voice file changed'
        self.bg=Image.new('RGB',(1920,1080),INK);glow=Image.new('RGB',(480,270),INK);gd=ImageDraw.Draw(glow)
        for r in range(300,0,-3):
            c=(int(16+(300-r)*.055),int(14+(300-r)*.025),int(25+(300-r)*.10));gd.ellipse((390-r,90-r,390+r,90+r),fill=c)
        self.bg=glow.resize((1920,1080),Image.Resampling.BICUBIC)
        self.ui_box=(40,130,1460,912);self.ui_scale=1460/1440
        b=plan['captures']['overview']['video'];self.programme=(40+b['x']*self.ui_scale,130+b['y']*self.ui_scale,b['width']*self.ui_scale,b['height']*self.ui_scale)
        self.full=(240,0,1440,1080);self.scaled={k:v.resize((1460,912),Image.Resampling.LANCZOS) for k,v in self.captures.items()}
        self.before=self.still(8,path=ROOT/'.local/church-on-air-v2.mp4');self.after=self.still(8)
        self.source_excerpt='\n'.join((ROOT/'source/composition.encounter').read_text().splitlines()[22:42])
    def still(self,t,path=None):
        raw=subprocess.check_output([self.ff,'-v','error','-ss',str(t),'-i',str(path or self.path),'-frames:v','1','-vf','scale=960:720','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
        return Image.frombytes('RGB',(960,720),raw)
    def decode(self,start,frames):
        p=subprocess.Popen([self.ff,'-v','error','-ss',str(start),'-i',str(self.path),'-an','-vf','fps=25,scale=960:720','-frames:v',str(frames),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
        try:
            for _ in range(frames):
                raw=p.stdout.read(960*720*3)
                if len(raw)!=960*720*3:raise RuntimeError('Programme decoder ended before the checked frame count')
                yield Image.frombytes('RGB',(960,720),raw)
        finally:p.stdout.close()
        if p.wait()!=0:raise RuntimeError('Programme decoder failed')
    def sprite(self,state,t,level):
        row,count,step={'idle':(0,6,.22),'waving':(3,4,.14),'review':(8,6,.15),'waiting':(6,6,.15),'jumping':(4,5,.14)}[state]
        if state=='waving' and t>1.7:row,count,step=0,6,.22
        col=int(t/step)%count;tile=self.sheet.crop((col*192,row*208,(col+1)*192,(row+1)*208))
        tile=tile.resize((300,325),Image.Resampling.NEAREST);return tile,round(math.sin(t*7)*min(4,level*18))
    def paste_picture(self,base,picture,rect):
        x,y,w,h=map(round,rect);base.paste(picture.resize((max(2,w),max(2,h)),Image.Resampling.LANCZOS),(x,y))
    def studio(self,picture,beat,t):
        scene=beat['scene'];capture=scene if scene in self.scaled else 'overview'
        if capture=='breathing':capture='breathing'
        base=self.bg.copy();base.paste(self.scaled[capture],self.ui_box[:2]);d=ImageDraw.Draw(base)
        d.rounded_rectangle((38,128,1502,1044),radius=10,outline='#4c3c66',width=2)
        d.text((40,22),'CHURCH ON AIR / MAKING OF',font=f(18,mono=True),fill=MUTED)
        d.text((40,52),'Behind the picture.',font=f(43,True),fill=WHITE)
        d.text((1570,32),'DOT / FIELD NOTES 01',font=f(16,mono=True),fill=LAV)
        if scene in ('overview','breathing','checks'):
            self.paste_picture(base,picture,self.programme)
            # Keep the composited programme clock and playhead tied to its real time.
            film_t=beat['filmIn']+t;tc=self.plan['captures']['overview']['timecode'];tx=40+tc['x']*self.ui_scale;ty=130+tc['y']*self.ui_scale
            d.rectangle((tx-2,ty-2,tx+120,ty+24),fill='#121317');d.text((tx,ty),self.timecode(film_t),font=f(17,mono=True),fill=LAV)
            track=self.plan['captures']['overview']['timeline'];x=40+(track['x']+film_t/72.48*track['width'])*self.ui_scale
            d.line((x,130+697*self.ui_scale,x,130+872*self.ui_scale),fill=LAV,width=2)
        if scene=='encounter':
            # An explicitly labelled source excerpt, not an invented UI control.
            d.rounded_rectangle((180,307,1400,920),radius=15,fill='#14121e',outline='#66527f',width=2)
            d.text((210,329),'ACTUAL ENCOUNTER SOURCE / broadcast.overflow',font=f(18,mono=True),fill=MINT)
            for i,line in enumerate(self.source_excerpt.splitlines()):
                if i>=19:break
                d.text((210,375+i*26),line,font=f(21,mono=True),fill=LAV if 'edit ' in line else WHITE)
        elif scene=='checks':
            # Magnify actual captured fields and quote the independently observed refusal.
            crop=self.captures['checks'].crop((1166,120,1440,385)).resize((438,424),Image.Resampling.LANCZOS)
            base.paste(crop,(1030,276));d=ImageDraw.Draw(base)
            d.rounded_rectangle((1028,274,1470,702),radius=10,outline=LAV,width=3)
            d.rounded_rectangle((245,727,1210,842),radius=12,fill='#21172c',outline='#a586d6',width=2)
            d.text((271,748),'OBSERVED REFUSAL / AIR-P008',font=f(22,mono=True),fill=LAV)
            d.text((271,788),'36.69 seconds is outside the 25 fps frame grid.',font=f(25),fill=WHITE)
        elif scene=='outtakes':
            d.rounded_rectangle((75,210,1470,985),radius=18,fill='#15121d',outline='#5b4676',width=2)
            d.text((112,245),'FIRST PASS',font=f(23,mono=True),fill=MUTED);d.text((790,245),'DIRECTOR\'S CUT',font=f(23,mono=True),fill=MINT)
            base.paste(self.before.resize((646,485),Image.Resampling.LANCZOS),(112,302));base.paste(self.after.resize((646,485),Image.Resampling.LANCZOS),(790,302));d=ImageDraw.Draw(base)
            d.text((112,831),'Title fitting. A different pace. A little more room.',font=f(30,True),fill=WHITE)
            d.text((112,892),'PRODUCTION NOTE',font=f(16,mono=True),fill=LAV)
            d.text((112,924),'Windows held the preview open. New renders now get a new file identity.',font=f(24),fill=MUTED)
        self.narrator(base,beat,t)
        return base
    def narrator(self,base,beat,t):
        d=ImageDraw.Draw(base);x=1570
        d.text((x,153),'MEET YOUR NARRATOR',font=f(16,mono=True),fill=MINT)
        d.text((x,184),'Dot',font=f(70,True),fill=WHITE);d.line((x,276,1877,276),fill='#76618f',width=2)
        level=beat['audio']['rms'][min(len(beat['audio']['rms'])-1,int(t*25))]
        tile,bob=self.sprite(beat['sprite'],t,level);base.paste(tile,(1570,330+bob),tile);d=ImageDraw.Draw(base)
        for i in range(18):
            height=5+min(24,level*230)*(0.4+0.6*abs(math.sin(i*.9+t*5)))
            d.rounded_rectangle((1574+i*16,684-height/2,1581+i*16,684+height/2),radius=3,fill=LAV if i%3 else MINT)
        multiline(d,(x,726),beat['title'],306,28,LAV,True)
        times=[w['time'] for w in beat['audio']['words']];index=max(0,bisect.bisect_right(times,t)-1);group=index//7
        words=beat['text'].split();caption=' '.join(words[group*7:(group+1)*7])
        multiline(d,(x,850),caption,306,29,WHITE,False,1.23)
        d.text((x,1017),'LOCAL SYNTHETIC VOICE',font=f(14,mono=True),fill=MINT)
        d.text((x,1043),'USER-DIRECTED CHARACTER PERFORMANCE',font=f(11,mono=True),fill=MUTED)
    def opening(self,picture,frame):
        if frame<self.plan['coldFrames']:
            base=Image.new('RGB',(1920,1080),'black');self.paste_picture(base,picture,self.full);return base
        progress=ease((frame-self.plan['coldFrames'])/max(1,self.plan['revealFrames']-1))
        beat=self.plan['beats'][0];ui=self.studio(picture,beat,0)
        # The actual programme picture shrinks continuously into the captured monitor.
        base=Image.blend(Image.new('RGB',(1920,1080),INK),ui,progress)
        rect=tuple(a+(b-a)*progress for a,b in zip(self.full,self.programme));self.paste_picture(base,picture,rect)
        return base
    def closing(self,picture,frame):
        beat=self.plan['beats'][-1];t=frame/25;progress=ease(t/1.2)
        ui=self.studio(picture,beat,beat['frames']/25-.04)
        base=Image.blend(ui,Image.new('RGB',(1920,1080),'black'),progress)
        rect=tuple(a+(b-a)*progress for a,b in zip(self.programme,self.full));self.paste_picture(base,picture,rect)
        d=ImageDraw.Draw(base)
        if t>1.6:
            multiline(d,(32,878),'Dot\'s making-of.\nLocal voice.\nReal footage.\nOriginal church audio.',185,18,MUTED)
        remaining=(self.plan['closingFrames']-frame)/25
        if remaining<.6:base=ImageEnhance.Brightness(base).enhance(remaining/.6)
        return base
    @staticmethod
    def timecode(t):
        n=int(t*25);return ':'.join(f'{v:02d}' for v in [n//90000,(n//1500)%60,(n//25)%60,n%25])

def main():
    global REG,BOLD,MONO
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--plan',required=True);parser.add_argument('--preview',action='store_true');a=parser.parse_args()
    cfg=json.loads(Path(a.config).read_text());plan=json.loads(Path(a.plan).read_text());work=ROOT/'.local/bts';script_hash=sha(__file__)
    REG=Path(cfg.get('fontRegular',REG))
    BOLD=Path(cfg.get('fontBold',BOLD))
    MONO=Path(cfg.get('fontMono',MONO))
    film=Film(cfg,plan)
    if a.preview:
        images=[film.opening(film.still(8.8),220)]
        for b in plan['beats']:images.append(film.studio(film.still(b['filmIn']+2),b,2))
        sheet=Image.new('RGB',(1440,3*270),INK)
        for i,im in enumerate(images):
            im.save(work/f'preview-{i}.jpg',quality=91);sheet.paste(im.resize((480,270)),((i%3)*480,(i//3)*270))
        sheet.save(work/'preview-contact.jpg',quality=93);print('Preview contact sheet ready');return
    log=(work/'render.log').open('w');silent=work/'picture.mp4';ff=cfg['ffmpeg']
    enc=subprocess.Popen([ff,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','25','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(silent)],stdin=subprocess.PIPE,stderr=log)
    count=0
    def emit(image):
        nonlocal count;enc.stdin.write(image.tobytes());count+=1
    try:
        print('PICTURE / cold open and editor reveal',flush=True)
        for i,picture in enumerate(film.decode(0,plan['voiceIn'])):emit(film.opening(picture,i))
        for b in plan['beats']:
            print('PICTURE / Dot / '+b['id'],flush=True)
            for i,picture in enumerate(film.decode(b['filmIn'],b['frames'])):emit(film.studio(picture,b,i/25))
        last=plan['beats'][-1];start=last['filmIn']+last['frames']/25
        print('PICTURE / return to worship',flush=True)
        for i,picture in enumerate(film.decode(start,plan['closingFrames'])):emit(film.closing(picture,i))
    finally:enc.stdin.close()
    if enc.wait()!=0:raise RuntimeError('Making-of encoder failed; inspect render.log')
    assert count==plan['frames'],'Composited frame count differs from checked plan'
    print('AUDIO / local Dot narration and original church bed',flush=True)
    args=[ff,'-v','error','-y','-i',str(silent),'-i',str(film.path)]
    for b in plan['beats']:args+=['-i',str(work/b['audio']['file'])]
    bed_gain=10**(plan['audio']['churchBedDb']/20);filters=[];bed=[];voices=[]
    opening=plan['voiceIn']/25;cold=plan['coldFrames']/25;reveal=plan['revealFrames']/25
    filters.append(f"[1:a]atrim=duration={opening},asetpts=PTS-STARTPTS,volume='if(lt(t,{cold}),1,1-(t-{cold})/{reveal}*(1-{bed_gain}))':eval=frame[bed0]");bed.append('[bed0]')
    for i,b in enumerate(plan['beats']):
        dur=b['frames']/25;label=f'bed{i+1}';bed.append('['+label+']')
        filters.append(f"[1:a]atrim=start={b['filmIn']}:duration={dur},asetpts=PTS-STARTPTS,volume={bed_gain},afade=t=in:d=0.06,afade=t=out:st={dur-.06}:d=0.06[{label}]")
        voice=f'voice{i}';voices.append('['+voice+']');filters.append(f'[{i+2}:a]aresample=48000,apad=whole_dur={dur},atrim=duration={dur},asetpts=PTS-STARTPTS[{voice}]')
    end_dur=plan['closingFrames']/25;end_start=plan['beats'][-1]['filmIn']+plan['beats'][-1]['frames']/25
    filters.append(f"[1:a]atrim=start={end_start:.3f}:duration={end_dur},asetpts=PTS-STARTPTS,volume='min(1,{bed_gain}+t/1.2*(1-{bed_gain}))':eval=frame,afade=t=out:st={end_dur-.6}:d=0.6[bedend]");bed.append('[bedend]')
    filters.append(''.join(bed)+f'concat=n={len(bed)}:v=0:a=1[church]')
    filters.append(''.join(voices)+f'concat=n={len(voices)}:v=0:a=1,loudnorm=I=-16:TP=-1.8:LRA=9,aresample=48000,aformat=channel_layouts=stereo,adelay={round(opening*1000)}|{round(opening*1000)},apad=whole_dur={count/25}[narration]')
    filters.append('[church][narration]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=.94:level=false[mix]')
    staged=work/'staged.mp4';args+=['-filter_complex',';'.join(filters),'-map','0:v','-map','[mix]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',str(count/25),'-movflags','+faststart',str(staged)]
    subprocess.run(args,stderr=log,check=True)
    digest=sha(staged);output=work/f'dot-making-of-{digest[:16]}.mp4'
    if output.exists():assert sha(output)==digest
    else:staged.rename(output)
    assert sha(__file__)==script_hash,'Native making-of source changed during rendering'
    receipt={'protocol':'church-on-air/making-of-receipt/1','file':output.name,'sha256':digest,'frames':count,'seconds':count/25,'planHash':sha(a.plan),'scriptHash':plan['scriptHash'],'nativeHash':script_hash,'filmHash':plan['film']['sha256'],'mascotHash':plan['mascot']['sha256'],'voice':plan['voice'],'versions':{'python':sys.version,'pillow':pillow_version,'numpy':np.__version__},'limits':'Actual UI stills composited with moving programme footage and animated bundled mascot; local synthetic narration is a user-directed Dot performance.'}
    (work/('receipt-'+sha(a.plan)[:12]+'-'+script_hash[:12]+'.json')).write_text(json.dumps(receipt,indent=2));(work/'render-receipt.json').write_text(json.dumps(receipt,indent=2))
    write_captions(plan,work/'dot-making-of.vtt')
    subprocess.run([ff,'-v','error','-y','-ss','13','-i',str(output),'-frames:v','1',str(work/'poster.jpg')],stderr=log,check=True)
    subprocess.run([ff,'-v','error','-y','-i',str(output),'-vf','fps=1/8,scale=480:270,tile=3x3','-frames:v','1',str(work/'contact.jpg')],stderr=log,check=True)
    log.close();print(f'DONE {output} / {count/25:.2f}s',flush=True)

def write_captions(plan,path):
    def stamp(t):
        ms=round(t*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d}.{ms%1000:03d}'
    out=['WEBVTT','']
    for beat in plan['beats']:
        words=beat['text'].split();times=beat['audio']['words'];base=beat['inFrame']/25
        for i in range(0,len(words),7):
            start=base+times[i]['time'];end=base+(times[i+7]['time'] if i+7<len(times) else beat['frames']/25)
            out.extend([f'{stamp(start)} --> {stamp(end)}',' '.join(words[i:i+7]),''])
    path.write_text('\n'.join(out),encoding='utf-8')
if __name__=='__main__':main()
