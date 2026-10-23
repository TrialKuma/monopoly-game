"""Repair only two inspected missing front-surface regions of the actual AI mesh.

No building replacement, backing box, global hole filling, or window closure.
Cells are added only where a front ray fails to hit the adjacent wall plane.
Patch boundaries snap to nearby original vertices; original neighboring UVs
provide the patch's stone/plaster material. Raw Pixal output stays untouched.
"""
from pathlib import Path
from types import SimpleNamespace
import bpy,bmesh,json,sys,math,statistics
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes

obj=bpy.data.objects['classic_house_ai_structure']
root=bpy.data.objects['classic_house']
bm=bmesh.new();bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.normal_update()
original_vertices=list(bm.verts)
original_faces=list(bm.faces)
uv=bm.loops.layers.uv.active
tree=BVHTree.FromBMesh(bm)
vertex_tree=KDTree(len(bm.verts))
for vertex in bm.verts:vertex_tree.insert(vertex.co,vertex.index)
vertex_tree.balance()
image=next(node.image for node in obj.data.materials[0].node_tree.nodes
           if node.type=='TEX_IMAGE' and node.image and node.image.name.startswith('Image_0'))
pixels=list(image.pixels);width,height=image.size
def pixel_at(point):
    x=max(0,min(width-1,round(point.x*(width-1))))
    y=max(0,min(height-1,round(point.y*(height-1))))
    offset=(y*width+x)*4
    return pixels[offset:offset+3]

rois=[{'name':'front_foundation_gap','x':(.32,1.055),'z':(.035,.16)},
      {'name':'front_window_outer_corner','x':(.785,.925),'z':(.285,.455)}]
repairs=[];new_faces=[]
for roi in rois:
    xmin,xmax=roi['x'];zmin,zmax=roi['z']
    adjacent=[]
    for face in original_faces:
        center=face.calc_center_median()
        if not (xmin-.18<center.x<xmax+.18 and zmin-.18<center.z<zmax+.18
                and -.72<center.y<-.42 and face.normal.y<-.45):continue
        points=[loop[uv].uv.copy() for loop in face.loops]
        uv_center=sum(points,Vector((0,0)))/len(points)
        color=pixel_at(uv_center)
        if min(color)<.16 or max(color)-min(color)>.23:continue
        adjacent.append((center.copy(),points,face.material_index))
    if len(adjacent)<3:raise RuntimeError('No verified adjacent stone/plaster UVs for '+roi['name'])
    material_tree=KDTree(len(adjacent))
    for index,(center,points,material_index) in enumerate(adjacent):material_tree.insert(center,index)
    material_tree.balance()
    plane_y=statistics.median(center.y for center,_,_ in adjacent)-.0006
    dx=dz=.01
    nx=math.ceil((xmax-xmin)/dx);nz=math.ceil((zmax-zmin)/dz)
    dx=(xmax-xmin)/nx;dz=(zmax-zmin)/nz
    vertices={};added=0;snapped=set();missing=[]
    def corner(ix,iz):
        key=(ix,iz)
        if key in vertices:return vertices[key]
        point=Vector((xmin+ix*dx,plane_y,zmin+iz*dz))
        coordinate,index,distance=vertex_tree.find(point)
        if distance<.017:
            vertex=original_vertices[index];snapped.add(index)
        else:vertex=bm.verts.new(point)
        vertices[key]=vertex
        return vertex
    for ix in range(nx):
        for iz in range(nz):
            x=xmin+(ix+.5)*dx;z=zmin+(iz+.5)*dz
            hit,normal,index,distance=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)),6)
            if hit is not None and hit.y<-.42:continue
            center=Vector((x,plane_y,z))
            _,material_index,_=material_tree.find(center)
            sample_center,sample_uvs,slot=adjacent[material_index]
            points=[corner(ix,iz),corner(ix+1,iz),corner(ix+1,iz+1),corner(ix,iz+1)]
            if len(set(points))<3:continue
            for indices in ((0,1,2),(0,2,3)):
                chosen=[points[i] for i in indices]
                if len(set(chosen))<3:continue
                try:face=bm.faces.new(chosen)
                except ValueError:continue
                if face.calc_area()<1e-10:
                    bm.faces.remove(face);continue
                face.material_index=slot;face.smooth=False
                middle=sum(sample_uvs,Vector((0,0)))/len(sample_uvs)
                for loop,source_uv in zip(face.loops,sample_uvs[:3]):
                    loop[uv].uv=middle+(source_uv-middle)*.2
                new_faces.append(face);added+=1
            missing.append([x,z])
    repairs.append({**roi,'added_triangles':added,'source_vertices_reused':len(snapped),
        'front_plane_y':plane_y,'adjacent_material_samples':len(adjacent),
        'method':'Local missing-surface ray classification; source-rim vertex snapping; adjacent source UV islands copied without editing texture pixels'})
if not new_faces:raise RuntimeError('No missing surfaces identified')
bmesh.ops.recalc_face_normals(bm,faces=new_faces)
bm.to_mesh(obj.data);bm.free();obj.data.update()
obj.data.validate(clean_customdata=False)
out=ROOT/'assets/models/regions-ai/classic_house.glb'
report_path=ROOT/'art/themed-city-kit/reports/classic_house-processing.json'
report=json.loads(report_path.read_text('utf-8'))
report['output_before_local_repair']=report['output']
report['local_topology_repair']={'authorization':'Parent approved only the inspected bottom stone base and outer-window-corner defects; no global filling or covering box',
    'patches':repairs,'tool':p.file_evidence(Path(__file__)),'raw_source_unchanged':p.sha256(Path(report['source']['path']))==report['source']['sha256']}
report['geometry_origin']='Actual native Pixal3D multiview AI building, with local topology patches only at the inspected front stone foundation and outer window corner. No substitute building or global hole filling.'
report['status']='exported_pending_visual_review'
report.pop('visual_review',None)
root['provenance']='Actual local native Pixal3D MV building + documented local foundation/window-corner topology repairs'
p.select_only([root,*root.children_recursive])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/themed-city-kit/blender/classic_house_repaired.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_animations=False,export_image_format='JPEG',export_jpeg_quality=88,export_extras=True)
report['quantization']=quantize_mobile_attributes(out)
report['output']=p.file_evidence(out);report['glb_validation']=p.inspect_glb(out)
options=SimpleNamespace(name='classic_house',footprint=3,texture_size=2048,
    render_size=768,samples=24,skip_render=False,animation_config=None,
    render_directory='art/themed-city-kit/renders')
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
report['export_reimport_validation']=p.render_exported(out,options,3)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('LOCAL_PATCH_CANDIDATE',json.dumps({'patches':repairs,'output':report['output']}),flush=True)
