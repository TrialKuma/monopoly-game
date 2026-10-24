"""Isolate two inspected guild roof UV slivers without moving any surface.

CPU-only repair of the recorded 2026-10-24 candidate. Existing atlas pixels,
material references and animation remain; two triangles receive safe atlas space
sampled from the exact original neural surface. Never writes approved assets.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse,copy,json,sys
import bpy,numpy as np
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import process_lod as lod
from neural_component import GLB,DTYPES,WIDTH
from refresh_baked_textures import verify,evidence,sha,snapshot,rest_surface,view_bytes
from bake_nearest_surface import bake

FACES=np.array([7749,22722],np.int64)
SOURCE_SHA='dc23dc81a414f3acc8c583a4828b3e19030157683f97812104ed66e69c2f89d1'

def main():
    base=lod.ART/'experiments/fidelity-20261024/texture-trials/classic-builders_guild'
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-root',type=Path,required=True)
    cli=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=cli.output_root.resolve()
    if not root.is_relative_to(lod.ART):raise ValueError('Isolated art directory required')
    if root.exists():raise ValueError('Use a fresh output; prior evidence must remain')
    report_path=base/'builders_guild.json';prior=json.loads(report_path.read_text('utf8'))
    candidate=verify(prior['processedCandidate']);origin=verify(prior['textureOnlyReprocessing']['sourceCandidate'])
    assert sha(origin)==SOURCE_SHA
    raw=verify(prior['textureOnlyReprocessing']['sourceTexture'])
    before=GLB(candidate);g=GLB(candidate);part=g.doc['meshes'][0]['primitives'][0]
    vertices,faces,uvs,instances=rest_surface(GLB(origin))
    assert len(faces)==prior['triangles'] and len(instances)==2
    # Bounding boxes conservatively include subpixel islands that have no
    # rasterized center. Four texels protect neighboring bilinear/mip sampling.
    size=2048;occupied=np.zeros((size,size),bool)
    for uv in uvs:
        lo=np.maximum(0,np.floor(uv.min(0)*size).astype(int)-4)
        hi=np.minimum(size-1,np.ceil(uv.max(0)*size).astype(int)+4)
        occupied[lo[1]:hi[1]+1,lo[0]:hi[0]+1]=True
    squares=[];new_uv=[];span=64
    for _ in FACES:
        sums=np.pad(occupied.astype(np.int32),((1,0),(1,0))).cumsum(0).cumsum(1)
        counts=sums[span:,span:]-sums[:-span,span:]-sums[span:,:-span]+sums[:-span,:-span]
        choices=np.argwhere(counts==0)
        if not len(choices):raise ValueError('No safe empty atlas square; do not overwrite another island')
        y,x=map(int,choices[0]);occupied[y:y+span,x:x+span]=True;squares.append([x,y,span])
        uv=(np.array([[x+6,y+6],[x+span-7,y+6],[x+6,y+span-7]],np.float64)+.5)/size
        # Round-trip the final quantized GLTF UV before sampling, not afterwards.
        gltf_uv=uv.copy();gltf_uv[:,1]=1-gltf_uv[:,1]
        encoded=np.rint(gltf_uv*65535).astype(np.uint16)
        exact=encoded.astype(np.float64)/65535;exact[:,1]=1-exact[:,1];new_uv.append(exact)
    new_uv=np.array(new_uv,np.float32)
    root.mkdir();(root/'tools').mkdir()
    settings=SimpleNamespace(region='classic',asset='builders_guild',name='classic__builders_guild__local_uv',lod='near',
        height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,texture_size=size,
        render_directory=root/'renders')
    lod.clear_scene();body,_=lod.p.import_body(raw);normalization=lod.p.upright(body,settings)
    mesh=bpy.data.meshes.new('two_original_triangles');mesh.from_pydata(vertices[faces[FACES]].reshape(-1,3).tolist(),[],[[0,1,2],[3,4,5]]);mesh.update()
    layer=mesh.uv_layers.new(name='OnlyTwoInspectedRoofSlivers');layer.data.foreach_set('uv',new_uv.reshape(-1))
    low=bpy.data.objects.new('two_original_triangles',mesh);bpy.context.collection.objects.link(low)
    transfer,images=bake(body,low,settings)
    if transfer['sourceDistanceQuantiles'][2]>.02 or transfer['closestSourceVertexFallbackFraction']>.001:
        raise ValueError('Local source correspondence failed')
    image_paths={};image_diffs={}
    for role in ('base','orm'):
        image=bpy.data.images.load(str(verify(prior['textureOnlyReprocessing']['maps'][role])),check_existing=False)
        image.colorspace_settings.name='sRGB' if role=='base' else 'Non-Color'
        width,height=image.size;assert (width,height)==tuple(images[role].size)
        pixels=np.empty(width*height*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
        old=pixels.copy();patch=np.empty_like(pixels);images[role].pixels.foreach_get(patch.reshape(-1))
        mask=np.zeros((height,width),bool);scale=size//width
        for x,y,side in squares:
            # Squares are disjoint from all old UVs including four-pixel margin.
            xx,yy=x//scale,y//scale;endx=(x+side+scale-1)//scale;endy=(y+side+scale-1)//scale
            mask[yy:endy,xx:endx]=True;pixels[yy:endy,xx:endx]=patch[yy:endy,xx:endx]
        assert np.array_equal(pixels[~mask],old[~mask])
        image_diffs[role]={'onlyUnusedAtlasSquaresChangedBeforeEncoding':True,'changedPixelCount':int(np.any(pixels!=old,axis=2).sum()),'dimensions':[width,height],
            'encoding':'JPEG quality 96; whole-atlas codec quantization is reviewed in the fresh views' if role=='base' else 'Lossless PNG, linear ORM'}
        image.pixels.foreach_set(pixels.reshape(-1));image.update();path=root/(role+('.jpg' if role=='base' else '.png'))
        image.filepath_raw=str(path);image.file_format='JPEG' if role=='base' else 'PNG';image.save(quality=96);image_paths[role]=path
    indices=g.array(part['indices']).reshape(-1,3);original_indices=indices.copy()
    duplicates=indices[FACES].reshape(-1);vertex_count=g.doc['accessors'][part['attributes']['POSITION']]['count']
    indices[FACES]=np.arange(vertex_count,vertex_count+len(duplicates)).reshape(-1,3)
    replacements={};changed_views=set()
    for semantic,accessor_id in part['attributes'].items():
        accessor=g.doc['accessors'][accessor_id];view_id=accessor['bufferView'];view=g.doc['bufferViews'][view_id]
        if accessor.get('byteOffset',0)!=0 or sum(a.get('bufferView')==view_id for a in g.doc['accessors'])!=1:raise ValueError('Unexpected shared/interleaved accessor')
        dtype=np.dtype(DTYPES[accessor['componentType']]);width=WIDTH[accessor['type']];stride=view.get('byteStride',dtype.itemsize*width)
        original=np.frombuffer(view_bytes(g,view_id),np.uint8).reshape(vertex_count,stride).copy()
        extra=original[duplicates].copy()
        if semantic=='TEXCOORD_0':
            assert accessor['componentType']==5123 and accessor.get('normalized') and stride==4
            q=new_uv.reshape(-1,2).astype(np.float64);q[:,1]=1-q[:,1]
            extra=np.rint(q*65535).astype('<u2').view(np.uint8).reshape(-1,4)
        replacements[view_id]=np.concatenate([original,extra]).tobytes();accessor['count']+=len(duplicates);changed_views.add(view_id)
    index_accessor=g.doc['accessors'][part['indices']];assert index_accessor['componentType']==5125
    replacements[index_accessor['bufferView']]=indices.astype('<u4').tobytes();changed_views.add(index_accessor['bufferView'])
    pbr=g.doc['materials'][0]['pbrMetallicRoughness']
    for role,key in [('base','baseColorTexture'),('orm','metallicRoughnessTexture')]:
        image_id=g.doc['textures'][pbr[key]['index']]['source'];row=g.doc['images'][image_id]
        replacements[row['bufferView']]=image_paths[role].read_bytes();row['mimeType']='image/jpeg' if role=='base' else 'image/png';changed_views.add(row['bufferView'])
    blob=bytearray()
    for i,view in enumerate(g.doc['bufferViews']):
        data=replacements.get(i,view_bytes(before,i))
        while len(blob)%4:blob.append(0)
        view['byteOffset']=len(blob);view['byteLength']=len(data);blob.extend(data)
    g.blob=blob;output=root/'builders_guild.glb';g.save(output);after=GLB(output)
    assert before.doc['nodes']==after.doc['nodes'] and before.doc.get('animations')==after.doc.get('animations')
    assert before.doc['meshes']==after.doc['meshes'] and before.doc['materials']==after.doc['materials']
    after_indices=after.array(part['indices']).reshape(-1,3)
    for semantic in ('POSITION','NORMAL'):
        a=before.array(part['attributes'][semantic])[original_indices]
        b=after.array(part['attributes'][semantic])[after_indices]
        assert np.array_equal(a,b),semantic+' changed on original triangle corners'
    before_uv=before.array(part['attributes']['TEXCOORD_0'])[original_indices]
    after_uv=after.array(part['attributes']['TEXCOORD_0'])[after_indices]
    changed=np.flatnonzero(np.any(before_uv!=after_uv,axis=(1,2)))
    assert np.array_equal(changed,FACES)
    for i in range(len(before.doc['bufferViews'])):
        if i not in changed_views:assert view_bytes(before,i)==view_bytes(after,i)
    proof={'input':evidence(candidate),'inputReport':evidence(report_path),'output':evidence(output),'tool':snapshot(Path(__file__),root/'tools'),
        'source':evidence(raw),'sourceNormalization':normalization,'repair':'Two inspected subpixel roof UV slivers isolated in previously unused atlas squares, sampled from original source; no invented colors',
        'faceIds':FACES.tolist(),'oldBlenderUVs':uvs[FACES].tolist(),'newBlenderUVs':new_uv.tolist(),'emptyAtlasSquaresBlenderPixels':squares,
        'sampling':transfer,'imageChanges':image_diffs,'maps':{k:evidence(v) for k,v in image_paths.items()},
        'verification':{'triangleCornerPositionsByteIdentical':True,'triangleCornerNormalsByteIdentical':True,'exactChangedUVFaces':changed.tolist(),
            'addedCoincidentUVSeamVertices':6,'noFacesAddedOrRemoved':True,'nodeHierarchyAndAnimationUnchanged':True,'meshPrimitiveAndMaterialReferencesUnchanged':True,
            'allUnrelatedBufferViewsByteIdentical':True,'oldGeometryAndUVEvidenceRetained':True}}
    proof_path=root/'local-uv-repair.json';lod.write(proof_path,proof)
    report=copy.deepcopy(prior);report['textureRefreshStage']=report.pop('textureOnlyReprocessing')
    report.update(processingTool=proof['tool'],processedCandidate=evidence(output),processingComplete=False,status='exported_pending_visual_review',createdAt=lod.now(),
        localAtlasIslandRepair=evidence(proof_path),glbValidation=lod.p.inspect_glb(output))
    report['textureOrigin']='Existing 2K/1K source-derived atlas retained; exactly two inspected roof UV slivers now sample isolated original-source patches in unused atlas space.'
    report['renderedCandidate']=lod.render(output,settings,('front','right','back','left','iso'));report['textureSizes']=report['renderedCandidate']['textureSizes']
    import render_component
    sys.argv=['render_component','--','--source',str(output),'--region','classic','--asset','builders_guild','--output-directory',str(root/'motion')]
    render_component.main();motion_path=root/'motion/review.json';motion=json.loads(motion_path.read_text('utf8'))
    report['animation']['poseReview']=evidence(motion_path);report['animation']['frames']=[path for pose in motion['poses'] for path in pose['views']]
    report.update(processingComplete=True,completedAt=lod.now());lod.write(output.with_suffix('.json'),report)
    assert sha(candidate)==prior['processedCandidate']['sha256'] and sha(origin)==SOURCE_SHA
    print('GUILD_LOCAL_UV_READY',json.dumps({'candidate':evidence(output),'report':evidence(output.with_suffix('.json'))}),flush=True)

if __name__=='__main__':main()
