"""Isolated source-preserving LOD trial. Reuses neural geometry and source UV/color.

No neural inference or image generation. The immutable raw is kept separate.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,math
import bpy,bmesh
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--state',type=Path,required=True)
    cli.add_argument('--out',type=Path,required=True)
    cli.add_argument('--triangles',type=int,default=30000)
    cli.add_argument('--texture',type=int,default=2048)
    cli.add_argument('--smooth',type=int,default=0)
    args=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
    state=json.loads(args.state.read_text('utf8'));args.out.mkdir(parents=True,exist_ok=True)
    out=args.out/state['region']/(state['asset']+'.glb');out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():raise FileExistsError(out)
    raw=Path(state['rawGLB']['path'])
    assert lod.p.sha256(raw)==state['rawGLB']['sha256']
    settings=SimpleNamespace(region=state['region'],asset=state['asset'],lod='near',height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,render_directory=args.out/'renders'/state['region']/state['asset'])
    lod.clear_scene();obj,_=lod.p.import_body(raw);lod.p.upright(obj,settings)
    original=lod.p.triangles(obj)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    if args.smooth:
        mod=obj.modifiers.new('Bounded small-surface regularization','SMOOTH');mod.factor=.35;mod.iterations=args.smooth
        bpy.ops.object.modifier_apply(modifier=mod.name)
    pre=lod.p.triangles(obj)
    mod=obj.modifiers.new('One source-preserving reduction','DECIMATE');mod.ratio=args.triangles/pre;mod.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    actual=lod.p.triangles(obj);print('SOURCE_PRESERVED_LOD',original,pre,actual,flush=True)
    # Original neural UVs and PBR are retained. No voxelization, new atlas or cage bake.
    textures=[]
    for image in bpy.data.images:
        if image.type!='IMAGE' or not image.size[0]:continue
        before=list(image.size)
        if max(before)>args.texture:image.scale(args.texture,args.texture)
        image.pack();textures.append({'name':image.name,'before':before,'after':list(image.size)})
    lod.p.select_only([obj]);bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
    obj.name=state['region']+'__'+state['asset']+'__refined_source'
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=96,export_extras=True)
    quant=lod.quantize_mobile_attributes(out)
    report={'status':'isolated_visual_trial','region':state['region'],'asset':state['asset'],'source':state['rawGLB'],'output':lod.p.file_evidence(out),'originalTriangles':original,'triangles':actual,'textures':textures,'smoothIterations':args.smooth,'voxelRemesh':False,'rebake':False,'sourceUVRetained':True,'quantization':quant}
    out.with_suffix('.json').write_text(json.dumps(report,indent=2),'utf8')
    report['renders']=lod.render(out,settings,('front','iso','right','back','left'))
    out.with_suffix('.json').write_text(json.dumps(report,indent=2),'utf8')
if __name__=='__main__':main()
