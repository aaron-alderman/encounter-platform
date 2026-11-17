from pathlib import Path
import argparse, json, subprocess, hashlib, re, os
p=argparse.ArgumentParser();p.add_argument('--config',required=True);a=p.parse_args()
cfg=json.loads(Path(a.config).read_text());root=Path(a.config).parent;receipt=json.loads((root/'render-receipt.json').read_text());file=root/receipt['file']
plan=json.loads((root/'plan.json').read_text())
assert receipt['basis']==plan['basis'] and receipt['projectHash']==plan['projectHash'] and receipt.get('graphicsHash')==plan['graphicsHash'],'Rendered source is stale; recompile and render'
assert receipt['mechanisms']['render.py']==hashlib.sha256(Path(__file__).with_name('render.py').read_bytes()).hexdigest(),'Rendered native mechanism is stale; render again'
with file.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==receipt['sha256'],'Rendered bytes do not match receipt'
proc=subprocess.run([cfg['ffmpeg'],'-hide_banner','-i',str(file),'-af','volumedetect','-progress','pipe:1','-f','null',os.devnull],capture_output=True,text=True)
assert proc.returncode==0,proc.stderr
frames=[int(x) for x in re.findall(r'^frame=(\d+)$',proc.stdout,re.M)]
assert frames and frames[-1]==receipt['frames'],f'Frame mismatch: {frames[-1:]}'
assert '960x720' in proc.stderr and '25 fps' in proc.stderr,'Unexpected format'
assert re.search(r'Audio: aac.*48000 Hz, stereo',proc.stderr),'Missing expected church audio stream'
peak=re.search(r'max_volume: ([-\d.]+) dB',proc.stderr)
assert peak and float(peak[1])<0,'Clipping or missing audio'
result={'status':'passed','sha256':receipt['sha256'],'frames':frames[-1],'seconds':receipt['duration'],'format':'960x720 / 4:3 / 25fps; AAC stereo 48kHz','maxDb':float(peak[1]),'scope':'Full native decode and byte/frame/audio format checks; contact-sheet visual review is separate. No perceptual lip-sync or lyric alignment certification.'}
(root/'verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
