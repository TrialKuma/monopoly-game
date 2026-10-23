"""Copy three supplied square RGBA views verbatim and write assumed cameras.

This tool does not crop, resize, remove backgrounds or modify image pixels.
The original ImageGen board and every supplied single-view file remain intact.
"""
from pathlib import Path
import argparse,hashlib,json,shutil,math
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
RIG=Path('C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/source/experimental/Pixal3D/assets/mv_images/example/transforms.json')
def evidence(path):
    return {'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['front','right','back','board','output-dir']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();out=args.output_dir.resolve()
    if not out.is_relative_to(ROOT):raise ValueError('Output must remain inside this project')
    if (out/'transforms.json').exists():raise FileExistsError('Preserving existing view bundle')
    rig=json.loads(RIG.read_text('utf-8'));frames=rig['frames'][:3];records=[]
    for index,key in enumerate(['front','right','back']):
        path=getattr(args,key).resolve()
        with Image.open(path) as image:
            if image.mode!='RGBA' or image.width!=image.height:raise ValueError(f'{key}: requires unmodified square RGBA input')
            alpha=image.getchannel('A');box=alpha.getbbox();extrema=alpha.getextrema()
            if not box or extrema[0]==255 or extrema[1]<204:raise ValueError(f'{key}: missing transparent background / solid subject')
            solid_box=alpha.point(lambda value:255 if value>=204 else 0).getbbox()
            records.append({**evidence(path),'view':key,'size':list(image.size),'alpha_bbox':list(box),
                            'solid_alpha_bbox':list(solid_box),
                            'subject_height_fraction':(solid_box[3]-solid_box[1])/image.height,'alpha_extrema':list(extrema)})
        if index and records[index]['size']!=records[0]['size']:raise ValueError('All views must have equal canvas dimensions')
    out.mkdir(parents=True,exist_ok=True)
    for record,frame in zip(records,frames):
        shutil.copy2(record['path'],out/frame['file_path'])
        assert hashlib.sha256((out/frame['file_path']).read_bytes()).hexdigest()==record['sha256']
    heights=[record['subject_height_fraction'] for record in records]
    meta={'camera_angle_x':rig['camera_angle_x'],'mesh_scale':rig['mesh_scale'],'frames':frames,
          'camera_calibration':'assumed_standard_orbit_not_measured','assumed_cameras':True,
          'azimuths_degrees':[0,90,180],'elevation_degrees':0,'horizontal_fov_degrees':20,
          'source_board':evidence(args.board.resolve()),'source_views':records,
          'image_operations':'Byte-identical copies only; single views prepared separately with ImageGen. No Python cropping, masking, scaling or color edits.',
          'framing_height_spread_fraction':max(heights)-min(heights),
          'limitations':'Design references are not calibrated photographs. Camera poses follow the official assumed orbit; output must be visually reviewed.'}
    (out/'transforms.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'manifest':str(out/'transforms.json'),'views':records,'height_spread_fraction':max(heights)-min(heights)},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
