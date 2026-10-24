"""Compare sampling UVs with Blender's actual import and asymmetric image pixels."""
from pathlib import Path
import json,sys
import bpy
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from refresh_baked_textures import GLB,verify,rest_surface,decoded
from bake_nearest_surface import array,sample,source_image


def main():
    entries=json.loads(Path(__file__).with_name('texture_refresh_fixtures.json').read_text('utf8'))['assets']
    source=verify(entries['alpine/villa_2']['candidate'])
    glb=GLB(source);_,_,uv,_=rest_surface(glb)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
    body=meshes[0];actual=array(body.data.uv_layers.active.data,'uv',2).reshape(-1,3,2)
    assert uv.shape==actual.shape and np.allclose(uv,actual,atol=1e-7,rtol=0),'Manual sampling UV must match actual GLTF importer V conversion'
    primitive=glb.doc['meshes'][0]['primitives'][0]
    encoded=decoded(glb,primitive['attributes']['TEXCOORD_0'])[glb.array(primitive['indices']).reshape(-1,3)]
    assert np.allclose(uv[:,:,0],encoded[:,:,0],atol=1e-7,rtol=0)
    assert np.allclose(uv[:,:,1],1-encoded[:,:,1],atol=1e-7,rtol=0)
    bsdf=next(n for n in body.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    image=source_image(bsdf.inputs['Base Color'])
    correct=sample(image,uv[::37].mean(axis=1));actual_colors=sample(image,actual[::37].mean(axis=1))
    wrong=sample(image,encoded[::37].mean(axis=1))
    correct_error=float(np.max(np.abs(correct-actual_colors)))
    inverted_error=float(np.mean(np.abs(correct[:,:3]-wrong[:,:3])))
    assert correct_error<1e-4 and inverted_error>.01,'Actual asymmetric source colors must expose a missing V flip'
    print('PASS actual alpine/villa_2 GLTF import UV and image locations; matching error',correct_error,'missing-V-flip color error',inverted_error,flush=True)


if __name__=='__main__':main()
