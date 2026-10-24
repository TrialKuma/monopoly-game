"""Inspect/repair localized defects of the real classic villa_3 neural surface.

This tool never substitutes a constructed building. Original source bytes stay
untouched. Any local interpolated patch is separately counted and documented.
Blender CPU only; coordinates below are normalized Z-up, rear wall at +Y.
"""
from pathlib import Path
from types import SimpleNamespace
import sys, json, argparse, shutil
from datetime import datetime, timezone
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree
sys.path.insert(0, str(Path(__file__).parent))
import process_lod as lod


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspect-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    state = json.loads((lod.ART/'queue/classic/villa_3.json').read_text('utf-8'))
    raw = Path(state['rawGLB']['path'])
    if lod.p.sha256(raw) != 'a966874938b9d85215b844d0ddf643791a9ca37081b904ffbe95b7d2262f640a':
        raise ValueError('This constrained repair applies only to the inspected a003 source')
    directory = lod.ART/'work/repair-villa3'
    directory.mkdir(parents=True, exist_ok=True)
    lod.clear_scene()
    obj, _ = lod.p.import_body(raw)
    original_coordinates = np.empty(len(obj.data.vertices)*3, dtype=np.float32)
    obj.data.vertices.foreach_get('co', original_coordinates)
    original_coordinates = original_coordinates.reshape(-1, 3)
    settings = SimpleNamespace(height=1., footprint=1., pitch=0, roll=0,
        yaw=180, no_auto_upright=False, max_upright=18)
    upright = lod.p.upright(obj, settings)
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    xs = np.arange(-.305, .306, .002)
    zs = np.arange(.025, .636, .002)
    depth = np.zeros((len(zs), len(xs)), dtype=np.float32)
    face_ids = np.full(depth.shape, -1, dtype=np.int32)
    normals = np.zeros((*depth.shape, 3), dtype=np.float32)
    for zi,z in enumerate(zs):
        for xi,x in enumerate(xs):
            point, normal, index, _ = tree.ray_cast(Vector((float(x), 2, float(z))), Vector((0,-1,0)))
            depth[zi,xi] = point.y if point else -2
            if point:
                face_ids[zi,xi] = index
                normals[zi,xi] = normal
    mask = depth < .02
    pending = set(map(tuple, np.argwhere(mask)))
    components = []
    while pending:
        first = pending.pop(); stack=[first]; cells=[first]
        while stack:
            zi,xi=stack.pop()
            for n in ((zi-1,xi),(zi+1,xi),(zi,xi-1),(zi,xi+1)):
                if n in pending:
                    pending.remove(n); stack.append(n); cells.append(n)
        if len(cells)<3: continue
        points=np.asarray(cells)
        lo=points.min(axis=0);hi=points.max(axis=0)
        components.append({'pixels':len(cells), 'x':[float(xs[lo[1]]),float(xs[hi[1]])],
            'z':[float(zs[lo[0]]),float(zs[hi[0]])],
            'touchesGridBoundary':bool(lo[0]==0 or lo[1]==0 or hi[0]==len(zs)-1 or hi[1]==len(xs)-1),
            'cells':cells})
    components.sort(key=lambda c:c['pixels'],reverse=True)
    np.savez_compressed(directory/'rear-grid.npz',xs=xs,zs=zs,depth=depth,face_ids=face_ids,normals=normals)
    report={'source':lod.p.file_evidence(raw),'orientation':upright,
        'gridSpacing':.002,'invalidDepthThreshold':.02,
        'components':[{k:v for k,v in c.items() if k!='cells'} for c in components]}
    (directory/'inspection.json').write_text(json.dumps(report,indent=2),'utf-8')
    print(json.dumps(report,indent=2),flush=True)
    if args.inspect_only:return
    # These are the three reviewed disconnected black wall gaps. The cornice
    # dentil gaps, windows, doors, roof and all other source faces are excluded.
    selected = [c for c in components if c['pixels'] in (497,338,315)]
    if len(selected)!=3:raise ValueError('The three diagnosed source defects changed')
    normalized = np.empty(len(obj.data.vertices)*3,dtype=np.float32)
    obj.data.vertices.foreach_get('co',normalized); normalized=normalized.reshape(-1,3)
    fit_indices = np.linspace(0,len(normalized)-1,1000,dtype=np.int64)
    affine = np.linalg.lstsq(np.column_stack((normalized[fit_indices],np.ones(len(fit_indices)))),original_coordinates[fit_indices],rcond=None)[0]
    max_inverse_error=float(np.max(np.abs(np.column_stack((normalized[fit_indices],np.ones(len(fit_indices))))@affine-original_coordinates[fit_indices])))
    if max_inverse_error>1e-6:raise ValueError('Source normalization is not recoverable as a rigid similarity')
    source_uv=obj.data.uv_layers.active.data
    bsdf=next(n for n in obj.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    color_image=bsdf.inputs['Base Color'].links[0].from_node.image
    iw,ih=color_image.size; image_pixels=np.empty(iw*ih*4,dtype=np.float32)
    color_image.pixels.foreach_get(image_pixels);image_pixels=image_pixels.reshape(ih,iw,4)
    def sample_uv(zi,xi):
        face=obj.data.polygons[int(face_ids[zi,xi])]
        points=[obj.data.vertices[index].co for index in face.vertices]
        uvs=[Vector((*source_uv[index].uv,0)) for index in face.loop_indices]
        point=Vector((float(xs[xi]),float(depth[zi,xi]),float(zs[zi])))
        return barycentric_transform(point,*points,*uvs)[:2]
    def usable_wall_color(zi,xi):
        u,v=sample_uv(zi,xi);pixel=image_pixels[min(ih-1,max(0,int(v*ih))),min(iw-1,max(0,int(u*iw))),:3]
        return float(pixel.min())>.35 and float(pixel.max()-pixel.min())<.25
    patch_vertices=[];patch_faces=[];patch_uvs=[];patch_reports=[]
    for component in selected:
        defect=set(tuple(c) for c in component['cells'])
        # The actual defect is a folded tube, not an open boundary loop. Include
        # only the attached inward fold within this reviewed component box.
        xlo,xhi=component['x'];zlo,zhi=component['z']
        defect.update((zi,xi) for zi,z in enumerate(zs) for xi,x in enumerate(xs)
            if xlo-.004<=x<=xhi+.004 and zlo-.004<=z<=zhi+.004 and depth[zi,xi]<.155)
        # A recessed fold also exposes a slightly shifted gap from the actual
        # review camera. Measure those rays as well, instead of covering a box.
        for zi,z in enumerate(zs):
            if not zlo-.020<=z<=zhi+.020:continue
            for xi,x in enumerate(xs):
                if not xlo-.004<=x<=xhi+.004:continue
                point,_,_,_=tree.ray_cast(Vector((float(x),2,float(z)+.183)),Vector((0,-1,-.1)).normalized())
                if point and point.y<.13:defect.add((zi,xi))
        # Only a 12mm collar of existing SAME rear-wall surface is sampled. No
        # opposite/front-wall vertex is eligible to provide position or color.
        collar=set(defect)
        for _ in range(6):
            collar.update((zi+dz,xi+dx) for zi,xi in list(collar) for dz,dx in ((-1,0),(1,0),(0,-1),(0,1))
                if 0<=zi+dz<len(zs) and 0<=xi+dx<len(xs))
        donors=[(zi,xi) for zi,xi in collar if depth[zi,xi]>.155 and normals[zi,xi,1]>.8 and usable_wall_color(zi,xi)]
        if len(donors)<12:raise ValueError('Insufficient measured same-wall boundary')
        kd=KDTree(len(donors))
        for index,(zi,xi) in enumerate(donors):kd.insert((float(xs[xi]),float(zs[zi]),0),index)
        kd.balance()
        # Cell patches follow the diagnosed irregular gap, rather than adding
        # a rectangular facade panel over intact architectural features.
        cells=set()
        for zi,xi in defect:
            for dz in (-1,0):
                for dx in (-1,0):cells.add((zi+dz,xi+dx))
        corners={point for zi,xi in cells for point in ((zi,xi),(zi+1,xi),(zi,xi+1),(zi+1,xi+1))}
        mapping={};start_vertices=len(patch_vertices);start_faces=len(patch_faces)
        for zi,xi in sorted(corners):
            hits=kd.find_n((float(xs[xi]),float(zs[zi]),0),4)
            weights=np.array([1/max(h[2],.0002)**2 for h in hits]);weights/=weights.sum()
            donor_cells=[donors[h[1]] for h in hits]
            measured_y=float(sum(w*depth[zj,xj] for w,(zj,xj) in zip(weights,donor_cells)))
            if depth[zi,xi]>.155:measured_y=float(depth[zi,xi])
            # Reuse the closest original wall UV; never sample dark interior
            # or front-face pixels, and never introduce a replacement texture.
            uv=sample_uv(*donor_cells[0])
            mapping[zi,xi]=len(patch_vertices)
            patch_vertices.append((float(xs[xi]),measured_y+.0002,float(zs[zi])))
            patch_uvs.append(uv)
        for zi,xi in sorted(cells):
            a,b,c,d=[mapping[p] for p in ((zi,xi),(zi,xi+1),(zi+1,xi),(zi+1,xi+1))]
            patch_faces.extend(((a,c,b),(b,c,d)))
        patch_reports.append({'originalGapGridBounds':{k:component[k] for k in ('x','z','pixels')},
            'newVertices':len(patch_vertices)-start_vertices,'newTriangles':len(patch_faces)-start_faces,
            'measuredRearWallBoundarySamples':len(donors),'originalVerticesMoved':0,'originalTrianglesDeleted':0})
    mesh=bpy.data.meshes.new('Documented localized rear-wall repair')
    mesh.from_pydata(patch_vertices,[],patch_faces);mesh.update()
    # Join by the actual active source UV layer name. A differently named layer
    # would leave zeros in the source material's UV map for every patch loop.
    uv_layer=mesh.uv_layers.new(name=obj.data.uv_layers.active.name)
    for loop in mesh.loops:uv_layer.data[loop.index].uv=patch_uvs[loop.vertex_index]
    for material in obj.data.materials:mesh.materials.append(material)
    patch=bpy.data.objects.new('classic_villa3_local_neural_wall_repair',mesh);bpy.context.collection.objects.link(patch)
    lod.p.select_only([obj,patch]);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
    obj.name='classic_villa3_neural_source_with_documented_local_repairs'
    normalized_output=directory/'repaired-normalized.glb'
    bpy.ops.export_scene.gltf(filepath=str(normalized_output),export_format='GLB',use_selection=True)
    # Restore native coordinates so the ordinary processor can apply exactly
    # the same documented orientation as the immutable inference source.
    all_coords=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',all_coords)
    restored=np.column_stack((all_coords.reshape(-1,3),np.ones(len(obj.data.vertices))))@affine
    restored[:len(original_coordinates)]=original_coordinates
    obj.data.vertices.foreach_set('co',restored.astype(np.float32).ravel());obj.data.update()
    native_output=directory/'repaired-native.glb'
    bpy.ops.export_scene.gltf(filepath=str(native_output),export_format='GLB',use_selection=True)
    report.update({'status':'local_repair_candidate_pending_visual_review','method':'Localized gap triangulation derived from measured adjacent original rear-wall boundary; UV samples copied from intact same-wall source triangles. No original vertex moved or original triangle deleted; no full-building replacement.',
        'repairs':patch_reports,'newTriangles':len(patch_faces),'newVertices':len(patch_vertices),
        'originalVerticesMoved':0,'originalTrianglesDeleted':0,'inverseSimilarityError':max_inverse_error,
        'originalTriangles':sum(len(f.vertices)-2 for f in obj.data.polygons)-len(patch_faces),
        'sourceTextureSampling':{'minimumRearDepth':.155,'minimumRearFacingNormalY':.8,'minimumSourceRGBChannel':.35,'maximumSourceRGBChannelRange':.25,'sameActiveUVLayerName':uv_layer.name,'imagePixelsModified':False},
        'normalizedOutput':lod.p.file_evidence(normalized_output),'nativeOutput':lod.p.file_evidence(native_output)})
    (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8')
    settings.region='classic';settings.asset='villa_3';settings.lod='near';settings.render_directory=directory
    settings.render_prefix='repaired-'
    report['renders']=lod.render(normalized_output,settings,('back','right','left','front','iso'))
    report['reviewImages']=[lod.p.file_evidence(Path(path)) for path in report['renders']['views']]
    tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
    snapshot.parent.mkdir(parents=True,exist_ok=True)
    if not snapshot.exists():shutil.copyfile(tool,snapshot)
    report['processingTool']=lod.p.file_evidence(snapshot)
    report['completedAt']=datetime.now(timezone.utc).isoformat()
    (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8')
    print('LOCAL_REPAIR_CANDIDATE',json.dumps({k:report[k] for k in ('newTriangles','newVertices','nativeOutput')}),flush=True)


if __name__=='__main__':main()
