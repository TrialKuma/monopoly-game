"""Arrange unmodified render pixels for manual QA; never edit candidate reports."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[5]
BASE=Path(__file__).resolve().parent
OUT=BASE/'visual-audit'
OUT.mkdir(exist_ok=True)
FONT=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
SMALL=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)

def proof(path):
    path=Path(path)
    if not path.is_absolute():path=ROOT/path
    return {'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def sheet(name,rows,title):
    width=3*512;rowh=560;header=60
    canvas=Image.new('RGB',(width,header+len(rows)*rowh),(226,231,235))
    draw=ImageDraw.Draw(canvas);draw.text((12,8),title,fill=(20,24,32),font=FONT)
    draw.text((12,36),'Unmodified 512px renders; pending independent visual review',fill=(40,48,56),font=SMALL)
    refs=[]
    for ri,row in enumerate(rows):
        for ci,(label,path) in enumerate(row):
            item=proof(path);im=Image.open(item['path']).convert('RGBA')
            if im.size!=(512,512):raise ValueError((path,im.size))
            x=ci*512;y=header+ri*rowh
            canvas.paste(im,(x,y),im)
            draw.text((x+8,y+516),label,fill=(20,24,32),font=SMALL)
            refs.append({'label':label,**item})
    path=OUT/name;canvas.save(path,quality=96,subsampling=0)
    return {**proof(path),'sourceImages':refs}

registry=json.loads((ROOT/'art/full-ai-city/approved-assets.json').read_text('utf-8'))['assets']
progress=json.loads((BASE/'subset-progress.json').read_text('utf-8'))
jobs=[{'key':'alpine/villa_2','report':{'path':str(BASE/'alpine-villa2-overlap-review/villa_2.json')}}]+progress['jobs']
items=[];groups=[]
for job in jobs:
    key=job['key'];rpath=Path(job['report']['path']);r=json.loads(rpath.read_text('utf-8'))
    old=registry[key];views={Path(p).stem[4:]:p for p in r['renderedCandidate']['views']}
    oldiso=next(p for p in old['reviewViews'] if Path(p).stem=='lod-iso')
    row=[('Old approved / iso',oldiso),('New / iso',views['iso']),('New / front',views['front'])]
    qa=sheet(key.replace('/','-')+'-five-views.jpg',[row,[('New / right',views['right']),('New / back',views['back']),('New / left',views['left'])]],key+' | old iso + all five new sides')
    item={'key':key,'candidate':r['processedCandidate'],'report':proof(rpath),'supersedes':old['candidate']['sha256'],'fiveViewSheet':qa,
          'overlapReviewRequired':r['textureOnlyReprocessing']['atlasOverlapReviewRequired'],'diagnosticOnly':r['textureOnlyReprocessing']['diagnosticOnly']}
    motion=rpath.parent/'motion/review.json'
    if motion.exists():
        m=json.loads(motion.read_text('utf-8'))
        rows=[]
        for pose in m['poses']:
            rows.append([(f"{Path(p).stem}",p) for p in pose['views']])
        item['motionSheet']=sheet(key.replace('/','-')+'-motion.jpg',rows,key+' | three actual component poses')
    items.append(item);groups.append([(key+' | OLD ISO',oldiso),(key+' | NEW ISO',views['iso']),(key+' | NEW FRONT',views['front'])])
group_sheets=[]
for start in range(0,len(groups),4):
    group_sheets.append(sheet(f'comparison-group-{start//4+1}.jpg',groups[start:start+4],f'Limited texture repair | comparison group {start//4+1}'))
(OUT/'sheets.json').write_text(json.dumps({'status':'awaiting_manual_review','items':items,'groups':group_sheets},ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'items':len(items),'groups':[g['path'] for g in group_sheets]},ensure_ascii=False))
