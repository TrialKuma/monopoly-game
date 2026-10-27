"""Refresh only Kyoto ceramic shading from the already-clean source.blend.

Preview plan: blender -b -t 3 --python art/blender-city/refresh_roof_shading.py -- --all
Apply locally: append --apply. --assets tower_3,villa_2 bounds a sample run.
--output-root work/kyoto-roof-shading/refresh-smoke leaves formal assets intact.
No geometry rebuilding, facade baking, compression, previews or publishing.
"""
import argparse, hashlib, importlib.util, json, math, os, shutil, struct, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
pipeline=module('roof_refresh_pipeline',HERE/'build.py')
shader=module('roof_refresh_shader',HERE/'roof_shading.py')
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else Path(value).read_bytes()).hexdigest()
def relative(path):return str(Path(path).relative_to(ROOT)).replace('\\','/')
def receipt(path):return {'path':relative(path),'sha256':digest(path)}
def parse(raw):
    assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
    size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);assert len(doc['buffers'])==1
    return doc,raw[28+size:]
def encode(doc,binary):
    doc['buffers'][0]['byteLength']=len(binary)
    header=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();header+=b' '*((-len(header))%4)
    binary+=b'\0'*((-len(binary))%4)
    return struct.pack('<4sII',b'glTF',2,28+len(header)+len(binary))+struct.pack('<I4s',len(header),b'JSON')+header+struct.pack('<I4s',len(binary),b'BIN\0')+binary
def image_bytes(doc,binary,index):
    view=doc['bufferViews'][doc['images'][index]['bufferView']];offset=view.get('byteOffset',0)
    return binary[offset:offset+view['byteLength']]
def texture_refs(value,path=()):
    if not isinstance(value,dict):return
    for key,item in value.items():
        if key.endswith('Texture') and isinstance(item,dict) and 'index' in item:yield path+(key,),item['index']
        elif isinstance(item,dict):yield from texture_refs(item,path+(key,))
