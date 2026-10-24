"""Verify rigid rest sampling and texture-only edits on actual frozen assets.

Writes only tiny image fixtures and disposable GLBs inside a temporary folder;
does not bake, render, change approvals, or replace production assets.
"""
from pathlib import Path
import base64,copy,json,tempfile
import numpy as np
from refresh_baked_textures import GLB,local,verify,atlas_contract,rest_surface,replace_images,verify_preservation


def rejected(call):
    try:call()
    except ValueError:return
    raise AssertionError('Unexpectedly accepted a forbidden change')


def main():
    entries=json.loads(Path(__file__).with_name('texture_refresh_fixtures.json').read_text('utf8'))['assets']
    # One live-driver split and one actual GLTF animation exercise both forms.
    keys=('classic/builders_guild','alpine/windmill')
    with tempfile.TemporaryDirectory(prefix='texture-refresh-preservation-') as directory:
        temp=Path(directory);image=temp/'fixture.png'
        image.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1cAAAAASUVORK5CYII='))
        for key in keys:
            entry=entries[key];source=verify(entry['candidate']);before=GLB(source)
            output=temp/(key.replace('/','-')+'.glb')
            result=replace_images(source,output,{'base':image,'orm':image})
            assert result['allGeometryUVNormalAndAnimationBytesUnchanged']
            after=GLB(output)
            assert after.doc.get('animations')==before.doc.get('animations')
            assert after.doc['nodes']==before.doc['nodes']
            assert 'normalTexture' not in after.doc['materials'][0]
            processing=json.loads(verify(entry['processingReport']).read_text('utf8'))
            static=GLB(verify(processing['derivedFromStaticCandidate']))
            v,f,uv,instances=rest_surface(before);sv,sf,suv,_=rest_surface(static)
            assert len(f)==len(sf)==processing['triangles'] and len(instances)==2
            # Rigid separation can reorder corners. Compare the actual rest
            # position multiset per axis, independently of vertex identities.
            assert np.allclose(np.sort(v[f].reshape(-1,3),axis=0),np.sort(sv[sf].reshape(-1,3),axis=0),atol=2e-6,rtol=0)
            changed=temp/'corrupt.glb'
            for field in ('nodes','materials','geometry'):
                corrupted=GLB(output)
                if field=='nodes':corrupted.doc['nodes'][0]['name']='unexpected replacement'
                elif field=='materials':corrupted.doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']=0
                else:
                    p=corrupted.doc['meshes'][0]['primitives'][0]
                    accessor=corrupted.doc['accessors'][p['attributes']['POSITION']]
                    offset=corrupted.doc['bufferViews'][accessor['bufferView']].get('byteOffset',0)+accessor.get('byteOffset',0)
                    corrupted.blob[offset]^=1
                corrupted.save(changed);rejected(lambda:verify_preservation(source,changed))
        rejected(lambda:atlas_contract(GLB(verify(entries['alpine/chance_wheel']['candidate']))))
    print('PASS actual rigid split and animated rest surfaces; exact geometry/UV/animation preservation; node/material/geometry corruption and multi-material rejection')


if __name__=='__main__':main()
