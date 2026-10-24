"""Bounded cleanup of the inspected Kyoto villa, using its existing design input.

Keeps the generated building and source-derived LOD; regularizes only the central
ridge burrs and restores the noren's reference artwork on the actual cloth faces.
"""
from pathlib import Path
from types import SimpleNamespace
import sys,json,argparse,math,shutil
import bpy
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--input',type=Path,required=True);cli.add_argument('--out',type=Path,required=True);cli.add_argument('--facade',action='store_true')
    args=cli.parse_args(sys.argv[sys.argv.index('--')+1:]);args.input=args.input.resolve();args.out=args.out.resolve();args.out.mkdir(parents=True,exist_ok=True)
    report=json.loads(args.input.read_text('utf8'));assert report['region']=='compact' and report['asset']=='villa_2'
    prior=Path(report['processedCandidate']['path']);assert lod.p.sha256(prior)==report['processedCandidate']['sha256']
    ref=lod.ROOT/'art/themed-city-kit/inputs/compact-house-v01/view00_azim000.png'
    out=args.out/'compact/villa_2.glb';out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():raise FileExistsError(out)
    lod.clear_scene();bpy.ops.import_scene.gltf(filepath=str(prior));obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');mesh=obj.data
    original=np.array([v.co[:] for v in mesh.vertices]);count=0
    for v in mesh.vertices:
        x,y,z=v.co
        if abs(x)<.35 and -.105<y<.025 and z>.974:
            v.co.z=.974;count+=1
    mesh.update()
    ref_image=bpy.data.images.load(str(ref),check_existing=True)
    mat=bpy.data.materials.new('Kyoto noren original reference artwork');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF')
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=ref_image;tex.extension='EXTEND'
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=1.;bsdf.inputs['Metallic'].default_value=0.
    mesh.materials.append(mat);cloth=[];facade=[];uv=mesh.uv_layers.active.data
    for face in mesh.polygons:
        x,y,z=face.center
        band=None
        if args.facade and abs(x)<.365 and -.290<y<-.16 and face.normal.y<-.6:
            if .478<z<.708:band=(.478,.708,650,353)
            elif .035<z<.348 and not(x>.235 and z<.22):band=(.035,.348,1180,791)
        if band:
            face.material_index=len(mesh.materials)-1;facade.append(face.index)
            for li in face.loop_indices:
                co=mesh.vertices[mesh.loops[li].vertex_index].co
                u=(151+max(0,min(1,(co.x+.365)/.73))*960)/1254
                v=1-(band[2]+max(0,min(1,(co.z-band[0])/(band[1]-band[0])))*(band[3]-band[2]))/1254
                uv[li].uv=(u,v)
        if -.075<x<.175 and -.290<y<-.268 and .175<z<.317 and face.normal.y<-.45:
            face.material_index=len(mesh.materials)-1;cloth.append(face.index)
            for li in face.loop_indices:
                co=mesh.vertices[mesh.loops[li].vertex_index].co
                u=.435+max(0,min(1,(co.x+.075)/.25))*(.646-.435)
                v=1-(.794-max(0,min(1,(co.z-.175)/.142))*(.794-.656))
                uv[li].uv=(u,v)
    if not 15<len(cloth)<350:raise ValueError('Unexpected cloth-face selection: '+str(len(cloth)))
    after=np.array([v.co[:] for v in mesh.vertices]);dist=np.linalg.norm(after-original,axis=1)
    lod.p.select_only([obj]);bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=96,export_extras=True)
    report['priorRefinement']=lod.p.file_evidence(args.input)
    report['localStyleRefinement']={'sourceCandidate':lod.p.file_evidence(prior),'referenceArtwork':lod.p.file_evidence(ref),'ridge':{'verticesMoved':count,'maximumMovement':float(dist.max()),'regionBlender':{'x':[-.35,.35],'y':[-.105,.025],'zAbove':.974},'method':'Clamp only isolated central ridge high burrs to the existing ridge envelope; roof faces and corners retained'},'noren':{'faces':len(cloth),'method':'Project the exact existing front-reference cloth motif onto the original generated cloth faces only; no new building geometry, no new image generation'},'facadeReferenceFaces':len(facade),'trianglesAdded':0,'trianglesRemoved':0}
    snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(Path(__file__))+'-refine_kyoto_villa.py');shutil.copyfile(__file__,snapshot);report['styleRefinementTool']=lod.p.file_evidence(snapshot)
    report['quantization']=lod.quantize_mobile_attributes(out);report['processedCandidate']=lod.p.file_evidence(out);report['glbValidation']=lod.p.inspect_glb(out);report['triangles']=report['glbValidation']['triangles'];report['processingComplete']=False
    report.pop('reviewSheet',None)
    settings=SimpleNamespace(region='compact',asset='villa_2',lod='near',height=1.,footprint=1.,render_directory=args.out/'renders/compact/villa_2')
    report['renderedCandidate']=lod.render(out,settings,('front','right','back','left','iso'))
    report['textureSizes']=report['renderedCandidate']['textureSizes'];report['processingComplete']=True;report['completedAt']=lod.now()
    report['geometryOrigin']+=' Bounded recorded ridge regularization; the reference noren motif is reapplied to existing cloth faces.'
    out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    print('KYOTO_REFINED',json.dumps(report['localStyleRefinement']),flush=True)
if __name__=='__main__':main()
