"""Refresh one approved legacy bake using its unchanged UVs and neural source.

CPU Blender entry point. No inference, remesh, simplification, UV generation or
GLTF re-export. Only the existing base/ORM image payloads are replaced and the
old baked normalTexture binding is removed. Unsupported atlases fail closed.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse,copy,hashlib,json,shutil,sys
import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from neural_component import GLB
from pack_runtime import local,matrix


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def evidence(path):return {'path':str(Path(path).resolve()),'sha256':sha(path),'bytes':Path(path).stat().st_size}
def verify(row):
    path=local(row['path'])
    if sha(path)!=row['sha256']:raise ValueError('Changed evidence: '+str(path))
    return path
def view_bytes(glb,index):
    row=glb.doc['bufferViews'][index];start=row.get('byteOffset',0)
    return bytes(glb.blob[start:start+row['byteLength']])


def atlas_contract(glb):
    doc=glb.doc
    if doc.get('skins') or len(doc.get('buffers',[]))!=1:raise ValueError('Only a rigid one-buffer building is supported')
    if len(doc.get('materials',[]))!=1:raise ValueError('Expected one shared material atlas; multi-material mechanical repairs need separate treatment')
    material=doc['materials'][0];pbr=material.get('pbrMetallicRoughness',{})
    if material.get('alphaMode','OPAQUE')!='OPAQUE':raise ValueError('Transparent source material needs separate treatment')
    if 'normalTexture' not in material:raise ValueError('This tool only replaces the diagnosed legacy normal-map bake')
    roles={}
    for role,key in (('base','baseColorTexture'),('orm','metallicRoughnessTexture')):
        ref=pbr.get(key)
        if not ref or ref.get('texCoord',0)!=0 or ref.get('extensions'):raise ValueError('One existing TEXCOORD_0 atlas with no texture transform is required')
        texture=doc['textures'][ref['index']]
        if texture.get('extensions') or 'source' not in texture:raise ValueError('Compressed/alternate texture sources are unsupported')
        image_index=texture['source'];image=doc['images'][image_index]
        if 'bufferView' not in image or 'uri' in image:raise ValueError('Embedded source images required')
        roles[role]={'image':image_index,'view':image['bufferView'],'texture':ref['index']}
    if roles['base']['image']==roles['orm']['image'] or roles['base']['view']==roles['orm']['view']:
        raise ValueError('Base color and ORM must use separate image payloads')
    image_views={row['view'] for row in roles.values()}
    if any(a.get('bufferView') in image_views or a.get('sparse') for a in doc.get('accessors',[])):
        raise ValueError('An image buffer must not overlap geometry or sparse accessors')
    if any(v.get('extensions') for v in doc['bufferViews']):raise ValueError('Compressed buffer views unsupported')
    for mesh in doc.get('meshes',[]):
        for part in mesh['primitives']:
            if part.get('material')!=0 or part.get('mode',4)!=4 or part.get('targets') or 'indices' not in part:
                raise ValueError('Only indexed rigid triangles using material zero are supported')
            if 'TEXCOORD_0' not in part['attributes'] or doc['accessors'][part['attributes']['POSITION']]['componentType']!=5126:
                raise ValueError('Existing UV0 and float32 positions are required')
    return roles


def decoded(glb,index):
    row=glb.doc['accessors'][index];values=glb.array(index).astype(np.float64)
    if row.get('normalized'):
        divisor={5120:127,5121:255,5122:32767,5123:65535}.get(row['componentType'])
        if divisor is None:raise ValueError('Unsupported normalized accessor')
        values=np.maximum(-1,values/divisor)
    return values


def rest_surface(glb):
    """Merge only the sampling surface; output GLB nodes remain untouched."""
    atlas_contract(glb);vertices=[];faces=[];uvs=[];visited=set();offset=0;instances=[]
    def visit(index,parent):
        nonlocal offset
        if index in visited:raise ValueError('Repeated/cyclic scene nodes are unsupported')
        visited.add(index);node=glb.doc['nodes'][index]
        world=parent@np.array(matrix(node),np.float64).reshape((4,4),order='F')
        if 'skin' in node:raise ValueError('Skinned nodes are unsupported')
        if 'mesh' in node:
            for part in glb.doc['meshes'][node['mesh']]['primitives']:
                pos=decoded(glb,part['attributes']['POSITION']);uv=decoded(glb,part['attributes']['TEXCOORD_0'])
                indices=glb.array(part['indices']).astype(np.int64).reshape(-1,3)
                if not np.isfinite(pos).all() or not np.isfinite(uv).all() or uv.min()<-1e-6 or uv.max()>1+1e-6:
                    raise ValueError('Finite positions and in-atlas UVs required')
                transformed=(np.column_stack([pos,np.ones(len(pos))])@world.T)[:,:3]
                # Actual GLTF rest world coordinates -> Blender coordinates.
                transformed=transformed[:,[0,2,1]];transformed[:,1]*=-1
                # glTF image coordinates have V=0 at the top; Blender's image
                # pixels and UV rasterizer use V=0 at the bottom. This is only
                # a sampling conversion, never a rewrite of the GLB UV bytes.
                blender_uv=uv[indices].copy();blender_uv[:,:,1]=1-blender_uv[:,:,1]
                vertices.append(transformed);faces.append(indices+offset);uvs.append(blender_uv)
                offset+=len(pos)
                instances.append({'node':index,'name':node.get('name'),'triangles':len(indices),'restWorldMatrix':world.tolist()})
        for child in node.get('children',[]):visit(child,world)
    for index in glb.doc['scenes'][glb.doc.get('scene',0)]['nodes']:visit(index,np.eye(4))
    if not vertices:raise ValueError('No active mesh instances')
    return np.concatenate(vertices).astype(np.float32),np.concatenate(faces),np.concatenate(uvs).astype(np.float32),instances


def replace_images(source,output,images):
    """Preserve all accessor bytes and JSON identities; replace two images only."""
    glb=GLB(source);roles=atlas_contract(glb)
    replacements={roles[role]['view']:Path(path).read_bytes() for role,path in images.items()}
    blob=bytearray()
    for index,row in enumerate(glb.doc['bufferViews']):
        data=replacements.get(index,view_bytes(glb,index))
        while len(blob)%4:blob.append(0)
        row['byteOffset']=len(blob);row['byteLength']=len(data);blob.extend(data)
    glb.blob=blob
    for role,path in images.items():
        mime='image/jpeg' if Path(path).suffix.lower() in ('.jpg','.jpeg') else 'image/png'
        if role=='orm' and mime!='image/png':raise ValueError('ORM must retain lossless PNG encoding')
        glb.doc['images'][roles[role]['image']]['mimeType']=mime
    glb.doc['materials'][0].pop('normalTexture')
    glb.save(output)
    return verify_preservation(source,output)


def verify_preservation(source,output):
    before,after=GLB(source),GLB(output);roles=atlas_contract(before)
    patched={row['view'] for row in roles.values()};expected=copy.deepcopy(before.doc)
    expected['materials'][0].pop('normalTexture')
    for role,row in roles.items():
        mime=after.doc['images'][row['image']]['mimeType']
        if mime not in (('image/png','image/jpeg') if role=='base' else ('image/png',)):
            raise ValueError('Unreviewed image encoding')
        expected['images'][row['image']]['mimeType']=mime
    # Offsets change only because image payload lengths change. All accessor
    # definitions and every unmodified buffer payload must remain byte-identical.
    expected['buffers']=after.doc['buffers'];expected['bufferViews']=copy.deepcopy(after.doc['bufferViews'])
    if expected!=after.doc:raise ValueError('Texture-only update changed geometry, UV, node, animation, material reference or other metadata')
    if len(before.doc['bufferViews'])!=len(after.doc['bufferViews']):raise ValueError('Buffer view identities changed')
    preserved=[]
    for index,(a,b) in enumerate(zip(before.doc['bufferViews'],after.doc['bufferViews'])):
        aa={k:v for k,v in a.items() if k not in ('byteOffset','byteLength')}
        bb={k:v for k,v in b.items() if k not in ('byteOffset','byteLength')}
        if aa!=bb:raise ValueError('Buffer layout changed beyond payload offsets')
        if index not in patched:
            value=view_bytes(before,index)
            if value!=view_bytes(after,index):raise ValueError('Geometry/UV/animation or unrelated image bytes changed')
            preserved.append({'bufferView':index,'bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()})
    return {'allGeometryUVNormalAndAnimationBytesUnchanged':True,'nodeHierarchyAndRestTransformsUnchanged':True,
            'materialAndTextureIndicesUnchanged':True,'meshPrimitiveReferencesUnchanged':True,
            'onlyMaterialChange':'Removed legacy baked normalTexture binding',
            'preservedBufferViews':preserved,'replacedImageViews':sorted(patched),
            'originalNormalImageRetainedUnreferenced':True}


def snapshot(path,directory):
    target=directory/(sha(path)+'-'+path.name)
    if not target.exists():shutil.copy2(path,target)
    return evidence(target)


def main():
    import bpy
    import process_lod as lod
    from bake_nearest_surface import bake
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--report',required=True,type=Path)
    cli.add_argument('--output-root',required=True,type=Path)
    cli.add_argument('--diagnostic-overlap',action='store_true',help='Render an unpromotable diagnostic when the existing atlas overlaps different surfaces')
    args=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
    original=json.loads(args.report.read_text('utf8'));key=original['region']+'/'+original['asset']
    registry=json.loads((lod.ART/'approved-assets.json').read_text('utf8'))['assets'];entry=registry.get(key)
    if not entry or entry['processingReport']['sha256']!=sha(args.report):raise ValueError('Use the exact currently approved processing report')
    candidate=verify(entry['candidate']);verify(entry['processingReport']);raw=verify(original['source']['rawGLB'])
    if original['processedCandidate']['sha256']!=entry['candidate']['sha256']:raise ValueError('Report and approval candidate differ')
    if original.get('lod','near')!='near' or 'Selected-to-active' not in original.get('bake',{}).get('method',''):
        raise ValueError('Restricted to approved legacy near cage-bake reports')
    if original.get('nativeSurfaceExport') or original.get('postNativeUVCorrection') or original.get('componentLocalRepair'):
        raise ValueError('Field exports and post-export authored/UV repairs need their own texture transfer review')
    source=raw
    repair=original.get('localSurfaceRepair')
    if repair:
        source=verify(repair['source']);proof=json.loads(verify(repair['receipt']).read_text('utf8'))
        if proof['source']['sha256']!=sha(raw) or proof['nativeOutput']['sha256']!=sha(source):raise ValueError('Repair is not linked to the original neural source')
    source_proof=evidence(source)
    glb=GLB(candidate);vertices,faces,uvs,instances=rest_surface(glb)
    if len(faces)!=original['triangles']:raise ValueError('Rest scene triangle count differs from approval')
    root=args.output_root.resolve()
    if not root.is_relative_to(lod.ART) or root.exists():raise ValueError('Use a fresh isolated directory under art/full-ai-city')
    root.mkdir(parents=True);tools=root/'tools';tools.mkdir()
    settings=SimpleNamespace(region=original['region'],asset=original['asset'],name=key.replace('/','__'),lod='near',
        height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,texture_size=2048,
        render_directory=root/'renders')
    lod.clear_scene();body,_=lod.p.import_body(source)
    if len(body.data.materials)!=1 or any(p.material_index!=0 for p in body.data.polygons):raise ValueError('Source must have one original shared PBR material')
    normalization=lod.p.upright(body,settings)
    if original.get('sourceArtifactCleanup'):
        cleanup=lod.remove_dark_ground(body)
        if cleanup.get('deletedTriangles')!=original['sourceArtifactCleanup'].get('deletedTriangles'):raise ValueError('Original source cleanup is not reproducible')
    mesh=bpy.data.meshes.new(settings.name+'__rest_sampling_only');mesh.from_pydata(vertices.tolist(),[],faces.tolist());mesh.update()
    uv=mesh.uv_layers.new(name='UnchangedApprovedUV');uv.data.foreach_set('uv',uvs.reshape(-1))
    low=bpy.data.objects.new(settings.name+'__rest_sampling_only',mesh);bpy.context.collection.objects.link(low)
    print('TEXTURE_REFRESH_BEGIN',key,len(faces),'existing UV, 2048 base / 1024 ORM',flush=True)
    transfer,images=bake(body,low,settings)
    lod.write(root/'transfer-audit.json',transfer)
    overlap_review=transfer['atlasOverlapPixelsWithDifferentSurface']>max(16,transfer['coveredAtlasPixels']*.005)
    if overlap_review and not args.diagnostic_overlap:raise ValueError('Existing atlas overlaps different rest-pose surfaces; separate treatment required')
    if transfer['sourceDistanceQuantiles'][1]>.01 or transfer['distanceReviewRequired'] or transfer['closestSourceVertexFallbackFraction']>.001 or any(not np.isfinite(v) or v>=.001 for v in transfer['barycentricPointReconstructionErrorQuantiles']):
        lod.write(root/'correspondence-rejected.json',transfer)
        raise ValueError('Source correspondence exceeds existing transfer guard; no candidate exported')
    image_paths={}
    for role,image in images.items():
        path=root/(role+('.jpg' if role=='base' else '.png'));image.filepath_raw=str(path)
        image.file_format='JPEG' if role=='base' else 'PNG';image.save(quality=96);image_paths[role]=path
    output=root/(original['asset']+'.glb');preservation=replace_images(candidate,output,image_paths)
    report=copy.deepcopy(original)
    for key_to_remove in ('reviewSheet','promotedFrom','quantization','componentVisualReview'):
        report.pop(key_to_remove,None)
    report.update(status='exported_pending_visual_review',processingComplete=False,createdAt=lod.now(),
        processingTool=snapshot(Path(__file__),tools),textureTransferTool=snapshot(HERE/'bake_nearest_surface.py',tools),
        processedCandidate=evidence(output),bake=transfer,glbValidation=lod.p.inspect_glb(output),rawSourceUnchanged=sha(raw)==original['source']['rawGLB']['sha256'])
    report['textureOnlyReprocessing']={'sourceCandidate':entry['candidate'],'sourceProcessingReport':entry['processingReport'],
        'positionsUnchanged':True,'faceIndicesUnchanged':True,'cornerNormalsUnchanged':True,'UVBytesUnchanged':True,
        'additionalRemeshOrSimplification':False,'sourceTexture':source_proof,'normalization':normalization,
        'samplingRestInstances':instances,'preservation':preservation,'maps':{k:evidence(v) for k,v in image_paths.items()}}
    report['textureOnlyReprocessing']['atlasOverlapReviewRequired']=overlap_review
    report['textureOnlyReprocessing']['diagnosticOnly']=bool(args.diagnostic_overlap)
    report['textureOrigin']='Original source PBR sampled at the existing approved UVs through closest source triangle; 2K base and 1K ORM, geometric normals retained. No new images generated by AI.'
    report['geometryAndMotionInheritedFrom']=entry['processingReport']
    report.setdefault('limitations',[]).append('Texture-only repair preserves all original geometry and does not straighten source reconstruction defects.')
    # Use immutable inspected source pixels instead of mutable worker filenames.
    source_dir=root/'source-review';source_dir.mkdir();source_views=[]
    for row in entry['sourceComparisonImages']:
        path=verify(row);target=source_dir/path.name;shutil.copy2(path,target);source_views.append(str(target))
    report['renderedSource']['views']=source_views
    report_path=output.with_suffix('.json');lod.write(report_path,report)
    report['renderedCandidate']=lod.render(output,settings,('front','right','back','left','iso'))
    report['textureSizes']=report['renderedCandidate']['textureSizes']
    if report.get('animation'):
        import render_component
        prior_argv=sys.argv[:]
        try:
            sys.argv=['render_component','--','--source',str(output),'--region',original['region'],'--asset',original['asset'],'--output-directory',str(root/'motion')]
            render_component.main()
        finally:sys.argv=prior_argv
        motion_path=root/'motion/review.json';motion=json.loads(motion_path.read_text('utf8'))
        report['animation']['poseReview']=evidence(motion_path)
        report['animation']['frames']=[path for pose in motion['poses'] for path in pose['views']]
    report.update(processingComplete=not args.diagnostic_overlap,completedAt=lod.now())
    if args.diagnostic_overlap:report['status']='diagnostic_only_existing_atlas_overlap_needs_visual_review'
    lod.write(report_path,report)
    if sha(candidate)!=entry['candidate']['sha256'] or sha(raw)!=original['source']['rawGLB']['sha256'] or sha(source)!=source_proof['sha256']:raise ValueError('Immutable source changed during transfer')
    print('TEXTURE_REFRESH_READY',json.dumps({'candidate':evidence(output),'report':evidence(report_path)}),flush=True)


if __name__=='__main__':main()
