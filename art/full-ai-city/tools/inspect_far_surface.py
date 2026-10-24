"""Inspect real near/far topology and render a neutral material diagnostic."""
from pathlib import Path
import json,sys
import bpy,bmesh
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

for variant in ('near','far'):
    path=lod.ART/('candidates-far' if variant=='far' else 'candidates')/'classic/hotel_2.glb'
    lod.clear_scene();obj,_=lod.p.import_body(path)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002)
    print('SURFACE',variant,json.dumps({'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'looseVertices':sum(not v.link_faces for v in bm.verts)}),flush=True)
    bm.free()
    if variant=='far':
        mat=bpy.data.materials.new('Neutral surface diagnostic');mat.diffuse_color=(.5,.5,.5,1);mat.use_nodes=True
        obj.data.materials.clear();obj.data.materials.append(mat)
        diagnostic=lod.ART/'work/far-grey.glb';diagnostic.parent.mkdir(exist_ok=True)
        lod.p.select_only([obj]);bpy.ops.export_scene.gltf(filepath=str(diagnostic),export_format='GLB',use_selection=True)
        args=SimpleNamespace(region='classic',asset='hotel_2',lod='far',height=1.,footprint=1.,render_directory=lod.ART/'work/far-diagnostic',render_prefix='grey-')
        lod.render(diagnostic,args,('front','back','iso'))
