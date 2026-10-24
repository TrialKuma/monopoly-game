"""Separate complete RGBA views at transparent gaps; pad equally, never rescale."""
from pathlib import Path
import argparse,hashlib,json,os,shutil
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
ART=ROOT/'art/full-ai-city'
RIG=Path('C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/source/experimental/Pixal3D/assets/mv_images/example/transforms.json')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def evidence(path):return {'path':str(Path(path).resolve()),'sha256':sha(path),'bytes':Path(path).stat().st_size}
def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(temp,path)

def prepare(path):
    path=Path(path).resolve()
    if not path.is_relative_to(ART/'references'):raise ValueError('Reference must remain in full-ai-city/references')
    region=path.parent.name;asset=path.stem;source=evidence(path)
    with Image.open(path) as image:
        width,height=image.size
        if image.mode!='RGBA' or not 2.5<=width/height<=4:raise ValueError(f'Expected horizontal RGBA triptych, got {image.mode} {image.size}')
        alpha=image.getchannel('A');alpha_bytes=alpha.tobytes()
        column_counts=[sum(alpha_bytes[y*width+x]>=128 for y in range(height)) for x in range(width)]
        occupied=[x for x,count in enumerate(column_counts) if count>=2]
        groups=[]
        # A real transparent gap is enough; do not reject complete views merely
        # because image generation left less than a fixed percentage of whitespace.
        for minimum_gap in (max(4,round(height*.025)),4,1):
            clusters=[]
            for x in occupied:
                if not clusters or x-clusters[-1][1]>minimum_gap:clusters.append([x,x])
                else:clusters[-1][1]=x
            groups=[(lo,hi+1) for lo,hi in clusters if hi-lo>height*.1]
            if len(groups)==3:break
        if len(groups)!=3:raise ValueError(f'Need three separate complete view clusters, found {groups}')
        allowance=round(height*.04)
        boxes=[]
        for i,(lo,hi) in enumerate(groups):
            left_limit=0 if i==0 else (groups[i-1][1]+lo)//2
            right_limit=width if i==2 else (hi+groups[i+1][0])//2
            boxes.append((max(left_limit,lo-allowance),0,min(right_limit,hi+allowance),height))
        edge_pixels=sum(alpha_bytes[y*width+x]>=128 for x in (0,width-1) for y in range(height))
        edge_pixels+=sum(alpha_bytes[y*width+x]>=128 for y in (0,height-1) for x in range(width))
        if edge_pixels:raise ValueError('Original triptych has opaque subject pixels on outer canvas edge; possible clipped content')
        canvas=max(height,max(b[2]-b[0] for b in boxes))
        canvas+=2*max(12,round(canvas*.025))
        y_padding=(canvas-height)//2
        panels=[];issues=[]
        for index,name in enumerate(('front','right','back')):
            box=boxes[index];crop=image.crop(box);offset=((canvas-crop.width)//2,y_padding)
            panel=Image.new('RGBA',(canvas,canvas),(0,0,0,0));panel.paste(crop,offset);alpha=panel.getchannel('A')
            solid=alpha.point(lambda v:255 if v>=128 else 0);bbox=solid.getbbox()
            if not bbox:issues.append(name+':empty');continue
            margins=[bbox[0],bbox[1],canvas-bbox[2],canvas-bbox[3]]
            edge_solid=sum(solid.getpixel((x,y))>0 for x in (0,canvas-1) for y in range(canvas))
            if min(margins)<max(3,canvas*.015):issues.append(name+':solid_subject_touches_panel_margin')
            if edge_solid:issues.append(name+':cross_panel_subject_pixels='+str(edge_solid))
            if alpha.getextrema()[0]>0:issues.append(name+':not_transparent')
            panels.append({'view':name,'cropBox':list(box),'canvas':[canvas,canvas],'paddingOffset':list(offset),
                'solidAlphaBBox':list(bbox),'marginsPixels':margins,
                'heightFraction':(bbox[3]-bbox[1])/canvas,'pixelDataSha256':hashlib.sha256(panel.tobytes()).hexdigest(),
                'sourceCropPixelSha256':hashlib.sha256(crop.tobytes()).hexdigest()})
        spread=max(p['heightFraction'] for p in panels)-min(p['heightFraction'] for p in panels) if len(panels)==3 else 1
        if spread>.10:issues.append('inconsistent_height_spread_over_10_percent')
        diagnostics={'source':source,'size':[width,height],'panels':panels,'heightSpreadFraction':spread,'issues':issues}
        check=ART/'reports/reference-checks'/region/(asset+'-'+source['sha256'][:12]+'.json')
        atomic_json(check,diagnostics)
        if issues:raise ValueError('Reference rejected: '+','.join(issues))
        bundle=ART/'inputs'/region/asset/source['sha256'][:16]
        reference=path.with_suffix('')/'reference.json'
        immutable_reference=bundle/'reference.json'
        previous=bundle/'transforms.json'
        if previous.exists():
            data=json.loads(previous.read_text('utf-8'))
            if data['source_board']['sha256']!=source['sha256']:raise RuntimeError('Immutable input collision')
            for row in data['source_views']:
                if sha(row['path'])!=row['sha256']:raise RuntimeError('Prepared input changed')
            if not immutable_reference.exists():
                record=json.loads(reference.read_text('utf-8'))
                if record['source']['sha256']!=source['sha256']:raise RuntimeError('Cannot snapshot mismatched canonical reference')
                shutil.copy2(path,bundle/'source-triptych.png')
                record['immutableSource']=evidence(bundle/'source-triptych.png');atomic_json(immutable_reference,record)
            return {'reference':str(immutable_reference),'viewsDir':str(bundle),'inputSha256':sha(previous),'sourceSha256':source['sha256']}
        bundle.mkdir(parents=True,exist_ok=True);reference.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,bundle/'source-triptych.png')
        immutable_source=evidence(bundle/'source-triptych.png')
        shutil.copy2(path.with_suffix('.generation.json'),bundle/'source.generation.json')
        rig=json.loads(RIG.read_text('utf-8'));frames=rig['frames'][:3];records=[]
        for index,(row,frame) in enumerate(zip(panels,frames)):
            destination=bundle/frame['file_path'];crop=image.crop(tuple(row['cropBox']))
            panel=Image.new('RGBA',tuple(row['canvas']),(0,0,0,0));panel.paste(crop,tuple(row['paddingOffset']))
            temp=destination.with_suffix('.tmp.png');panel.save(temp,format='PNG');os.replace(temp,destination)
            with Image.open(destination) as verify:
                assert verify.mode=='RGBA' and verify.tobytes()==panel.tobytes(),'Pixel-separation mismatch'
            canonical=reference.parent/(row['view']+'.png');shutil.copy2(destination,canonical)
            records.append({**evidence(destination),**row,'size':row['canvas'],'subject_height_fraction':row['heightFraction']})
        meta={'camera_angle_x':rig['camera_angle_x'],'mesh_scale':rig['mesh_scale'],'frames':frames,
            'assumed_cameras':True,'camera_calibration':'assumed_standard_orbit_not_measured',
            'azimuths_degrees':[0,90,180],'horizontal_fov_degrees':20,
            'source_board':immutable_source,'canonical_source_board':source,'source_views':records,'framing_height_spread_fraction':spread,
            'image_operations':'Rectangular separation at transparent vertical gaps plus transparent padding to a shared square canvas and common vertical origin. Original cropped RGBA pixels preserved byte-for-byte. No rescaling, masking, painting, recoloring or invented geometry.',
            'reference_review':'Panel geometry/alpha checks passed; human/agent design review remains a separate record'}
        atomic_json(previous,meta)
        atomic_json(reference,{'status':'prepared_input','source':source,'immutableSource':immutable_source,'views':records,
            'transforms':evidence(previous),'sourceGenerationMetadata':evidence(bundle/'source.generation.json'),
            'assumedCameras':True,'cameraCalibration':meta['camera_calibration'],'operations':meta['image_operations']})
        shutil.copy2(reference,immutable_reference)
        return {'reference':str(immutable_reference),'viewsDir':str(bundle),'inputSha256':sha(previous),'sourceSha256':source['sha256']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('path')
    print(json.dumps(prepare(parser.parse_args().path),ensure_ascii=False,indent=2))
