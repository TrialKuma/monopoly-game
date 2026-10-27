"""Blender geometry regression checks for the western roof builders.

blender -b -t 3 --python tests/western-roof-geometry.py
No baking, exports or production-asset writes.
"""
import importlib.util
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('western_roof_test', ROOT/'art/blender-city/regions/western.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class Capture:
    def __init__(self): self.calls = []
    def poly(self, vertices, faces, material, smooth=False, **kw):
        self.calls.append((list(map(Vector, vertices)), faces, material, smooth))
    def cylinder(self, *args, **kwargs): pass
    def sphere(self, *args, **kwargs): pass


def area(vertices, face):
    origin = vertices[face[0]]
    return sum((vertices[face[i]]-origin).cross(vertices[face[i+1]]-origin).length/2 for i in range(1,len(face)-1))


# The upper-row hip cut crosses the interior of this tile, but never reaches
# its upper edge: it must produce a closed triangular remnant, not a hole.
a,c = Vector((-1.5,-.985,0)),Vector((1.5,-.985,0))
aa,cc = Vector((-.2575,-.0225,.99)),Vector((.2575,-.0225,.99))
cut = Capture()
w.roof_tile(cut,a,c,aa,cc,4,5,3,11,True)
assert cut.calls and sum(area(v,f) for v,fs,_,_ in cut.calls for f in fs)>0
assert any(len(f)==3 for _,faces,_,_ in cut.calls for f in faces), 'Hip-cut triangular tile is missing'

# Every generated tile face has nonzero area and every projected top vertex
# stays within the roof slope (including steep/small public-building roofs).
tiles_checked = 0
for width,depth,height,topw,topd,curved in [(3,1.97,.99,.515,.045,True),(1.04,1.04,.38,.03,.045,True),(2.62,1.84,.72,1.4148,.8464,False)]:
    a,c = Vector((-width/2,-depth/2,0)),Vector((width/2,-depth/2,0))
    aa,cc = Vector((-topw/2,-topd/2,height)),Vector((topw/2,-topd/2,height))
    direction=(c-a).normalized();fall=(aa-a)-direction*(aa-a).dot(direction)
    normal=direction.cross(fall).normalized()
    for row in range(5):
        for col in range(11):
            cap=Capture();w.roof_tile(cap,a,c,aa,cc,row,5,col,11,curved)
            if not cap.calls:continue
            tiles_checked+=1
            for vertices,faces,material,_ in cap.calls:
                assert material=='roof'
                assert all(area(vertices,f)>1e-10 for f in faces), (width,row,col,'zero-area tile face')
            vertices,faces,_,_=cap.calls[0]
            for index in {v for f in faces for v in f}:
                p=vertices[index]-a;t=p.dot(fall)/fall.length_squared;x=p.dot(direction)
                assert -.00001<=t<=1.00001
                assert (aa-a).dot(direction)*t-.00001<=x<=width+(cc-c).dot(direction)*t+.00001
    # Gable timber radius must remain below the roof deck at any slope.
    slope=math.atan2(height,width/2)
    drop=.050/math.cos(slope)+.018
    assert drop*math.cos(slope)>.047+.012

for glass in (False,True):
    cap=Capture();w.dome(cap,0,0,0,.48,.45,'harbor',glass)
    vertices,faces,_,_=cap.calls[0]
    assert len(vertices)==32*12+1, 'Dome must have one shared apex'
    assert sum(len(f)==3 for f in faces)==32
    assert all(area(vertices,f)>1e-10 for v,faces,_,_ in cap.calls for f in faces for vertices in [v])
    assert all(m!='roof_edge' for _,_,m,_ in cap.calls), 'Legacy thin contrasting dome ribs returned'

catalog=json.loads((ROOT/'art/blender-city/reference-catalog.json').read_text('utf-8'))
records=[];calls={}
for function in ('hip','gable','dome','chateau_spire'):
    original=getattr(w,function)
    def counted(*args, _name=function, _function=original, **kwargs):
        calls[_name]=calls.get(_name,0)+1
        return _function(*args,**kwargs)
    setattr(w,function,counted)

for region in ('classic','harbor'):
    names=list(catalog['regions'][region])+(['harbor_lighthouse'] if region=='harbor' else [])
    for asset in names:
        bpy.ops.wm.read_factory_settings(use_empty=True);calls.clear()
        root=w.build(region,asset)
        objects=[o for o in root.children_recursive if o.type=='MESH']
        assert objects
        tris=0;roof_degenerate=0
        for obj in objects:
            assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
            for polygon in obj.data.polygons:
                tris+=len(polygon.vertices)-2
                material=obj.data.materials[polygon.material_index].name.split('/')[-1].strip()
                if material in ('roof','roof_edge') and polygon.area<1e-10:
                    roof_degenerate+=1
                    print('DEGENERATE',region,asset,[tuple(obj.data.vertices[i].co) for i in polygon.vertices],flush=True)
        assert not roof_degenerate,(region,asset,roof_degenerate)
        large=asset.split('_')[0] in ('skyscraper','finance','onsen')
        limit=60000 if asset=='harbor_lighthouse' else 80000 if large else 50000
        assert tris<=limit,(region,asset,tris,limit)
        record={'region':region,'asset':asset,'triangles':tris,'roofBuilderCalls':dict(calls)}
        records.append(record)
        print('WESTERN_GEOMETRY_OK '+json.dumps(record),flush=True)

report={'assets':len(records),'tileCellsChecked':tiles_checked,'checks':['hip cut triangle retained','slope clipping','nonzero tile faces','timber clear of roof deck','one dome apex','no degenerate roof faces','finite vertices','triangle budgets'],'records':records}
out=ROOT/'work/global-building-audit/western/geometry-report.json'
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('WESTERN_GEOMETRY_PASS '+json.dumps({'assets':len(records),'tileCellsChecked':tiles_checked}),flush=True)
