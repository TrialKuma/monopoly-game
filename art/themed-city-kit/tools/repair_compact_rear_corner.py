"""Bridge the inspected narrow neural rear-corner cavity with source-UV faces.

The raw model and all existing building surfaces are retained. No global fill,
covering box, texture repaint, door closure, or roof replacement is performed.
"""
from pathlib import Path
from types import SimpleNamespace
import bpy,bmesh,json,sys,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes
obj=bpy.data.objects['compact_house_ai_structure'];root=bpy.data.objects['compact_house']
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.normal_update()
original_vertices=list(bm.verts);original_faces=list(bm.faces);uv=bm.loops.layers.uv.active
tree=BVHTree.FromBMesh(bm);vertex_tree=KDTree(len(original_vertices))
for index,vertex in enumerate(original_vertices):vertex_tree.insert(vertex.co,index)
vertex_tree.balance()
image=next(node.image for node in obj.data.materials[0].node_tree.nodes
           if node.type=='TEX_IMAGE' and node.image and node.image.name.startswith('Image_0'))
pixels=list(image.pixels);width,height=image.size
def color_at(point):
    x=max(0,min(width-1,round(point.x*(width-1))))
    y=max(0,min(height-1,round(point.y*(height-1))))
    return pixels[(y*width+x)*4:(y*width+x)*4+3]
adjacent=[]
for face in original_faces:
    center=face.calc_center_median()
    if not (-.8<center.x<-.42 and .035<center.z<1.1 and .78<center.y<1.02 and face.normal.y>.45):continue
    uvs=[loop[uv].uv.copy() for loop in face.loops]
    middle=sum(uvs,Vector((0,0)))/len(uvs);color=color_at(middle)
    if min(color)<.025:continue
    adjacent.append((center.copy(),uvs,face.material_index,color))
assert len(adjacent)>20,'Missing source rear-wall UV samples'
xmin,xmax=-.945,-.795;zmin,zmax=.04,1.025
nx=20;nz=130;dx=(xmax-xmin)/nx;dz=(zmax-zmin)/nz
vertices={};new_faces=[];snapped=set()
def plane(x):
    return .612+(x-xmin)/(xmax-xmin)*(.856-.612)
def corner(ix,iz):
    key=(ix,iz)
    if key in vertices:return vertices[key]
    x=xmin+ix*dx;point=Vector((x,plane(x),zmin+iz*dz))
    _,index,distance=vertex_tree.find(point)
    if distance<.014:vertex=original_vertices[index];snapped.add(index)
    else:vertex=bm.verts.new(point)
    vertices[key]=vertex;return vertex
for ix in range(nx):
    for iz in range(nz):
        x=xmin+(ix+.5)*dx;z=zmin+(iz+.5)*dz;y=plane(x)
        hit,normal,index,distance=tree.ray_cast(Vector((x,3,z)),Vector((0,-1,0)),6)
        if hit is not None and hit.y>=y-.012:continue
        if z<.235:
            candidates=[s for s in adjacent if s[0].z<.235 and min(s[3])>.12 and max(s[3])-min(s[3])<.2]
            target_z=.13
        elif z<.445:
            candidates=[s for s in adjacent if .25<s[0].z<.445 and min(s[3])>.035 and max(s[3])<.5]
            target_z=.32
        else:
            candidates=[s for s in adjacent if .5<s[0].z<.85 and min(s[3])>.4 and max(s[3])-min(s[3])<.2]
            target_z=.68
        if not candidates:candidates=adjacent
        sample=min(candidates,key=lambda a:abs(a[0].z-target_z)*5+abs(a[0].x+.67))
        _,source_uvs,slot,color=sample
        points=[corner(ix,iz),corner(ix+1,iz),corner(ix+1,iz+1),corner(ix,iz+1)]
        for indices in ((0,2,1),(0,3,2)):
            chosen=[points[i] for i in indices]
            if len(set(chosen))<3:continue
            try:face=bm.faces.new(chosen)
            except ValueError:continue
            if face.calc_area()<1e-10:bm.faces.remove(face);continue
            face.material_index=slot;face.smooth=False
            middle=sum(source_uvs,Vector((0,0)))/len(source_uvs)
            for loop,source_uv in zip(face.loops,source_uvs[:3]):loop[uv].uv=middle+(source_uv-middle)*.2
            new_faces.append(face)
assert 0<len(new_faces)<5000
bm.normal_update()
for face in new_faces:
    if face.normal.y<0:face.normal_flip()
added=len(new_faces);bm.to_mesh(obj.data);bm.free();obj.data.validate(clean_customdata=False);obj.data.update()
out=ROOT/'assets/models/regions-ai/compact_house.glb'
report_path=ROOT/'art/themed-city-kit/reports/compact_house-processing.json'
report=json.loads(report_path.read_text('utf-8'));report['output_before_local_repair']=report['output']
report['local_topology_repair']={'scope':'Only the inspected narrow rear-corner cavity also present in the untouched raw model; adjacent rear plaster and wooden skirt surfaces',
    'patches':[{'name':'rear_corner_cavity','x':[xmin,xmax],'z':[zmin,zmax],
        'added_triangles':added,'source_vertices_reused':len(snapped),
        'method':'Rim-plane bridge only where original rear rays fall into cavity; adjacent original plaster / wood UV samples'}],
    'tool':p.file_evidence(Path(__file__)),
    'raw_source_unchanged':p.sha256(Path(report['source']['path']))==report['source']['sha256']}
report['geometry_origin']='Actual native Pixal3D multiview AI building with one localized rear-corner surface bridge. Original geometry and UVs retained; no proxy building or global fill.'
report['status']='exported_pending_visual_review';report.pop('visual_review',None)
root['provenance']='Actual native local Pixal3D MV house + documented local rear-corner topology repair'
p.select_only([root,*root.children_recursive])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/themed-city-kit/blender/compact_house_repaired.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_animations=False,export_image_format='JPEG',export_jpeg_quality=88,export_extras=True)
report['quantization']=quantize_mobile_attributes(out)
report['output']=p.file_evidence(out);report['glb_validation']=p.inspect_glb(out)
options=SimpleNamespace(name='compact_house',footprint=3,texture_size=2048,
    render_size=768,samples=24,skip_render=False,animation_config=None,
    render_directory='art/themed-city-kit/renders')
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
report['export_reimport_validation']=p.render_exported(out,options,3)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('COMPACT_REPAIR_CANDIDATE',json.dumps({'added_triangles':added,'output':report['output']}),flush=True)
