from pathlib import Path
import argparse,json,subprocess,hashlib,re,wave,os
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--config',required=True);a=p.parse_args()
cfg=json.loads(Path(a.config).read_text());work=ROOT/'.local/bts';receipt=json.loads((work/'render-receipt.json').read_text());plan=json.loads((work/'plan.json').read_text());file=work/receipt['file']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(file)==receipt['sha256'],'Making-of bytes disagree with receipt'
assert sha(ROOT/'native/render_bts.py')==receipt['nativeHash'],'Native making-of source changed'
assert sha(ROOT/'source/behind-the-scenes.json')==receipt['scriptHash']==plan['scriptHash'],'Narration source changed'
assert sha(ROOT/'.local'/plan['film']['file'])==receipt['filmHash'],'Underlying church film changed'
assert sha(work/'codex-spritesheet.webp')==receipt['mascotHash']==plan['mascot']['sha256'],'Bundled mascot bytes changed'
for image in plan['captureHashes']:assert sha(work/image['file'])==image['sha256'],'A captured studio source changed'
assert receipt['frames']==plan['frames'] and receipt['seconds']==plan['frames']/25,'Duration mismatch'
for beat in plan['beats']:
    assert sha(work/beat['audio']['file'])==beat['audio']['sha256'],'Local voice bytes changed'
    assert beat['text']==beat['audio']['text'],'Projected words differ from voice binding'
    assert beat['audio']['words'][-1]['time']<beat['audio']['seconds'],'Speech events exceed actual wave duration'
proc=subprocess.run([cfg['ffmpeg'],'-hide_banner','-i',str(file),'-af','volumedetect','-progress','pipe:1','-f','null',os.devnull],capture_output=True,text=True)
assert proc.returncode==0,proc.stderr
frames=[int(x) for x in re.findall(r'^frame=(\d+)$',proc.stdout,re.M)];assert frames[-1]==plan['frames'],'Decoded frames differ from plan'
assert '1920x1080' in proc.stderr and '25 fps' in proc.stderr,'Unexpected film format'
assert re.search(r'Audio: aac.*48000 Hz, stereo',proc.stderr),'Audio format mismatch'
peak=re.search(r'max_volume: ([-\d.]+) dB',proc.stderr);assert peak and float(peak[1])<0,'Missing or clipped final audio'
assert (work/'dot-making-of.vtt').read_text().startswith('WEBVTT'),'Missing narration captions'
result={'status':'passed','file':receipt['file'],'sha256':receipt['sha256'],'frames':frames[-1],'seconds':receipt['seconds'],'format':'1920x1080 / 25fps / AAC stereo 48kHz','maxDb':float(peak[1]),'voice':plan['voice'],'wordEvents':sum(len(b['audio']['words']) for b in plan['beats']),'sourceFilmUnchanged':True,'scope':'Full native decode, source/voice/script/mascot receipts and audio format/peak; actual UI captures are composited, not an uninterrupted desktop recording. Same-run evidence.'}
(work/'verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
