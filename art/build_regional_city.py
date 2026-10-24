"""Archived authored architecture experiment; never writes the live game kit.

Blender 5.2 --background --factory-startup --python art/build_regional_city.py --
  --map alpine --scope core --preview

Each root is bottom-centred, Blender Z-up / front -Y, glTF Y-up / front +Z.
Preview staging is never exported. Architecture levels add storeys and features;
they are not scaled copies. Components are joined per root; materials are shared per kit.
The approved-ai-houses.json exact-hash registry replaces only villa_2 with reviewed
Pixal multiview sources, preserving their UVs and embedded textures. --manual-house
writes a separate comparison bundle. All outputs now stay under
art/regions/legacy-builds. The full-AI runtime is published only by
art/full-ai-city/tools/pack_runtime.py.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from contextlib import contextmanager
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art/regions/legacy-builds'
ART = ROOT / 'art/regions'
FAMILIES = ('villa', 'shop', 'hotel', 'tower')
LARGE = ('skyscraper', 'finance', 'onsen')
PUBLIC = ('civic_hall', 'vault_bank', 'builders_guild', 'card_pavilion',
          'chance_wheel', 'teleport_gate', 'rush_station', 'junction_hub')
REGIONS = ('classic', 'compact', 'expansion', 'harbor', 'alpine')
REFERENCE = {region: ART / 'references' / f'{region}-core-three-views.png' for region in REGIONS}
AI_STATUS = {}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', choices=(*REGIONS, 'all'), required=True)
    parser.add_argument('--scope', choices=('core', 'large', 'public', 'all'), default='all')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--preview-set', choices=('all','core','large','public'), default='all')
    parser.add_argument('--asset', help='Optional single legacy name, e.g. villa_2')
    parser.add_argument('--resolution', type=int, default=1900)
    parser.add_argument('--ai-house', action='store_true', default=True, help='Use an exact approved regions-ai/{map}_house.glb for villa_2 (default)')
    parser.add_argument('--manual-house', action='store_false', dest='ai_house', help='Authoring comparison only; writes a separate -manual bundle')
    parser.add_argument('--output-suffix', default='', help='Use -ai-candidate for a review export without replacing the live kit')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


PALETTES = {
    'classic': {'wall': 'E9D6B3', 'stone': 'C7B897', 'trim': 'F9E8C6', 'roof': '475A71',
               'roof_edge': '6B7D92', 'wood': '586B59', 'wood_light': 'AA8A5A', 'accent': '416F5B',
               'recess': '465969', 'glass': 'F5C979', 'metal': '3E5149', 'leaf': '538354', 'flower': 'D8838B', 'water': '63B2BD'},
    'alpine': {'wall': 'F2DEBA', 'stone': 'BDB29C', 'trim': 'E7CDA5', 'roof': 'CB6144',
               'roof_edge': 'E47D57', 'wood': '96643C', 'wood_light': 'BD8A51', 'accent': '497F7C',
               'recess': '4F625B', 'glass': 'FFCF77', 'metal': '66523A', 'leaf': '548453', 'flower': 'F5D77D', 'water': '64B9BD'},
    'harbor': {'wall': 'F7E4BD', 'stone': 'D6BA8A', 'trim': 'FFECD0', 'roof': '337F8C',
               'roof_edge': '5AA4AC', 'wood': '9F7546', 'wood_light': 'C4A06A', 'accent': '3786A6',
               'recess': '45636A', 'glass': 'FFD78B', 'metal': '3F5659', 'leaf': '4C8457', 'flower': 'DE7C8D', 'water': '4EB1BE'},
    'compact': {'wall': 'F0DFC1', 'stone': 'AAB3AA', 'trim': 'D6BC8F', 'roof': '506B7C',
                'roof_edge': '718894', 'wood': '745039', 'wood_light': 'B68550', 'accent': '687F59',
                'recess': '414E4F', 'glass': 'F4D694', 'metal': '6C6250', 'leaf': '648C5C', 'flower': 'E6AB9F', 'water': '72AFB5'},
    'expansion': {'wall': 'BC7155', 'stone': 'D1B689', 'trim': 'F2D7A1', 'roof': '558477',
                  'roof_edge': '80A18D', 'wood': 'A38959', 'wood_light': 'D7AF60', 'accent': '3C7E71',
                  'recess': '374C57', 'glass': '749CAC', 'metal': '596461', 'leaf': '61835B', 'flower': 'DBAC76', 'water': '5FA7B2'},
}


def make_materials(region):
    materials = {}
    for name, code in PALETTES[region].items():
        rgb = tuple(linear(int(code[i:i+2], 16)/255) for i in (0, 2, 4))
        material = bpy.data.materials.new(f'{region}/{name}')
        material.diffuse_color = (*rgb, 1)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1)
        shader.inputs['Roughness'].default_value = .7 if name in ('wall', 'stone') else .48
        shader.inputs['Metallic'].default_value = .25 if name == 'metal' else .08 if name == 'water' else 0
        if name == 'glass':
            shader.inputs['Emission Color'].default_value = (*rgb, 1)
            shader.inputs['Emission Strength'].default_value = .15
        materials[name] = material
    return materials


class Mesh:
    """One material-batched mesh with actual bevelled architectural components."""
    def __init__(self, name, materials):
        self.name = name
        self.materials = materials
        self.keys = list(materials)
        self.vertices, self.faces, self.indices, self.smooth = [], [], [], []
        self.bevel_edges = set()
        self.rotation = 0
        self.offset = Vector((0,0,0))

    @contextmanager
    def facing(self, angle):
        previous = self.rotation
        self.rotation = previous + angle
        try:
            yield self
        finally:
            self.rotation = previous

    @contextmanager
    def at(self,position,angle=0):
        previous=self.offset.copy();rotation=self.rotation
        x,y,z=position;co,si=math.cos(rotation),math.sin(rotation)
        self.offset+=Vector((x*co-y*si,x*si+y*co,z));self.rotation+=angle
        try:yield self
        finally:self.offset=previous;self.rotation=rotation

    def poly(self, vertices, faces, material, smooth=False, bevel=False):
        offset = len(self.vertices)
        co, si = math.cos(self.rotation), math.sin(self.rotation)
        dx,dy,dz=self.offset
        self.vertices.extend((x*co-y*si+dx, x*si+y*co+dy, z+dz) for x, y, z in vertices)
        for face in faces:
            self.faces.append(tuple(offset+i for i in face))
            self.indices.append(self.keys.index(material))
            self.smooth.append(smooth)
            if bevel:
                for i in range(len(face)):
                    self.bevel_edges.add(tuple(sorted((offset+face[i],offset+face[(i+1)%len(face)]))))

    def box(self, p, size, material, rotate=0):
        x, y, z = p
        a, b, c = (s/2 for s in size)
        co, si = math.cos(rotate), math.sin(rotate)
        corners = [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]
        self.poly([(x+u*co-v*si,y+u*si+v*co,z+w) for u,v,w in corners],
                  [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)], material, bevel=min(size)>=.023)

    def cylinder(self, p, radius, height, material, sides=12, top=None):
        x,y,z = p
        top = radius if top is None else top
        vertices = [(x+r*math.cos(i*math.tau/sides),y+r*math.sin(i*math.tau/sides),z+h)
                    for r,h in ((radius,-height/2),(top,height/2)) for i in range(sides)]
        faces = [tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))]
        faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.poly(vertices,faces,material,True)

    def sphere(self, p, size, material, sides=8, rings=4):
        x,y,z=p
        sx,sy,sz=size
        vertices=[(x+sx*math.sin(j*math.pi/rings)*math.cos(i*math.tau/sides),
                   y+sy*math.sin(j*math.pi/rings)*math.sin(i*math.tau/sides),z+sz*math.cos(j*math.pi/rings))
                  for j in range(rings+1) for i in range(sides)]
        faces=[(j*sides+i,(j+1)*sides+i,(j+1)*sides+(i+1)%sides,j*sides+(i+1)%sides)
               for j in range(rings) for i in range(sides)]
        self.poly(vertices,faces,material,True)

    def rod(self, start, end, radius, material, sides=8):
        start,end=Vector(start),Vector(end)
        axis=(end-start).normalized()
        aux=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0))
        u=axis.cross(aux).normalized();v=axis.cross(u).normalized()
        vertices=[tuple(p+radius*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v))
                  for p in (start,end) for i in range(sides)]
        self.poly(vertices,[tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))]+
                  [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)],material,True)

    def xz_shape(self, points, center, depth, material, bevel=True):
        area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
        if area<0:points=list(reversed(points))
        x,y,z=center;n=len(points)
        vertices=[(x+u,y+d,z+v) for d in (-depth/2,depth/2) for u,v in points]
        self.poly(vertices,[tuple(range(n)),tuple(range(n*2-1,n-1,-1))]+
                  [(i+n,(i+1)%n+n,(i+1)%n,i) for i in range(n)],material,bevel=bevel and depth>=.023)

    def arch(self,x,y,z,width,height,material,depth=.018):
        r=width/2;rise=min(r,height*.42);spring=height-rise
        points=[(-r,0),(r,0),(r,spring)]+[(r*math.cos(i*math.pi/8),spring+rise*math.sin(i*math.pi/8)) for i in range(1,9)]
        self.xz_shape(points,(x,y,z),depth,material)

    def finish(self, parent=None, location=(0,0,0), bevel=.004):
        mesh=bpy.data.meshes.new(self.name+'_mesh')
        mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        for material in self.materials.values():mesh.materials.append(material)
        for polygon,index,smooth in zip(mesh.polygons,self.indices,self.smooth):
            polygon.material_index=index;polygon.use_smooth=smooth
        obj=bpy.data.objects.new(self.name+'_geometry',mesh);bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        weights=mesh.attributes.new('bevel_weight_edge','FLOAT','EDGE')
        for edge in mesh.edges:weights.data[edge.index].value=1 if tuple(sorted(edge.vertices)) in self.bevel_edges else 0
        mod=obj.modifiers.new('Real softened architectural edges','BEVEL');mod.width=bevel;mod.segments=1;mod.limit_method='WEIGHT'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Weighted architectural normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40
        bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
        if parent is None:
            parent=bpy.data.objects.new(self.name,None);bpy.context.collection.objects.link(parent)
            parent['front']='Blender -Y / glTF +Z';parent['origin']='ground centre'
        obj.parent=parent;obj.location=location
        return parent


def foundation(b,w,d,z=.045):
    b.box((0,0,z/2),(w+.10,d+.10,z),'stone')
    b.box((0,0,z+.012),(w+.07,d+.07,.025),'trim')


def stone_course(b,w,d,z,height,rows=3):
    for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
        with b.facing(angle):
            for row in range(rows):
                count=max(3,round(span/.15));cell=span/count
                for i in range(count):
                    offset=(row%2)*cell*.25
                    x=-span/2+cell/2+i*cell+offset
                    if x+cell/2>span/2:continue
                    b.box((x,-depth/2-.009,z+(row+.5)*height/rows),(cell-.012,.026,height/rows-.012),'stone' if (i+row)%3 else 'trim')


def window(b,x,y,z,w=.13,h=.19,shutters=True,arched=False,lite=False):
    if arched:
        b.arch(x,y-.006,z,w+.043,h+.034,'trim',.022 if lite else .032)
        b.arch(x,y-.025,z+.012,w,h,'recess',.014)
        b.arch(x,y-.034,z+.027,w-.025,h-.03,'glass',.01)
    else:
        b.box((x,y-.006,z+h/2),(w+.035,.022,h+.035),'recess')
        b.box((x,y-.021,z+h/2),(w,.018,h),'glass')
        for side in (-1,1):b.box((x+side*(w/2+.009),y-.034,z+h/2),(.018,.025,h+.025),'wood')
        for yy in (z-.006,z+h+.006):b.box((x,y-.034,yy),(w+.052,.026,.018),'wood')
    b.box((x,y-.047,z+h*.49),(.012,.017,h-.025),'wood')
    b.box((x,y-.048,z+h*.48),(w-.017,.018,.012),'wood')
    b.box((x,y-.028,z-.028),(w+.067,.065,.022 if lite else .027),'stone')
    if shutters:
        for side in (-1,1):
            xx=x+side*(w/2+.039)
            b.box((xx,y-.021,z+h*.5),(.047,.023,h+.025),'accent')
            for row in range(4):b.box((xx,y-.037,z+.022+row*h*.24),(.039,.007,.009),'wood_light' if b.name.startswith('compact') else 'accent')


def doorway(b,y,width=.18,height=.27):
    z=.07
    b.arch(0,y-.014,z,width+.07,height+.044,'trim',.034)
    b.arch(0,y-.036,z+.006,width+.021,height+.012,'recess',.015)
    b.arch(0,y-.049,z+.016,width,height-.01,'wood',.015)
    for x in (-width*.25,0,width*.25):b.box((x,y-.063,z+height*.38),(.009,.012,height*.65),'wood_light')
    for x in (-width*.21,width*.21):b.sphere((x,y-.076,z+height*.37),(.011,.007,.011),'metal')
    b.box((0,y-.058,.059),(width+.10,.14,.036),'stone')


def balcony(b,width,y,z,flower_boxes=True):
    b.box((0,y-.063,z),(width,.15,.038),'wood')
    b.box((0,y-.132,z+.145),(width+.012,.027,.028),'wood_light')
    b.box((0,y-.132,z+.042),(width,.023,.019),'wood')
    for i in range(max(5,int(width/.063))):
        x=-width/2+.025+i*(width-.05)/(max(5,int(width/.063))-1)
        b.rod((x,y-.132,z+.04),(x,y-.132,z+.14),.009,'wood',8)
    for x in (-width/2+.015,width/2-.015):
        b.box((x,y-.06,z+.145),(.025,.15,.027),'wood_light')
        b.rod((x,y-.125,z+.015),(x,y+.015,z-.09),.011,'wood')
    if flower_boxes:
        for x in (-width*.3,width*.3):
            b.box((x,y-.155,z+.11),(.15,.045,.035),'wood')
            for i in range(4):
                xx=x-.055+i*.037
                b.sphere((xx,y-.157,z+.142),(.026,.026,.023),'leaf')
                b.sphere((xx,y-.177,z+.16),(.012,.009,.012),'flower')


def pot(b,x,y,z=.064,size=.055):
    b.cylinder((x,y,z+size*.6),size,.095,'wood_light',12,top=size*.85)
    b.cylinder((x,y,z+.106),size*1.04,.018,'stone',12)
    for dx,dy,dz in ((0,0,.16),(-.025,.01,.135),(.023,-.006,.14)):
        b.sphere((x+dx,y+dy,z+dz),(size*.68,size*.62,size*.8),'leaf')


def gable_roof(b,w,d,z,height=.21,tiles=True):
    # Ridge runs front-to-back, so the full triangular gable faces the player.
    b.xz_shape([(-w/2,0),(w/2,0),(0,height)],(0,0,z),d,'wall')
    b.xz_shape([(-w/2-.028,-.012),(0,height+.022),(w/2+.028,-.012),
                (w/2+.028,-.034),(0,height-.008),(-w/2-.028,-.034)],(0,0,z),d+.075,'roof')
    if tiles:
        across=max(5,round((d+.07)/.10));courses=5
        tile_width=(d+.07)/across
        for side in (-1,1):
            for row in range(courses):
                start=row/courses;end=min(1,(row+1.11)/courses)
                for col in range(across):
                    yy=-(d+.07)/2+(col+.5)*tile_width
                    verts=[]
                    for t in (start,end):
                        for k in range(5):
                            v=-tile_width*.49+k*tile_width*.98/4
                            bulge=math.sin(k*math.pi/4)*.010
                            # Entire ceramic surface sits above the continuous roof shell.
                            # Previous .009 offset intersected the +.022 shell near the ridge.
                            lip=.008*(1-(t-start)/(end-start))
                            verts.append((side*(w/2+.025)*(1-t),yy+v,z+height*t+.033+bulge+lip))
                    faces=[(i,i+1,i+6,i+5) for i in range(4)]
                    if side<0:faces=[tuple(reversed(face)) for face in faces]
                    b.poly(verts,faces,'roof_edge' if (row+col)%5==0 else 'roof',True)
    b.rod((0,-d/2-.05,z+height+.05),(0,d/2+.05,z+height+.05),.021,'roof_edge',12)
    for y in (-d/2-.046,d/2+.046):
        b.rod((-w/2-.035,y,z-.035),(0,y,z+height-.003),.017,'wood_light')
        b.rod((w/2+.035,y,z-.035),(0,y,z+height-.003),.017,'wood_light')
        b.box((0,y,z+.015),(w+.06,.034,.035),'wood')
    for side in (-1,1):
        b.rod((side*(w/2+.02),-d/2-.045,z-.022),(side*(w/2+.02),d/2+.045,z-.022),.018,'wood')
        for y in (-d*.35,0,d*.35):b.rod((side*w*.43,y,z-.085),(side*(w/2+.028),y,z-.018),.014,'wood')


def chimney(b,x,y,z,height=.20):
    b.box((x,y,z+height/2),(.10,.12,height),'stone')
    for row in range(3):b.box((x,y-.063,z+(row+.5)*height/3),(.105,.012,.012),'trim')
    b.box((x,y,z+height),(.135,.15,.033),'stone')
    b.box((x,y,z+height+.019),(.078,.088,.008),'recess')


def awning(b,y,z,width=.76,color='roof_edge'):
    n=8
    for i in range(n):
        x=-width/2+(i+.5)*width/n
        b.poly([(x-width/n/2,y,z),(x+width/n/2,y,z),(x+width/n/2,y-.14,z-.065),(x-width/n/2,y-.14,z-.065)],[(3,2,1,0)],color if i%2 else 'trim')
        b.box((x,y-.14,z-.08),(width/n,.018,.035),color if i%2 else 'trim')
    for x in (-width*.44,width*.44):b.rod((x,y,z-.13),(x,y-.145,z-.065),.009,'wood')


def alpine_core(name,level,materials):
    b=Mesh(f'alpine_{name}_{level}',materials)
    w=.78 if name!='hotel' else .82;d=.66 if name=='hotel' else .68 if name!='tower' else .72
    floor=.37 if name!='hotel' else .365
    floors=level;wall_top=.065+floors*floor
    foundation(b,w,d)
    b.box((0,0,.064+floors*floor/2),(w,d,floors*floor),'wall')
    stone_course(b,w,d,.067,floor-.015,3)
    for j in range(floors):
        bottom=.065+j*floor
        for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
            with b.facing(angle):
                b.box((0,-depth/2-.014,bottom+floor-.017),(span+.027,.036,.035),'wood' if name!='tower' else 'stone')
                if j>0 and name!='tower':
                    for x in (-span/2+.032,span/2-.032):b.box((x,-depth/2-.015,bottom+floor/2),(.043,.036,floor),'wood')
                if angle in (0,math.pi):
                    if j==0:
                        window(b,-.235,-depth/2,bottom+.11,.105,.16,False)
                        window(b,.235,-depth/2,bottom+.11,.105,.16,False)
                        doorway(b,-depth/2,.16,.275)
                    else:
                        for x in (-.21,.21):window(b,x,-depth/2,bottom+.09,.135,.195)
                else:window(b,0,-depth/2,bottom+.09,.13,.19,j>0)
        if j>0 and name in ('villa','hotel'):
            balcony(b,w+.04,-d/2,bottom+.035)
            if name=='hotel':
                with b.facing(math.pi):balcony(b,w-.03,-d/2,bottom+.035)
        if j>0 and name=='tower':balcony(b,.27,-d/2,bottom+.035,False)
    roof_height=.20 if level==1 else .24
    gable_roof(b,w+.10,d+.025,wall_top+.025,roof_height)
    for angle in (0,math.pi):
        with b.facing(angle):
            if name=='tower':
                # Stepped gable from the residence sheet, distinct from the chalet.
                h=roof_height+.07
                pts=[(-w*.48,0),(w*.48,0),(w*.48,h*.15),(w*.34,h*.15),(w*.34,h*.40),(w*.20,h*.40),(w*.20,h*.69),(w*.08,h*.69),(w*.08,h),(-w*.08,h),(-w*.08,h*.69),(-w*.20,h*.69),(-w*.20,h*.40),(-w*.34,h*.40),(-w*.34,h*.15),(-w*.48,h*.15)]
                b.xz_shape(pts,(0,-d/2-.052,wall_top+.01),.035,'wall')
                for side in (-1,1):
                    for x,z in ((.41,.15),(.27,.40),(.14,.69),(.0,1)):
                        b.box((side*w*x,-d/2-.061,wall_top+.01+h*z),(w*.16,.055,.028),'stone')
                window(b,0,-d/2-.074,wall_top+.04,.10,.125,False,True)
            elif level>1:
                b.box((0,-d/2-.041,wall_top+roof_height*.44),(.034,.035,roof_height*.87),'wood')
                for side in (-1,1):b.rod((side*w*.36,-d/2-.044,wall_top+.026),(0,-d/2-.044,wall_top+roof_height*.81),.013,'wood')
    chimney(b,-w*.28,d*.20,wall_top+roof_height*.65,.16)
    if name=='hotel':
        # A deep entrance porch and projecting attic bay distinguish the inn.
        for x in (-.16,.16):
            b.box((x,-d/2-.10,.20),(.032,.035,.26),'wood')
            b.rod((x,-d/2-.10,.33),(x*.60,-d/2-.10,.37),.012,'wood')
        b.box((0,-d/2-.09,.365),(.39,.20,.045),'wood_light')
        b.xz_shape([(-.21,0),(0,.10),(.21,0),(.21,-.025),(-.21,-.025)],(0,-d/2-.085,.39),.18,'roof')
        b.box((0,-d/2-.025,wall_top+.105),(.19,.115,.19),'wall')
        window(b,0,-d/2-.089,wall_top+.047,.11,.14,False)
        b.xz_shape([(-.125,0),(0,.11),(.125,0),(.125,-.025),(-.125,-.025)],(0,-d/2-.026,wall_top+.20),.18,'roof')
    if name=='shop':
        awning(b,-d/2-.015,.39,.76)
        b.box((-.19,-d/2-.042,.21),(.25,.027,.18),'recess')
        b.box((-.19,-d/2-.064,.18),(.26,.071,.035),'wood_light')
        for x in (-.27,-.19,-.11):b.sphere((x,-d/2-.08,.217),(.035,.024,.023),'flower')
        b.rod((-.41,-d/2,.45),(-.41,-d/2-.13,.45),.011,'metal')
        b.box((-.41,-d/2-.13,.365),(.105,.025,.115),'wood')
        b.rod((-.443,-d/2-.148,.365),(-.38,-d/2-.148,.365),.009,'flower')
    if level>=2:
        for x in (-.30,.30):pot(b,x,-d/2-.05,size=.038)
    root=b.finish();root['region']='alpine';root['reference']=str(REFERENCE['alpine'].relative_to(ROOT));root['family']=name;root['level']=level
    return root


def hip_roof(b,w,d,z,height=.22,slate=False):
    """Four sloping surfaces with geometric tile courses, not a recoloured gable."""
    rings=[(w*.5,d*.5,0),(w*.49,d*.49,.025),(w*.34,d*.34,height*.90),(w*.25,d*.25,height)] if slate else [(w*.5,d*.5,0),(w*.49,d*.49,.022),(.025,.025,height)]
    verts=[(sx*rw,sy*rd,z+rz) for rw,rd,rz in rings for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    faces=[(0,3,2,1)]+[(r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for r in range(len(rings)-1) for i in range(4)]
    faces.append(tuple((len(rings)-1)*4+i for i in range(4)));b.poly(verts,faces,'roof')
    lower=[Vector(p) for p in verts[4:8]]
    # Mansard tiles follow the steep actual lower roof facet; the upper cap is
    # separate. A single lower-to-apex interpolation would sink through it.
    upper=[Vector(p) for p in (verts[-8:-4] if slate else verts[-4:])]
    for side in range(4):
        a,c=lower[side],lower[(side+1)%4];aa,cc=upper[side],upper[(side+1)%4]
        columns=max(6,round((c-a).length/.10));courses=5
        for row in range(courses):
            t0=row/courses;t1=min(1,(row+1.08)/courses)
            for col in range(columns):
                vv=[]
                for t in (t0,t1):
                    left=a.lerp(aa,t);right=c.lerp(cc,t)
                    for k in range(4):
                        u=(col+k/3)/columns;p=left.lerp(right,u)
                        p.z+=.008+.006*(1-(t-t0)/(t1-t0))+(0 if slate else math.sin(k*math.pi/3)*.009)
                        vv.append(tuple(p))
                b.poly(vv,[(k,k+1,k+5,k+4) for k in range(3)],'roof_edge' if (row+col)%7==0 else 'roof',not slate)
        b.rod(tuple(a+Vector((0,0,.008))),tuple(aa+Vector((0,0,.01))),.013,'roof_edge')
    b.box((0,0,z-.014),(w+.025,d+.025,.03),'trim')


def dome(b,x,y,z,radius,height,material='roof'):
    n=20;rings=7
    vv=[(x+radius*math.cos(j*math.pi/(rings*2))*math.cos(i*math.tau/n),
         y+radius*math.cos(j*math.pi/(rings*2))*math.sin(i*math.tau/n),z+height*math.sin(j*math.pi/(rings*2)))
        for j in range(rings+1) for i in range(n)]
    b.poly(vv,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)],material,True)
    rib_segments=5
    for i in range(8):
        angle=i*math.tau/8
        for j in range(rib_segments):
            a=j*math.pi/(rib_segments*2);c=(j+1)*math.pi/(rib_segments*2)
            b.rod((x+radius*math.cos(a)*math.cos(angle),y+radius*math.cos(a)*math.sin(angle),z+height*math.sin(a)),
                  (x+radius*math.cos(c)*math.cos(angle),y+radius*math.cos(c)*math.sin(angle),z+height*math.sin(c)),.006,'roof_edge',6)
    b.cylinder((x,y,z-.01),radius*1.04,.035,'trim',20)
    b.cylinder((x,y,z+height+.025),.012,.05,'metal',10,top=.004)
    if material=='glass':
        for angle in (math.pi/6,math.pi/3):
            rr=radius*math.cos(angle);zz=z+height*math.sin(angle)
            for i in range(16):
                a=i*math.tau/16;c=(i+1)*math.tau/16
                b.rod((x+rr*math.cos(a),y+rr*math.sin(a),zz),(x+rr*math.cos(c),y+rr*math.sin(c),zz),.007,'wood_light',6)


def iron_balcony(b,x,y,z,width=.22):
    b.box((x,y-.052,z),(width+.035,.12,.03),'trim')
    for zz in (z+.035,z+.145):b.rod((x-width/2,y-.105,zz),(x+width/2,y-.105,zz),.007,'metal')
    for i in range(6):
        xx=x-width/2+i*width/5
        b.rod((xx,y-.105,z+.035),(xx,y-.105,z+.15),.006,'metal')
        if i in (1,4):b.sphere((xx,y-.105,z+.083),(.013,.006,.025),'metal',6,4)
    for side in (-1,1):b.rod((x+side*width/2,y-.105,z+.145),(x+side*width/2,y,z+.145),.007,'metal')
    b.box((x,y-.13,z+.12),(width*.8,.04,.03),'wood')
    for dx in (-.055,0,.055):
        b.sphere((x+dx,y-.135,z+.151),(.033,.028,.023),'leaf',6,3)
        b.sphere((x+dx,y-.157,z+.164),(.014,.01,.012),'flower',6,3)


def latin_core(region,name,level,materials):
    b=Mesh(f'{region}_{name}_{level}',materials)
    w=.79 if name!='hotel' else .83;d=.66;floor=.355
    top=.065+level*floor;foundation(b,w,d)
    b.box((0,0,.065+level*floor/2),(w,d,level*floor),'wall')
    stone_course(b,w,d,.065,.13,2)
    for j in range(level):
        bottom=.065+j*floor
        for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
            with b.facing(angle):
                b.box((0,-depth/2-.018,bottom+floor-.008),(span+.055,.055,.033),'trim')
                for side in (-1,1):
                    for k in range(3):b.box((side*(span/2-.025),-depth/2-.017,bottom+.04+k*.11),(.066,.039,.079),'stone' if k%2 else 'trim')
                if angle in (0,math.pi):
                    if not (j==0 and name=='shop' and angle==0):
                        for x in (-.235,.235):window(b,x,-depth/2,bottom+.095,.125,.20,j>0,region=='harbor' or name in ('hotel','tower'))
                        if j==0:doorway(b,-depth/2,.17,.28)
                    if j>0 and (name in ('hotel','tower') or j==level-1):
                        if angle==0:
                            for x in (-.235,.235):iron_balcony(b,x,-depth/2,bottom+.06,.195)
                        elif j==level-1:iron_balcony(b,0,-depth/2,bottom+.06,.34)
                else:window(b,0,-depth/2,bottom+.095,.135,.20,j>0,region=='harbor')
    roof_h=.31 if region=='classic' else .21
    if region=='harbor' and name=='tower':
        # The Mediterranean residence trades the house roof for a roof garden
        # and timber pergola, preserving the sheet's distinct terrace silhouette.
        b.box((0,0,top+.025),(w+.08,d+.08,.055),'trim')
        for side in (-1,1):b.box((side*w/2,0,top+.09),(.045,d+.04,.11),'stone')
        b.box((0,d/2,top+.09),(w,.045,.11),'stone')
        with b.at((-.15,-.025,top+.055)):
            for x in (-.16,.16):
                for y in (-.20,.20):b.box((x,y,.13),(.025,.025,.26),'wood')
            for i in range(5):b.box((-.19+i*.095,0,.27),(.028,.48,.025),'wood_light')
            for y in (-.20,.20):b.box((0,y,.245),(.42,.027,.035),'wood')
        iron_balcony(b,0,-d/2+.07,top+.025,.58)
    else:
        hip_roof(b,w+.11,d+.10,top+.018,roof_h,slate=region=='classic')
        chimney(b,-w*.29,d*.22,top+roof_h*.66,.17)
    if region=='classic':
        for x in (-.19,.19):
            b.box((x,-d*.40,top+.13),(.18,.17,.23),'wall')
            window(b,x,-d/2-.023,top+.05,.115,.18,False,True)
            b.xz_shape([(-.115,0),(0,.085),(.115,0),(.115,-.025),(-.115,-.025)],(x,-d*.40,top+.25),.21,'roof')
            for side in (-1,1):b.rod((x+side*.115,-d/2-.047,top+.25),(x,-d/2-.047,top+.335),.009,'trim')
        if name=='tower' and level>=2:
            b.cylinder((0,-d*.31,top-.08),.185,.32,'wall',24)
            window(b,0,-d*.31-.188,top-.18,.14,.23,False,True)
            dome(b,0,-d*.31,top+.065,.205,.27)
    elif name in ('tower','hotel') and level>=2:
        x=.23;y=.12
        b.box((x,y,top+.18),(.215,.22,.36),'wall')
        b.arch(x,y-.119,top+.11,.108,.19,'recess',.018)
        b.arch(x,y-.13,top+.12,.075,.15,'glass',.012)
        dome(b,x,y,top+.36,.15,.14)
    if name=='shop':
        # Different shopfront architecture, not only a roof-palette variation.
        b.box((0,-d/2-.025,.255),(.75,.04,.33),'accent')
        b.box((0,-d/2-.051,.255),(.69,.025,.275),'recess')
        for x in (-.235,.235):
            b.box((x,-d/2-.067,.265),(.275,.018,.245),'water')
            b.box((x,-d/2-.08,.13),(.29,.055,.045),'wood')
        for x in (-.375,-.09,.09,.375):b.box((x,-d/2-.082,.255),(.024,.03,.32),'accent')
        b.box((0,-d/2-.072,.225),(.145,.025,.29),'accent')
        b.box((0,-d/2-.089,.26),(.105,.014,.17),'water')
        b.sphere((.04,-d/2-.103,.19),(.009,.007,.009),'metal')
        awning(b,-d/2-.025,.43,.77,'accent')
        b.box((0,-d/2-.045,.465),(.78,.045,.072),'accent')
        b.box((0,-d/2-.071,.465),(.62,.009,.014),'metal')
    if name=='hotel':
        for x in (-.14,.14):b.cylinder((x,-d/2-.067,.21),.021,.29,'trim',12)
        b.box((0,-d/2-.075,.375),(.36,.16,.045),'trim')
        if region=='harbor':
            for x in (-.25,0,.25):
                with b.at((x,-d/2-.055,.065)):arch_opening(b,.17,.29,.07,'trim',.035,False)
    if level>=2:
        for x in (-.33,.33):pot(b,x,-d/2-.05,size=.035)
    root=b.finish();root['region']=region;root['reference']=str(REFERENCE[region].relative_to(ROOT));root['family']=name;root['level']=level
    return root


def lattice(b,x,y,z,w=.20,h=.22,lite=False):
    b.box((x,y,z+h/2),(w+.04,.022 if lite else .03,h+.04),'wood')
    b.box((x,y-.019,z+h/2),(w,.016,h),'glass')
    for i in range(6):
        xx=x-w/2+i*w/5
        b.box((xx,y-.033,z+h/2),(.010,.019,h+.015),'wood')
    for k in range(3):b.box((x,y-.035,z+k*h/2),(w+.02,.02,.012),'wood_light')
    b.box((x,y-.03,z-.022),(w+.07,.07,.022 if lite else .027),'wood')


def japanese_eaves(b,w,d,z,depth=.115,pitch=.056):
    # Individual ceramic rolls at the edge of the low, wide machiya eaves.
    for angle in (0,math.pi):
        with b.facing(angle):
            a=-d/2+.02;edge=a-depth
            b.poly([(-w/2,a,z),(w/2,a,z),(w/2,edge,z-.055),(-w/2,edge,z-.055)],[(3,2,1,0)],'roof')
            count=round(w/pitch)
            for i in range(count+1):
                xx=-w/2+i*w/count
                b.rod((xx,a,z+.006),(xx,edge,z-.045),.009,'roof_edge',8)
            b.box((0,edge,z-.065),(w+.02,.028,.035),'wood')


def japanese_core(name,level,materials):
    b=Mesh(f'compact_{name}_{level}',materials)
    w=.80;d=.64;floor=.395;top=.065+level*floor
    foundation(b,w,d)
    b.box((0,0,.065+level*floor/2),(w,d,level*floor),'wall')
    for j in range(level):
        z=.065+j*floor
        for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
            with b.facing(angle):
                for zz in (z+.025,z+floor-.02):b.box((0,-depth/2-.018,zz),(span+.035,.043,.035),'wood')
                for x in (-span*.46,0,span*.46):b.box((x,-depth/2-.012,z+floor/2),(.035,.038,floor),'wood')
                if angle in (0,math.pi):
                    for x in (-.205,.205):lattice(b,x,-depth/2-.015,z+.095,.28,.22)
                else:lattice(b,0,-depth/2-.015,z+.095,.25,.22)
                # Wood skirt panels with visible joints, typical of machiya fronts.
                for x in (-span*.35,-span*.18,span*.18,span*.35):
                    b.box((x,-depth/2-.026,z+.052),(.11,.025,.055),'wood_light')
        if j>0:
            japanese_eaves(b,w+.08,d,z+.035,.10)
            if name in ('hotel','tower'):
                balcony(b,.66,-d/2,z+.025,False)
    with b.facing(math.pi/2):gable_roof(b,d+.13,w+.018,top+.025,.19 if name!='tower' else .14)
    if name=='shop':
        b.box((0,-d/2-.061,.34),(.69,.035,.045),'wood')
        for i in range(5):
            x=(i-2)*.12
            b.box((x,-d/2-.072,.26),(.113,.016,.14),'accent')
            b.rod((x,-d/2-.083,.28),(x,-d/2-.087,.28),.018,'trim',12)
        b.box((-.36,-d/2-.11,.28),(.065,.025,.21),'wood_light')
        for i in range(3):b.box((-.36,-d/2-.128,.22+i*.055),(.035,.006,.018),'wood')
        japanese_eaves(b,w+.08,d,.425,.13)
    elif name=='hotel':
        for x in (-.16,.16):b.box((x,-d/2-.12,.20),(.03,.03,.27),'wood')
        japanese_eaves(b,.41,d+.17,.40,.075)
        for x in (-.28,.28):
            b.rod((x,-d/2-.09,.31),(x,-d/2-.09,.39),.006,'metal')
            b.sphere((x,-d/2-.09,.28),(.035,.031,.055),'flower',12,6)
            b.box((x,-d/2-.09,.23),(.037,.04,.009),'wood')
    elif name=='tower' and level>=2:
        # The reference residence has an open lookout, not a taller scaled roof.
        with b.at((.20,.04,top+.24)):
            for x in (-.10,.10):
                for y in (-.10,.10):b.box((x,y,.085),(.025,.025,.17),'wood')
            with b.facing(math.pi/2):gable_roof(b,.26,.26,.17,.10)
            for y in (-.10,.10):
                b.box((0,y,.055),(.23,.024,.025),'wood_light')
    for x in (-.33,.33):pot(b,x,-d/2-.055,size=.034)
    root=b.finish();root['region']='compact';root['reference']=str(REFERENCE['compact'].relative_to(ROOT));root['family']=name;root['level']=level
    return root


def deco_window(b,x,y,z,w=.13,h=.27):
    b.box((x,y-.01,z+h/2),(w+.026,.03,h+.035),'stone')
    b.box((x,y-.029,z+h/2),(w,.014,h),'recess')
    for i in range(3):b.box((x,y-.041,z+(i+.5)*h/3),(w-.018,.012,h/3-.018),'glass')
    b.box((x,y-.047,z+h/2),(.008,.016,h),'metal')
    b.box((x,y-.037,z-.021),(w+.04,.065,.025),'trim')


def deco_crown(b,w,d,z,height=.14):
    for i in range(3):
        inset=i*.045
        b.box((0,0,z+.035+i*.045),(w-inset*2,d-inset*2,.07),'stone' if i<2 else 'roof')
        for y in (-1,1):b.box((0,y*(d/2-inset),z+.071+i*.045),(w-inset*2,.022,.025),'trim')
    for x in (-w*.25,0,w*.25):b.box((x,-d/2+.038,z+height/2),(.025,.03,height),'wood_light')


def fire_escape(b,w,d,floors,floor):
    for j in range(1,floors):
        z=.065+j*floor+.025;y=d/2+.075
        b.box((0,y,z),(.48,.13,.022),'metal')
        for x in (-.22,.22):b.rod((x,y+.055,z),(x,y+.055,z+.13),.006,'metal')
        b.rod((-.23,y+.055,z+.13),(.23,y+.055,z+.13),.007,'metal')
        for i in range(8):
            xx=-.21+i*.06
            b.rod((xx,y+.055,z+.025),(xx,y+.055,z+.13),.0045,'metal',6)
        sign=1 if j%2 else -1
        for side in (-1,1):
            b.rod((sign*.17+side*.035,y+.008,z),(sign*-.17+side*.035,y+.008,z-floor+.03),.0055,'metal')
        for i in range(7):
            zz=z-i*floor/7;xx=sign*(.17-i*.34/7)
            b.rod((xx-.042,y,zz),(xx+.042,y,zz),.005,'metal')


def deco_core(name,level,materials):
    b=Mesh(f'expansion_{name}_{level}',materials)
    w=.80;d=.66;floor=.42;top=.065+level*floor
    foundation(b,w,d)
    for j in range(level):
        bottom=.065+j*floor
        inset=.055 if j==2 and name in ('tower','hotel') else 0
        ww=w-inset*2;dd=d-inset*2
        b.box((0,0,bottom+floor/2),(ww,dd,floor),'wall')
        for angle,span,depth in ((0,ww,dd),(math.pi,ww,dd),(math.pi/2,dd,ww),(math.pi*1.5,dd,ww)):
            with b.facing(angle):
                for x in (-span*.45,0,span*.45):
                    b.box((x,-depth/2-.017,bottom+floor/2),(.038,.048,floor+.02),'stone')
                    b.box((x,-depth/2-.044,bottom+floor-.045),(.021,.018,.09),'wood_light')
                for x in (-span*.23,span*.23):deco_window(b,x,-depth/2,bottom+.09,.115 if inset else .14,.27)
                for row in range(3):
                    z=bottom+.045+row*.12
                    for x in (-span*.35,span*.10):b.box((x,-depth/2-.007,z),(.09,.012,.012),'trim' if row==0 else 'stone')
                b.box((0,-depth/2-.014,bottom+.012),(span+.035,.045,.028),'stone')
    deco_crown(b,w-(.11 if level==3 and name in ('hotel','tower') else 0),d-(.11 if level==3 and name in ('hotel','tower') else 0),top,.18)
    # A narrow vertical front entry survives the lowest-phone view.
    b.box((0,-d/2-.035,.225),(.21,.05,.32),'trim')
    b.box((0,-d/2-.067,.21),(.15,.018,.27),'recess')
    for x in (-.041,.041):b.box((x,-d/2-.079,.215),(.066,.015,.235),'glass')
    b.box((0,-d/2-.09,.055),(.29,.13,.035),'stone')
    if name=='shop':
        for x in (-.245,.245):
            b.box((x,-d/2-.03,.23),(.22,.043,.29),'accent')
            b.box((x,-d/2-.058,.235),(.17,.014,.23),'glass')
        b.box((0,-d/2-.095,.405),(.84,.16,.055),'accent')
        b.box((0,-d/2-.184,.389),(.82,.025,.026),'wood_light')
    elif name=='hotel':
        b.box((0,-d/2-.096,.403),(.43,.17,.055),'accent')
        for i in range(7):b.sphere((-.18+i*.06,-d/2-.186,.399),(.011,.009,.011),'flower',6,4)
        for x in (-.125,.125):b.box((x,-d/2-.055,.27),(.024,.03,.27),'wood_light')
        b.box((0,-d/2-.06,top+.05),(.24,.05,.19),'stone')
        b.box((0,-d/2-.089,top+.08),(.08,.016,.14),'wood_light')
    elif name=='tower':
        for i in range(3):
            b.box((0,0,top+.14+i*.055),(.35-i*.08,.31-i*.055,.065),'roof' if i==2 else 'trim')
        b.rod((0,0,top+.27),(0,0,top+.39),.009,'wood_light')
    else:
        b.box((.18,.07,top+.16),(.22,.21,.14),'wall')
        b.box((.18,.07,top+.24),(.25,.24,.035),'roof')
    fire_escape(b,w,d,level,floor)
    root=b.finish();root['region']='expansion';root['reference']=str(REFERENCE['expansion'].relative_to(ROOT));root['family']=name;root['level']=level
    return root


def regional_roof(b,region,w,d,z,height=.20):
    if region=='compact':
        with b.facing(math.pi/2):gable_roof(b,d,w,z,height)
    elif region=='alpine':gable_roof(b,w,d,z,height)
    elif region=='expansion':
        deco_crown(b,w,d,z,height)
    else:hip_roof(b,w,d,z,height,region=='classic')


def regional_shell(b,region,w,d,height,floors=1,roof=True,balconies=False,large=False):
    """Distinct four-sided regional construction for public buildings and wings."""
    b.box((0,0,height/2),(w,d,height),'wall')
    storey=height/floors
    stone_course(b,w,d,.015,min(.20,storey*.45),1 if large else 2)
    for j in range(floors):
        z=j*storey
        for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
            with b.facing(angle):
                if region in ('compact','alpine'):
                    for x in (-span/2+.025,span/2-.025):b.box((x,-depth/2-.012,z+storey/2),(.035,.033,storey),'wood')
                    b.box((0,-depth/2-.018,z+storey-.015),(span+.025,.036,.03),'wood')
                elif region=='expansion':
                    for x in (-span*.44,0,span*.44):b.box((x,-depth/2-.016,z+storey/2),(.035,.035,storey+.01),'stone')
                else:
                    b.box((0,-depth/2-.012,z+storey-.012),(span+.045,.04,.035),'trim')
                    for side in (-1,1):
                        for k in range(2 if large else 3):b.box((side*(span/2-.02),-depth/2-.012,z+.055+k*storey*.42),(.06,.029,.06),'stone')
                count=2 if span>.62 else 1
                for i in range(count):
                    xx=(i-(count-1)/2)*min(.30,span*.45)
                    if region=='compact':lattice(b,xx,-depth/2-.014,z+.10,min(.20,span*.35),min(.25,storey-.13),large)
                    elif region=='expansion':deco_window(b,xx,-depth/2,z+.09,.115,min(.28,storey-.13))
                    else:window(b,xx,-depth/2,z+.10,.115,min(.22,storey-.14),region in ('alpine','harbor') and j>0 and (not large or angle==0),region in ('harbor','classic'),large)
                if balconies and j>0 and angle in (0,math.pi):
                    if region in ('compact','alpine'):balcony(b,span*.84,-depth/2,z+.025,region=='alpine')
                    else:
                        for i in range(count):iron_balcony(b,(i-(count-1)/2)*min(.30,span*.45),-depth/2,z+.045,.18)
        if region=='compact' and j>0:japanese_eaves(b,w+.04,d,z+.02,.06,.08 if large else .056)
    if roof:regional_roof(b,region,w+.06,d+.04,height+.018,.20)


def clock_face(b,x,y,z,radius=.11,coin=False,information=False):
    b.rod((x,y+.015,z),(x,y-.025,z),radius*1.15,'wood_light',24)
    b.rod((x,y-.025,z),(x,y-.032,z),radius,'trim' if not coin else 'accent',24)
    if coin:
        for xx,zz in ((-.035,0),(.035,0),(0,.048)):
            b.rod((x+xx,y-.039,z+zz),(x+xx,y-.05,z+zz),radius*.32,'wood_light',16)
    elif information:
        b.box((x,y-.045,z-.01),(.022,.012,radius*1.0),'accent')
        b.sphere((x,y-.048,z+radius*.65),(.017,.008,.017),'accent')
    else:
        for i in range(12):
            a=i*math.tau/12
            b.rod((x+radius*.75*math.sin(a),y-.04,z+radius*.75*math.cos(a)),
                  (x+radius*.90*math.sin(a),y-.04,z+radius*.90*math.cos(a)),.004,'metal',6)
        b.rod((x,y-.044,z),(x-radius*.45,y-.044,z+radius*.25),.006,'metal')
        b.rod((x,y-.044,z),(x+radius*.17,y-.044,z+radius*.65),.005,'metal')


def belfry(b,region,z,w=.24):
    for x in (-w*.40,w*.40):
        for y in (-w*.40,w*.40):b.box((x,y,z+.10),(.027,.027,.20),'wood' if region in ('alpine','compact') else 'trim')
    b.cylinder((0,0,z+.105),.057,.09,'wood_light',16,top=.028)
    b.sphere((0,0,z+.047),(.012,.012,.012),'metal')
    if region in ('classic','expansion'):dome(b,0,0,z+.20,w*.64,.12)
    else:regional_roof(b,region,w+.075,w+.075,z+.21,.13)


def arch_opening(b,width,height,depth,material='stone',thickness=.085,soft=True):
    radius=width/2;spring=height-radius
    for side in (-1,1):b.box((side*(radius+thickness/2),0,spring/2),(thickness,depth,spring),material)
    for i in range(12):
        a=i*math.pi/12;c=(i+1)*math.pi/12
        points=[(radius*math.cos(a),spring+radius*math.sin(a)),
                ((radius+thickness)*math.cos(a),spring+(radius+thickness)*math.sin(a)),
                ((radius+thickness)*math.cos(c),spring+(radius+thickness)*math.sin(c)),
                (radius*math.cos(c),spring+radius*math.sin(c))]
        b.xz_shape(points,(0,0,0),depth,material,soft)


def bench(b,x,y,z=.065,width=.28):
    for xx in (x-width*.36,x+width*.36):b.box((xx,y,z+.075),(.025,.085,.15),'metal')
    for row in range(3):b.box((x,y-.038+row*.035,z+.12),(width,.027,.025),'wood_light')
    for row in range(2):b.box((x,y+.055,z+.20+row*.035),(width,.025,.025),'wood')


def public_building(region,name,materials):
    b=Mesh(f'{region}_{name}',materials);w=.74;d=.64;body=.68
    foundation(b,.87,.78)
    wheel_position=None;crane_position=None
    if name=='teleport_gate':
        # A traversable centre arch, flanked by two architecturally finished piers.
        for x in (-.335,.335):
            with b.at((x,0,.065)):
                regional_shell(b,region,.24,.52,.66,1,False)
                regional_roof(b,region,.29,.57,.68,.15)
        if region in ('classic','expansion'):
            for y in (-.20,.20):
                with b.at((0,y,.065)):arch_opening(b,.45,.72,.03,'metal',.025)
            for y in (-.21,.21):
                for i in range(8):
                    x=-.27+i*.077;z=.87+.07*(1-(x/.27)**2)
                    b.box((x,y,z),(.016,.035,.13),'wood_light' if region=='expansion' else 'metal')
            for i in range(8):
                x=-.28+i*.07;xx=x+.07
                zz=.87+.10*(1-(x/.28)**2);zzz=.87+.10*(1-(xx/.28)**2)
                b.poly([(x,-.23,zz),(xx,-.23,zzz),(xx,.23,zzz),(x,.23,zz)],[(0,1,2,3)],'water')
            clock_face(b,0,-.235,.87,.075)
        else:
            with b.at((0,0,.065)):arch_opening(b,.45,.64,.43,'stone' if region!='compact' else 'wood',.06)
            regional_roof(b,region,.98,.66,.82,.20)
            if region=='harbor':
                with b.at((0,.04,.99)):regional_shell(b,region,.26,.26,.19,1,True)
    elif name=='chance_wheel':
        with b.at((-.11,0,.065)):
            for x in (-.27,.27):
                for y in (-.25,.25):b.cylinder((x,y,.30),.022,.60,'wood' if region in ('alpine','compact') else 'trim',12)
            b.box((0,.22,.29),(.54,.07,.58),'wall')
            b.box((0,-.23,.15),(.54,.07,.30),'wood')
            for x in (-.20,0,.20):b.box((x,-.27,.15),(.15,.017,.20),'accent')
            if region in ('classic','harbor','expansion'):dome(b,0,0,.62,.36,.24)
            else:regional_roof(b,region,.67,.62,.62,.25)
            if region=='compact':
                for x in (-.20,0,.20):b.box((x,-.27,.52),(.17,.016,.11),'flower')
            else:awning(b,-.27,.61,.66,'accent')
            for x in (-.24,.24):pot(b,x,-.27,size=.027)
        wheel_position=(.33,-.29,.37)
        for x in (.23,.43):b.rod((x,-.29,.08),(.33,-.29,.40),.018,'wood')
    else:
        if name in ('junction_hub','rush_station'):w=.61;d=.59;body=.53
        if name=='builders_guild':w=.66;body=.61
        with b.at((0,0,.065)):regional_shell(b,region,w,d,body,2 if body>.60 else 1,True,name=='card_pavilion')
        # Functional façade treatment overlays, but does not erase the designed back and sides.
        if region=='compact':
            lattice(b,0,-d/2-.025,.08,.26,.32)
        else:doorway(b,-d/2-.02,.19,.33)
        if name=='civic_hall':
            b.box((0,-.24,body+.11),(.27,.25,.34),'wall')
            clock_face(b,0,-.38,body+.14,.09)
            with b.at((0,-.24,0)):belfry(b,region,body+.28,.23)
            for x in (-.31,.31):
                b.box((x,-d/2-.05,.57),(.075,.018,.22),'accent')
                b.rod((x-.055,-d/2-.05,.69),(x+.055,-d/2-.05,.69),.008,'wood_light')
        elif name=='vault_bank':
            clock_face(b,0,-d/2-.06,.62,.105,coin=True)
            for x in (-.145,.145):
                b.cylinder((x,-d/2-.069,.25),.022,.34,'trim',12)
            b.box((0,-d/2-.07,.43),(.36,.14,.04),'trim')
        elif name=='builders_guild':
            b.box((0,-d/2-.034,.28),(.32,.025,.36),'recess')
            for x in (-.20,.20):b.box((x,-d/2-.055,.28),(.09,.027,.34),'wood')
            for i in range(3):b.box((-.29+i*.095,-d/2-.065,.10),(.08,.075,.07),'stone')
            b.box((.22,.05,.58),(.05,.06,1.02),'wood_light')
            b.rod((-.12,.05,1.05),(.48,-.18,1.11),.023,'wood_light')
            b.rod((.22,.05,.80),(.45,-.15,1.10),.016,'wood')
            crane_position=(.48,-.18,1.10)
            for i in range(4):b.box((-.24+i*.085,.36,.10),(.07,.14,.06),'wood_light')
        elif name=='card_pavilion':
            awning(b,-d/2-.03,.44,.70,'accent')
            for i,angle in enumerate((-.16,0,.16)):
                # Cards are geometrically inset plaques; emblems avoid tiny generated text.
                with b.at(((i-1)*.105,-d/2-.045,.72)):
                    b.box((0,0,0),(.13,.022,.19),'trim',angle)
                    b.xz_shape([(0,-.045),(-.045,.005),(-.043,.035),(-.02,.047),(0,.026),(.02,.047),(.043,.035),(.045,.005)],(0,-.019,.01),.008,'flower')
            for x in (-.29,.29):
                b.box((x,-d/2-.05,.20),(.12,.04,.22),'wood')
                for z in (.14,.21,.28):b.box((x,-d/2-.078,z),(.095,.017,.026),'trim')
        elif name=='rush_station':
            clock_face(b,0,-d/2-.045,.67,.095)
            for x in (-.36,.36):
                b.cylinder((x,-.35,.29),.016,.46,'metal' if region in ('classic','expansion') else 'wood',10)
            b.box((0,-.36,.53),(.84,.26,.035),'roof')
            bench(b,-.23,.36,width=.31)
            if region=='compact':
                b.box((.16,-.35,.18),(.24,.12,.21),'flower')
                b.box((.16,-.415,.22),(.19,.018,.09),'glass')
        elif name=='junction_hub':
            clock_face(b,0,-d/2-.04,.65,.085,information=True)
            b.box((-.12,-d/2-.055,.30),(.23,.03,.26),'wood')
            b.box((-.12,-d/2-.074,.30),(.19,.012,.22),'trim')
            b.rod((-.19,-d/2-.085,.22),(-.07,-d/2-.085,.36),.012,'accent')
            b.box((.40,-.04,.43),(.032,.032,.76),'wood')
            for i in range(3):
                pts=[(-.13,-.035),(.09,-.035),(.14,0),(.09,.035),(-.13,.035)]
                b.xz_shape(pts,(.36,-.065,.59-i*.10),.023,'wood_light')
            bench(b,0,.35,width=.34)
        if name not in ('builders_guild','junction_hub'):
            for x in (-.34,.34):pot(b,x,-d/2-.045,size=.033)
    root=b.finish();root['region']=region;root['reference']=f'art/regions/references/{region}-public-three-views.png';root['family']=name;root['level']=0
    if wheel_position:
        rotor=bpy.data.objects.new(f'{region}_life_wheel_rotor',None);bpy.context.collection.objects.link(rotor);rotor.parent=root;rotor.location=wheel_position;rotor['lifePart']='wheel'
        part=Mesh(f'{region}_wheel_rotor_mesh',materials)
        part.rod((0,.019,0),(0,-.020,0),.195,'wood_light',32)
        for i in range(12):
            a=i*math.tau/12;c=(i+1)*math.tau/12
            part.poly([(0,-.027,0),(.174*math.sin(a),-.027,.174*math.cos(a)),(.174*math.sin(c),-.027,.174*math.cos(c))],[(0,2,1)],'accent' if i%2 else 'flower')
            part.rod((0,-.033,0),(.177*math.sin(a),-.033,.177*math.cos(a)),.005,'wood_light')
        part.rod((0,-.035,0),(0,-.054,0),.035,'metal',16);part.finish(rotor)
    if crane_position:
        pendulum=bpy.data.objects.new(f'{region}_life_crane_pendulum',None);bpy.context.collection.objects.link(pendulum);pendulum.parent=root;pendulum.location=crane_position;pendulum['lifePart']='pendulum'
        part=Mesh(f'{region}_crane_load',materials);part.rod((0,0,0),(0,0,-.25),.005,'metal')
        part.box((0,0,-.29),(.10,.10,.09),'wood_light')
        for x in (-.035,.035):part.box((x,-.055,-.29),(.009,.012,.10),'wood')
        part.finish(pendulum)
    return root


def large_building(region,name,level,materials):
    b=Mesh(f'{region}_{name}_{level}',materials)
    foundation(b,2.42,.94,.07)
    floors=level;storey=.385;top=.085+floors*storey
    center_top=top+(.26 if name=='skyscraper' else .12 if name=='finance' else .05)
    centre_y=.15 if name=='onsen' else .055
    centre_d=.48 if name=='onsen' else .70
    # Three articulated volumes: centre and true wings, never one stretched house.
    for x in (-.80,.80):
        with b.at((x,.07,.085)):
            regional_shell(b,region,.71,.65,floors*storey,floors,True,name=='skyscraper' and level<=2,True)
    with b.at((0,centre_y,.085)):
        regional_shell(b,region,.78,centre_d,center_top-.085,floors,region not in ('harbor','expansion') or name=='skyscraper',False,True)
    # Front-to-back circulation is legible; the rear remains fully windowed.
    for x in (-.38,.38):
        b.box((x,-.317,top*.52),(.065,.075,top-.06),'stone' if region!='compact' else 'wood')
    for angle in (0,math.pi):
        with b.facing(angle):
            door_y=(centre_y-centre_d/2 if angle==0 else -centre_y-centre_d/2) if name=='onsen' else -.33
            if region=='compact':lattice(b,0,door_y-.03,.085,.25,.30)
            else:doorway(b,door_y,.20,.34)
            for x in (-1.12,1.12):pot(b,x,-.38,.07,size=.045)
    if name=='onsen':
        # The shallow courtyard pool is the distinguishing playable landmark.
        b.box((0,-.405,.093),(.92,.30,.055),'stone')
        b.box((0,-.405,.125),(.82,.23,.022),'water')
        for x in (-.46,.46):b.box((x,-.405,.14),(.055,.32,.055),'trim')
        for y in (-.55,-.27):b.box((0,y,.14),(.96,.04,.055),'trim')
        if region=='alpine':
            for x in (-.43,-.24,.24,.43):b.sphere((x,-.54,.14),(.09,.045,.065),'stone',8,5)
            with b.at((0,centre_y-centre_d/2-.025,center_top)):
                b.xz_shape([(-.32,0),(0,.23),(.32,0)],(0,0,0),.08,'wall')
                for side in (-1,1):b.rod((side*.32,-.05,0),(0,-.05,.23),.018,'wood')
        elif region=='compact':
            for x in (-.45,.45):b.sphere((x,-.49,.18),(.12,.07,.10),'stone',8,5)
            for i in range(7):
                xx=-.26+i*.087;zz=.19+.06*(1-(xx/.26)**2)
                b.box((xx,-.44,zz),(.08,.17,.022),'wood_light')
            for yy in (-.525,-.355):
                for i in range(6):
                    a=-.28+i*.112;c=a+.112
                    b.rod((a,yy,.29+.06*(1-(a/.28)**2)),(c,yy,.29+.06*(1-(c/.28)**2)),.012,'flower')
            if level>=2:
                with b.at((0,centre_y,center_top+.16)):regional_shell(b,region,.38,.34,.24,1,True)
        elif region=='harbor':
            dome(b,0,centre_y,center_top,.34,.36)
            with b.at((0,centre_y,0)):belfry(b,region,center_top+.36,.14)
            b.rod((0,-.30,.15),(0,-.30,.41),.035,'trim',16)
            b.cylinder((0,-.30,.33),.13,.025,'water',24)
        elif region=='classic':
            dome(b,0,centre_y,center_top+.14,.25,.25)
            b.cylinder((0,-.40,.15),.13,.04,'trim',24)
            b.cylinder((0,-.40,.18),.105,.012,'water',24)
            b.cylinder((0,-.40,.27),.018,.19,'trim',12)
            b.cylinder((0,-.40,.32),.06,.025,'trim',16)
            for x in (-.7,.7):
                b.box((x,-.41,.14),(.32,.17,.12),'leaf')
        else:
            # Copper-ribbed conservatory is different from the clock exchange.
            dome(b,0,centre_y,center_top,.33,.26,'glass')
            for x in (-1.00,1.00):
                with b.at((x,.07,top+.08)):deco_crown(b,.35,.38,0,.20)
    elif name=='finance':
        if region in ('alpine','classic'):
            b.box((0,-.11,center_top+.13),(.30,.31,.39),'wall')
            clock_face(b,0,-.275,center_top+.14,.11)
            if region=='alpine':regional_roof(b,region,.38,.39,center_top+.33,.25)
            else:dome(b,0,-.11,center_top+.34,.22,.20)
        elif region=='compact':
            with b.at((0,.055,center_top+.13)):regional_shell(b,region,.41,.38,.27,1,True)
            for x in (-.91,0,.91):
                b.box((x,-.345,.42),(.17,.022,.27),'accent')
                clock_face(b,x,-.366,.46,.048,coin=True)
        elif region=='harbor':
            dome(b,0,.055,center_top+.02,.38,.31)
            b.xz_shape([(-.33,0),(0,.19),(.33,0)],(0,-.345,center_top-.10),.09,'trim')
            for x in (-.27,.27):b.cylinder((x,-.355,center_top*.46),.028,center_top-.17,'trim',12)
        else:
            for x in (-.80,.80):
                with b.at((x,.07,top+.07)):
                    b.box((0,0,.16),(.40,.42,.32),'wall');deco_crown(b,.44,.46,.32,.20)
                    for xx in (-.16,.16):b.box((xx,-.235,.22),(.035,.04,.45),'trim')
            clock_face(b,0,-.32,center_top+.06,.105)
            for x in (-.26,-.10,.10,.26):b.cylinder((x,-.36,.39),.022,.57,'trim',12)
            deco_crown(b,.79,.72,center_top,.14)
        for x in (-.43,.43):
            b.box((x,-.35,.56),(.10,.018,.27),'accent')
            b.rod((x-.065,-.35,.71),(x+.065,-.35,.71),.008,'wood_light')
    else:
        # Each grand hotel follows the reference's signature skyline.
        if region=='alpine':
            hh=.29
            pts=[(-.39,0),(.39,0),(.39,.06),(.27,.06),(.27,.13),(.15,.13),(.15,.22),(.055,.22),(.055,hh),(-.055,hh),(-.055,.22),(-.15,.22),(-.15,.13),(-.27,.13),(-.27,.06),(-.39,.06)]
            b.xz_shape(pts,(0,-.315,center_top),.035,'wall')
            for j in range(1,level+1):balcony(b,.59,-.33,.08+j*(center_top-.085)/(level+1),j<level)
        elif region=='compact':
            with b.at((0,.055,center_top+.14)):
                regional_shell(b,region,.40,.38,.28,1,True)
                balcony(b,.48,-.20,.04,False)
        elif region=='classic':
            for x in (-.98,.98):
                b.cylinder((x,.03,top-.02),.20,.34,'wall',24)
                dome(b,x,.03,top+.15,.23,.32)
            for j in range(1,level+1):iron_balcony(b,0,-.34,.09+j*(center_top-.085)/(level+1),.38)
        elif region=='harbor':
            x=1.03;y=.07
            b.cylinder((x,y,top+.05),.15,.50,'wall',20)
            b.cylinder((x,y,top+.31),.19,.045,'trim',20)
            for i in range(8):
                a=i*math.tau/8
                b.rod((x+.17*math.cos(a),y+.17*math.sin(a),top+.32),(x+.17*math.cos(a),y+.17*math.sin(a),top+.47),.007,'metal')
            dome(b,x,y,top+.50,.15,.14)
            for j in range(1,level+1):iron_balcony(b,0,-.34,.09+j*(center_top-.085)/(level+1),.42)
        else:
            # Successive occupied setbacks and planted terraces create the Deco skyline.
            for x in (-.12,.12):b.box((x,-.317,center_top/2),(.025,.035,center_top),'wood_light')
            for tier in range(level+1):
                ww=.69-tier*.11;dd=.61-tier*.06;zz=center_top+.07+tier*.13
                b.box((0,.04,zz),(ww,dd,.19),'wall')
                for x in (-ww*.40,0,ww*.40):b.box((x,.04-dd/2-.018,zz),(.026,.035,.21),'trim')
                b.box((0,.04,zz+.11),(ww+.035,dd+.035,.035),'roof')
                for x in (-ww*.35,ww*.35):b.sphere((x,.04-dd/2+.045,zz+.15),(.05,.035,.025),'leaf')
            b.rod((0,.04,center_top+.21+level*.13),(0,.04,center_top+.39+level*.13),.012,'wood_light')
        for x in (-.19,.19):b.box((x,-.405,.29),(.035,.04,.39),'wood' if region in ('compact','alpine') else 'trim')
        b.box((0,-.40,.50),(.49,.22,.045),'roof')
        if region in ('classic','harbor'):dome(b,0,-.34,.52,.20,.11)
    root=b.finish();root['region']=region;root['reference']=f'art/regions/references/{region}-landmarks-three-views.png';root['family']=name;root['level']=level
    return root


def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):bpy.data.materials.remove(material)


def verify_primitive_winding(materials):
    # Back-face culling in glTF must not turn foliage into an inside-out shell.
    # Test the primitive surfaces independently of Blender's two-sided preview.
    checks=(lambda mesh:mesh.sphere((0,0,0),(1,1,1),'wall'),
            lambda mesh:mesh.box((0,0,0),(1,1,1),'wall'),
            lambda mesh:mesh.cylinder((0,0,0),.5,1,'wall'))
    for create in checks:
        mesh=Mesh('winding_check',materials);create(mesh)
        for face in mesh.faces:
            points=[Vector(mesh.vertices[i]) for i in face]
            normal=(points[1]-points[0]).cross(points[2]-points[0])
            if normal.length<1e-8:continue
            centre=sum(points,Vector())/len(points)
            if normal.dot(centre)<=0:raise RuntimeError('Primitive winding faces inward')


def reviewed_ai_house(region):
    """Keep the reviewed Pixal mesh, UVs and embedded PBR textures intact.

    Blender's glTF importer converts Y-up / front +Z into Z-up / front -Y.
    Normalisation is uniform and occurs in child transforms, leaving the named
    gameplay root at identity with its origin on the ground.
    """
    path=ROOT/'assets/models/regions-ai'/f'{region}_house.glb'
    registry=ART/'approved-ai-houses.json'
    approved=json.loads(registry.read_text(encoding='utf8')).get('houses',{}).get(region,{}) if registry.exists() else {}
    if not path.exists():AI_STATUS[region]='not_generated';return None
    source_hash=hashlib.sha256(path.read_bytes()).hexdigest()
    if approved.get('status')!='ready_for_runtime' or approved.get('sha256')!=source_hash:
        AI_STATUS[region]='awaiting_visual_approval'
        print(f'AI_HOUSE_PENDING {region}: keep authored villa_2 until the exact source hash is approved',flush=True)
        return None
    AI_STATUS[region]='approved_exact_source'
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=set(bpy.data.objects)-before
    tops=[obj for obj in imported if obj.parent not in imported]
    bpy.context.view_layer.update()
    points=[obj.matrix_world@Vector(corner) for obj in imported if obj.type=='MESH' for corner in obj.bound_box]
    if not points:raise RuntimeError(f'AI source has no geometry: {path}')
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    size=hi-lo
    scale=min(1.15/size.z,1.025/size.x,1.025/size.y)
    centre=Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z))
    transform=Matrix.Diagonal((scale,scale,scale,1))@Matrix.Translation(-centre)
    root=bpy.data.objects.new(f'{region}_villa_2',None);bpy.context.collection.objects.link(root)
    for obj in tops:
        world=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=transform@world
    root['region']=region;root['family']='villa';root['level']=2
    root['front']='Blender -Y / glTF +Z';root['origin']='ground centre'
    root['reference']=f'art/regions/references/{region}-core-three-views.png'
    root['sourceType']='reviewed_pixal_multiview';root['sourceFile']=str(path.relative_to(ROOT)).replace('\\','/')
    root['sourceSha256']=source_hash
    root['budgetException']='Reviewed AI mesh retained without decimation; use at limited villa_2 locations and verify mobile frame time.'
    root['normalisationScale']=scale
    bpy.context.view_layer.update()
    return root


def asset_stats(root):
    bpy.context.view_layer.update()
    points=[];triangles=0
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    source={'kind':root.get('sourceType','blender_three_view'),'reference':root.get('reference')}
    for key in ('sourceFile','sourceSha256','budgetException','normalisationScale','aiHouseStatus'):
        if key in root:source[key]=root[key]
    return {'name':root.name,'bounds':{'min':lo,'max':hi},'size':[hi[i]-lo[i] for i in range(3)],'triangles':triangles,'source':source}


def validate(roots):
    records=[]
    for root in roots:
        info=asset_stats(root);family=root.get('family');sx,sy,sz=info['size']
        limit=(2.7,1.15,2.6) if family in LARGE else (1.12,1.12,1.5) if family in PUBLIC else (1.05,1.05,1.85)
        if any(v>cap+.001 for v,cap in zip((sx,sy,sz),limit)):
            raise RuntimeError(f'{root.name}: exceeds playable bounds {info["size"]} > {limit}')
        cap=250000 if root.get('sourceType')=='reviewed_pixal_multiview' else 35000 if family in LARGE else 23000
        if info['triangles']>cap:
            raise RuntimeError(f'{root.name}: too many triangles {info["triangles"]}')
        records.append(info)
    return records


def export(region,roots,records,suffix=''):
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive:child.select_set(True)
    temporary=OUT/f'.{region}{suffix}.building.glb'
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,
                              export_yup=True,export_apply=True,export_extras=True,export_animations=False)
    temporary.replace(OUT/f'{region}{suffix}.glb')
    (OUT/f'{region}{suffix}-manifest.json').write_text(json.dumps({'region':region,'reference':str(REFERENCE[region].relative_to(ROOT)),
        'assets':records},ensure_ascii=False,indent=2),encoding='utf8')


def preview(region,roots,resolution,kind='core',suffix=''):
    # One coherent scale reveals actual level growth. No per-model auto-framing.
    scene=bpy.context.scene
    columns=4 if kind=='public' else 3
    rows=math.ceil(len(roots)/columns)
    spacing=2.9 if kind=='large' else 1.55
    for i,root in enumerate(roots):root.location=(i%columns*spacing-(columns-1)*spacing/2,-(i//columns)*1.75,0)
    floor_mat=bpy.data.materials.new('Preview warm ivory');floor_mat.diffuse_color=(.80,.78,.70,1)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));floor=bpy.context.object;floor.data.materials.append(floor_mat)
    world=bpy.data.worlds.new('Regional studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.76,.82,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.25
    center=Vector((0,-(rows-1)*.875,.55))
    for name,pos,power,size in [('Key',(-3,-6,9),650,5),('Fill',(6,-2,5),180,5),('Rim',(-1,6,7),400,5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=Vector(pos)+center
        obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Regional presentation');camera=bpy.data.objects.new('Regional presentation',camera_data);scene.collection.objects.link(camera)
    camera.location=center+Vector((5,-12,9));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';scene.camera=camera
    bpy.context.view_layer.update()
    projection=camera.matrix_world.inverted()
    corners=[projection @ (obj.matrix_world @ Vector(corner)) for root in roots for obj in root.children_recursive if obj.type=='MESH' for corner in obj.bound_box]
    cx=(min(p.x for p in corners)+max(p.x for p in corners))/2;cy=(min(p.y for p in corners)+max(p.y for p in corners))/2
    camera.location+=camera.matrix_world.to_3x3() @ Vector((cx,cy,0))
    camera_data.ortho_scale=max((max(p.x for p in corners)-min(p.x for p in corners)),(max(p.y for p in corners)-min(p.y for p in corners))/.90)*1.12
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.3
    scene.render.resolution_x=resolution;scene.render.resolution_y=round(resolution*.90);scene.render.resolution_percentage=100
    directory=ART/'renders';directory.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(directory/f'{region}-{kind}{suffix}-isometric.png');bpy.ops.render.render(write_still=True)
    for obj in [floor,camera]+[obj for obj in list(scene.objects) if obj.type=='LIGHT']:bpy.data.objects.remove(obj,do_unlink=True)
    for root in roots:root.location=(0,0,0)


def main():
    args=arguments()
    if not args.ai_house and not args.output_suffix:args.output_suffix='-manual'
    for region in REGIONS if args.map=='all' else (args.map,):
        if not REFERENCE[region].exists():raise RuntimeError(f'Reference sheet must be reviewed first: {REFERENCE[region]}')
        reset();materials=make_materials(region);verify_primitive_winding(materials);roots=[]
        for family in FAMILIES:
            for level in (1,2,3):
                legacy=f'{family}_{level}'
                if args.asset and args.asset!=legacy:continue
                if args.scope not in ('core','all'):continue
                ai_root=reviewed_ai_house(region) if args.ai_house and family=='villa' and level==2 else None
                if ai_root is not None:root=ai_root
                elif region=='alpine':root=alpine_core(family,level,materials)
                elif region in ('classic','harbor'):root=latin_core(region,family,level,materials)
                elif region=='compact':root=japanese_core(family,level,materials)
                else:root=deco_core(family,level,materials)
                if family=='villa' and level==2:root['aiHouseStatus']=AI_STATUS.get(region,'not_requested')
                roots.append(root)
        for family in LARGE:
            for level in (1,2,3):
                if args.scope not in ('large','all') or (args.asset and args.asset!=f'{family}_{level}'):continue
                if not (ART/'references'/f'{region}-landmarks-three-views.png').exists():raise RuntimeError(f'Missing {region} landmarks reference')
                roots.append(large_building(region,family,level,materials))
        for family in PUBLIC:
            if args.scope not in ('public','all') or (args.asset and args.asset!=family):continue
            if not (ART/'references'/f'{region}-public-three-views.png').exists():raise RuntimeError(f'Missing {region} public reference')
            roots.append(public_building(region,family,materials))
        records=validate(roots)
        suffix=args.output_suffix or (f'-{args.asset}' if args.asset else f'-{args.scope}' if args.scope!='all' else '')
        export(region,roots,records,suffix)
        print('REGIONAL_KIT',json.dumps({'region':region,'assets':len(roots),'triangles':[r['triangles'] for r in records]}),flush=True)
        if args.preview:
            for kind,families in (('core',FAMILIES),('large',LARGE),('public',PUBLIC)):
                if args.preview_set!='all' and kind!=args.preview_set:continue
                selected=[root for root in roots if root.get('family') in families]
                if not selected:continue
                for root in roots:
                    for child in root.children_recursive:child.hide_render=root not in selected
                preview(region,selected,args.resolution,kind,args.output_suffix or (f'-{args.asset}' if args.asset else ''))


if __name__=='__main__':main()