def preserve_facade_images(old_raw,new_raw):
    """Re-use embedded input PNG bytes even if Blender's exporter repacks one."""
    old,old_bin=parse(old_raw);new,new_bin=parse(new_raw);materials={m['name']:m for m in old['materials']};mapping={}
    for mat in new['materials']:
        if mat['name'].endswith(' / roof ceramic'):continue
        old_refs=dict(texture_refs(materials[mat['name']]));new_refs=dict(texture_refs(mat));assert old_refs.keys()==new_refs.keys()
        for key,index in new_refs.items():
            old_image=old['textures'][old_refs[key]]['source'];new_image=new['textures'][index]['source']
            content=image_bytes(old,old_bin,old_image)
            if new_image in mapping:assert mapping[new_image]==content
            mapping[new_image]=content
    reused=[]
    for index,content in mapping.items():
        if image_bytes(new,new_bin,index)!=content:
            new_bin+=b'\0'*((-len(new_bin))%4);offset=len(new_bin);new_bin+=content
            new['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(content)})
            new['images'][index]['bufferView']=len(new['bufferViews'])-1
        assert image_bytes(new,new_bin,index)==content
        reused.append({'image':new['images'][index].get('name'),'sha256':digest(content),'bytes':len(content)})
    return encode(new,new_bin),reused
def geometry_state(root):
    return [(obj.name,tuple(tuple(row) for row in obj.matrix_world),tuple(tuple(v.co) for v in obj.data.vertices),
             tuple(tuple(face.vertices) for face in obj.data.polygons),tuple(tuple(v.vector) for v in obj.data.corner_normals),
             tuple(tuple(c.color) for c in obj.data.color_attributes['Color'].data)) for obj in pipeline.meshes(root)]
def packed_images():
    return {image.name:digest(bytes(image.packed_file.data)) for image in bpy.data.images if image.packed_file}
def preflight(asset):
    folder=HERE/'models/compact'/asset;record=json.loads((folder/'model.json').read_text('utf-8'));raw=(folder/'model.glb').read_bytes()
    assert record['region']=='compact' and record['asset']==asset
    assert record['sourceType']==pipeline.SOURCE and record['sha256']==digest(raw) and record['bytes']==len(raw)
    assert math.isfinite(record['scale']) and record['scale']>0
    assert (folder/'source.blend').is_file() and (folder/'surface-orm.png').is_file()
    doc,_=parse(raw);assert len([m for m in doc['materials'] if m['name'].endswith(' / roof ceramic')])==1
    return folder,record,raw
def refresh(asset,output_root):
    source,record,old_raw=preflight(asset);output=(output_root/asset) if output_root else source
    inputs={name:receipt(source/name) for name in ('model.glb','source.blend','surface-orm.png')}
    bpy.ops.wm.open_mainfile(filepath=str(source/'source.blend'));root=bpy.data.objects['compact_'+asset]
    assert root.get('sourceType')==pipeline.SOURCE
    before=geometry_state(root);old_images=packed_images();before_triangles=pipeline.triangles(root)
    assert before_triangles==record['triangles']
    lo,hi=pipeline.bounds(root);size=hi-lo
    assert all(abs(a-b)<1e-5 for a,b in zip((size.x,size.z,size.y),record['size']))
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.roof-shading-',dir=str(output.parent)) as temporary:
        stage=Path(temporary);objects=shader.roof_objects(root);assert objects
        image,details=shader.ambient_uv(root,objects,stage,record['scale'])
        materials={obj.data.materials[face.material_index] for obj in objects for face in obj.data.polygons};assert len(materials)==1
        for material in materials:shader.attach(material,image)
        assert geometry_state(root)==before,'Refresh changed geometry, normals or authored colors'
        assert all(packed_images().get(name)==sha for name,sha in old_images.items()),'Existing packed images changed'
        # Packed content remains available after the staging folder is removed.
        image.filepath_raw=str(output/'roof-ambient.png')
        bpy.ops.wm.save_as_mainfile(filepath=str(stage/'source.blend'))
        pipeline.export_glb(root,stage/'model.glb')
        exported,reused=preserve_facade_images(old_raw,(stage/'model.glb').read_bytes());(stage/'model.glb').write_bytes(exported)
        details.update({'builder':relative(HERE/'roof_shading.py'),'builderSha256':digest(HERE/'roof_shading.py')})
        refreshed={**record,'sha256':digest(exported),'bytes':len(exported),'surface':{**record['surface'],'roofSurface':details},
                   'status':'built_pending_scene_review','pipelineSha256':digest(HERE/'build.py'),
                   'roofSourceReceipt':{'input':inputs,'method':'refresh_existing_clean_source_no_facade_bake',
                    'refresher':receipt(__file__),'shader':receipt(HERE/'roof_shading.py'),'pipeline':receipt(HERE/'build.py'),
                    'geometryBuilder':{'path':record['builder'],'sha256':record['builderSha256']},
                    'geometryNormalsColorsPreserved':True,'nonRoofImagesPreserved':reused,
                    'refreshedAtUtc':datetime.now(timezone.utc).isoformat()}}
        # Geometry's original builder hash stays unchanged: no geometry builder ran.
        refreshed.pop('storageCompression',None)
        (stage/'model.json').write_text(json.dumps(refreshed,ensure_ascii=False,indent=2)+'\n','utf-8')
        if output!=source:shutil.copy2(source/'surface-orm.png',stage/'surface-orm.png')
        output.mkdir(parents=True,exist_ok=True)
        for name in ('roof-ambient.png','source.blend','model.glb','surface-orm.png','model.json'):
            if (stage/name).exists():os.replace(stage/name,output/name)
    return {'asset':asset,'output':relative(output),'sha256':refreshed['sha256'],'bytes':refreshed['bytes'],'roofSurface':details,'nonRoofImagesPreserved':reused}
def main():
    p=argparse.ArgumentParser();group=p.add_mutually_exclusive_group(required=True);group.add_argument('--all',action='store_true');group.add_argument('--assets')
    p.add_argument('--apply',action='store_true');p.add_argument('--output-root');args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    allowed=list(pipeline.CAT['regions']['compact']);names=allowed if args.all else args.assets.split(',')
    if not names or len(set(names))!=len(names) or any(name not in allowed for name in names):p.error('Use distinct Kyoto assets from the reference catalog')
    output_root=(ROOT/args.output_root).resolve() if args.output_root else None
    if output_root and not output_root.is_relative_to((ROOT/'work').resolve()):p.error('--output-root must be inside the project work/ folder')
    for asset in names:preflight(asset)
    if not args.apply:print(json.dumps({'mode':'check','assets':names,'formalFilesChanged':False}));return
    for asset in names:print('ROOF_SHADING_REFRESH '+json.dumps(refresh(asset,output_root)),flush=True)
if __name__=='__main__':main()
