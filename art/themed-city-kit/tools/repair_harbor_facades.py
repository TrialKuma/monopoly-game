"""Patch only inspected lamp-wall and lower rear-wall neural cavities."""
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
obj=bpy.data.objects['harbor_house_ai_structure'];root=bpy.data.objects['harbor_house']
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.normal_update()
original_vertices=list(bm.verts);original_faces=list(bm.faces);uv=bm.loops.layers.uv.active
tree=BVHTree.FromBMesh(bm);vertex_tree=KDTree(len(original_vertices))
for index,vertex in enumerate(original_vertices):vertex_tree.insert(vertex.co,index)
vertex_tree.balance()
image=next(n.image for n in obj.data.materials[0].node_tree.nodes
           if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('Image_0'))
pixels=list(image.pixels);width,height=image.size
def color_at(point):
    x=max(0,min(width-1,round(point.x*(width-1))))
    y=max(0,min(height-1,round(point.y*(height-1))))
    return pixels[(y*width+x)*4:(y*width+x)*4+3]
regions=[
 {'name':'front_right_lamp_wall','x':(-.078,.18),'z':(.38,.84),'side':-1,'plane':-.745},
 {'name':'front_left_lamp_wall','x':(-.96,-.72),'z':(.48,.85),'side':-1,'plane':-.745},
 {'name':'rear_lower_window_wall','x':(.03,1.055),'z':(.285,.44),'side':1,'plane':.714},
]
new_faces=[];repairs=[]
for region in regions:
    xmin,xmax=region['x'];zmin,zmax=region['z'];side=region['side'];plane=region['plane']
    adjacent=[]
    for face in original_faces:
        c=face.calc_center_median()
        if not (xmin-.15<c.x<xmax+.15 and zmin-.12<c.z<zmax+.15 and abs(c.y-plane)<.055 and face.normal.y*side>.65):continue
        uvs=[loop[uv].uv.copy() for loop in face.loops]
        color=color_at(sum(uvs,Vector((0,0)))/len(uvs))
        if min(color)<.32 or max(color)-min(color)>.2:continue
        adjacent.append((c.copy(),uvs,face.material_index,color))
    assert len(adjacent)>3,region
    target_z=(zmin+zmax)/2
    sample=min(adjacent,key=lambda a:abs(a[0].z-target_z)+abs(a[0].x-xmax))
    _,sample_uvs,slot,_=sample;middle=sum(sample_uvs,Vector((0,0)))/len(sample_uvs)
    nx=math.ceil((xmax-xmin)/.008);nz=math.ceil((zmax-zmin)/.008)
    dx=(xmax-xmin)/nx;dz=(zmax-zmin)/nz;vertices={};snapped=set();added=0
    def corner(ix,iz):
        key=(ix,iz)
        if key in vertices:return vertices[key]
        point=Vector((xmin+ix*dx,plane,zmin+iz*dz));_,index,distance=vertex_tree.find(point)
        if distance<.013:vertex=original_vertices[index];snapped.add(index)
        else:vertex=bm.verts.new(point)
        vertices[key]=vertex;return vertex
    for ix in range(nx):
        for iz in range(nz):
            x=xmin+(ix+.5)*dx;z=zmin+(iz+.5)*dz
            hit,normal,index,distance=tree.ray_cast(Vector((x,side*3,z)),Vector((0,-side,0)),6)
            if hit is not None and hit.y*side>.4:continue
            points=[corner(ix,iz),corner(ix+1,iz),corner(ix+1,iz+1),corner(ix,iz+1)]
            for indices in ((0,1,2),(0,2,3)):
                chosen=[points[i] for i in indices]
                if len(set(chosen))<3:continue
                try:face=bm.faces.new(chosen)
                except ValueError:continue
                if face.calc_area()<1e-10:bm.faces.remove(face);continue
                face.material_index=slot;face.smooth=False
                for loop,source_uv in zip(face.loops,sample_uvs[:3]):loop[uv].uv=middle+(source_uv-middle)*.2
                face.normal_update()
                if face.normal.y*side<0:face.normal_flip()
                new_faces.append(face);added+=1
    repairs.append({**region,'added_triangles':added,'source_vertices_reused':len(snapped),
                    'method':'Only through-cavity ray samples in explicit inspected regions; adjacent original stone/plaster UV sample; all existing source faces retained'})
assert 0<len(new_faces)<5000
bm.to_mesh(obj.data);bm.free();obj.data.validate(clean_customdata=False);obj.data.update()
out=ROOT/'assets/models/regions-ai/harbor_house.glb'
report_path=ROOT/'art/themed-city-kit/reports/harbor_house-processing.json'
report=json.loads(report_path.read_text('utf-8'));report['output_before_local_repair']=report['output']
report['local_topology_repair']={'scope':'Small inspected original neural cavities under the two front lanterns and the rear lower window sill; no doors or intentional window openings filled',
    'patches':repairs,'tool':p.file_evidence(Path(__file__)),
    'raw_source_unchanged':p.sha256(Path(report['source']['path']))==report['source']['sha256']}
report['geometry_origin']='Actual native Pixal3D multiview AI building with documented local facade patches using adjacent source UVs. All original building surfaces retained, no proxy or global fill.'
report['status']='exported_pending_visual_review';report.pop('visual_review',None)
root['provenance']='Actual native local Pixal3D MV house + documented local facade cavity repair'
p.select_only([root,*root.children_recursive])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/themed-city-kit/blender/harbor_house_repaired.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_animations=False,export_image_format='JPEG',export_jpeg_quality=88,export_extras=True)
report['quantization']=quantize_mobile_attributes(out)
report['output']=p.file_evidence(out);report['glb_validation']=p.inspect_glb(out)
options=SimpleNamespace(name='harbor_house',footprint=3,texture_size=2048,
    render_size=768,samples=24,skip_render=False,animation_config=None,
    render_directory='art/themed-city-kit/renders')
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
report['export_reimport_validation']=p.render_exported(out,options,3)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('HARBOR_REPAIR_CANDIDATE',json.dumps({'repairs':repairs,'output':report['output']}),flush=True)
