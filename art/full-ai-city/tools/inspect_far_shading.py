"""Render a material diagnostic from the actual exported far GLB."""
from pathlib import Path
import sys
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).parent))
from neural_component import GLB
import process_lod as lod
for variant in ('no-normal-only','no-orm-only'):
    g=GLB(lod.ART/'candidates-far/classic/hotel_2.glb')
    for material in g.doc['materials']:
        if variant=='no-normal-only':material.pop('normalTexture',None)
        else:
            material['pbrMetallicRoughness'].pop('metallicRoughnessTexture',None)
            material['pbrMetallicRoughness']['metallicFactor']=0
            material['pbrMetallicRoughness']['roughnessFactor']=.8
    path=lod.ART/'work'/('far-'+variant+'.glb');g.save(path)
    args=SimpleNamespace(region='classic',asset='hotel_2',lod='far',height=1.,footprint=1.,render_directory=lod.ART/'work/far-diagnostic',render_prefix=variant+'-')
    lod.render(path,args,('front',))
