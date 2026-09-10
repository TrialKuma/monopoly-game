"""Build the original Town of Fortune miniature kit using Blender only.

Run: blender --background --factory-startup --python art/build_city_kit.py
All geometry and materials are authored here; no downloaded assets or textures.
Blender Z-up / front -Y; the standard glTF exporter converts to Y-up / front +Z.
"""
import bpy
import math
import os
import json
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'models'
PREVIEW = Path(os.environ.get('CITY_PREVIEW_DIR', str(ROOT / 'art')))
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)

def linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + .055) / 1.055) ** 2.4

def material(name, color, rough=.55, metallic=0, emission=0):
    rgb = tuple(linear(int(color[i:i+2],16)/255) for i in (0,2,4))
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metallic
    if emission:
        p.inputs['Emission Color'].default_value=(*rgb,1)
        p.inputs['Emission Strength'].default_value=emission
    return m

M={
 'plaster':material('Warm ivory plaster','F2DFBA'),
 'stone':material('Carved limestone','D6C49E'),
 'white':material('Porcelain trim','FFF1D5'),
 'roof':material('Glazed terracotta','C3664D',.38),
 'roof_dark':material('Terracotta ridge','964537',.44),
 'glass':material('Deep petrol window glass','285D67',.24,.22),
 'glass_light':material('Soft teal architectural glass','79AFAB',.27,.18),
 'shadow':material('Window recesses','173F49'),
 'teal':material('Emerald shopfront enamel','28786F',.4),
 'gold':material('Satin brass','D7A956',.3,.62),
 'rose':material('Dusty rose stucco','DDA191'),
 'rose_dark':material('Hotel accent blush','BC786C'),
 'leaf':material('Garden jade','458A66'),
 'leaf_light':material('Leaf sage highlights','80AD70'),
 'wood':material('Warm walnut','795640'),
 'light':material('Warm lit glass','FFDC8F',.35,0,.3),
 'water':material('Fountain turquoise enamel','62BFC1',.2,.28),
 'steel':material('Graphite ironwork','3A5159',.36,.3),
 'crane':material('Ochre crane enamel','E5B752',.4),
 'purple':material('Fortune amethyst enamel','8270A7',.4),
}
MATS=list(M.values())
IDX={k:MATS.index(v) for k,v in M.items()}

class Builder:
    def __init__(self,name): self.name=name; self.v=[]; self.f=[]; self.mi=[]; self.sm=[]
    def poly(self,verts,faces,mat,smooth=False):
        o=len(self.v); self.v.extend(verts)
        for face in faces:
            self.f.append(tuple(o+i for i in face)); self.mi.append(IDX[mat]); self.sm.append(smooth)
    def box(self,p,s,mat,rot=0):
        x,y,z=p; a,b,c=[t/2 for t in s]; co,si=math.cos(rot),math.sin(rot)
        vs=[]
        for xx,yy,zz in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]:
            vs.append((x+xx*co-yy*si,y+xx*si+yy*co,z+zz))
        self.poly(vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],mat)
    def cylinder(self,p,r,h,mat,n=16,r2=None):
        x,y,z=p; r2=r if r2 is None else r2
        vs=[(x+rr*math.cos(i*2*math.pi/n),y+rr*math.sin(i*2*math.pi/n),z+zz) for rr,zz in ((r,-h/2),(r2,h/2)) for i in range(n)]
        fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.poly(vs,fs,mat,True)
    def sphere(self,p,s,mat,n=10,rings=6):
        x,y,z=p; sx,sy,sz=s
        vs=[]
        for j in range(rings+1):
            a=math.pi*j/rings
            for i in range(n):
                b=2*math.pi*i/n
                vs.append((x+sx*math.sin(a)*math.cos(b),y+sy*math.sin(a)*math.sin(b),z+sz*math.cos(a)))
        fs=[]
        for j in range(rings):
            for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        self.poly(vs,fs,mat,True)
    def rod(self,p1,p2,r,mat,n=8):
        a,b=Vector(p1),Vector(p2); axis=(b-a).normalized()
        aux=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0))
        u=axis.cross(aux).normalized();v=axis.cross(u).normalized()
        vs=[tuple(p+r*(math.cos(i*2*math.pi/n)*u+math.sin(i*2*math.pi/n)*v)) for p in (a,b) for i in range(n)]
        self.poly(vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,True)
    def roof(self,x,y,z,w,d,h):
        vs=[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x+w/2,y+d/2,z),(x-w/2,y+d/2,z),(x-w/2,y,z+h),(x+w/2,y,z+h)]
        self.poly(vs,[(0,3,2,1),(0,1,5,4),(2,3,4,5),(0,4,3),(1,2,5)],'roof')
        self.rod((x-w/2-.01,y,z+h),(x+w/2+.01,y,z+h),.012,'roof_dark')
        for side in (-1,1):
            for t in (.30,.60,.90):
                yy=y+side*d*.5*t; zz=z+h*(1-t)+.002
                self.rod((x-w/2,yy,zz),(x+w/2,yy,zz),.003,'roof_dark',6)
        self.box((x,y,z-.007),(w+.015,d+.015,.02),'white')
    def front_window(self,x,y,z,w=.085,h=.105,shutter=False):
        self.box((x,y,z),(w+.020,.019,h+.023),'white')
        self.box((x,y-.012,z),(w,.012,h),'glass')
        self.box((x,y-.02,z),(.007,.006,h),'stone')
        self.box((x,y-.02,z),(w,.006,.008),'stone')
        self.box((x,y-.022,z-h/2-.014),(w+.034,.038,.012),'white')
        if shutter:
            for side in (-1,1):
                self.box((x+side*(w*.5+.024),y-.005,z),(.026,.018,h+.008),'teal')
                for dz in (-.024,0,.024):self.box((x+side*(w*.5+.024),y-.016,z+dz),(.023,.005,.005),'glass_light')
    def side_window(self,x,y,z,w=.080,h=.105):
        self.box((x,y,z),(.016,w+.02,h+.023),'white')
        self.box((x+math.copysign(.012,x),y,z),(.012,w,h),'glass')
        self.box((x+math.copysign(.021,x),y,z),(.007,.007,h),'stone')
    def door(self,x,y,z=.095,w=.075,h=.145,mat='teal'):
        self.box((x,y,z),(w+.025,.025,h+.025),'white')
        self.box((x,y-.016,z),(w,.015,h),mat)
        self.box((x,y-.027,z+.025),(w-.023,.008,h*.35),'glass')
        self.sphere((x+w*.25,y-.035,z-.022),(.005,.005,.005),'gold',8,4)
    def planter(self,x,y,z=0,size=.038):
        self.cylinder((x,y,z+size*.6),size*.8,size*1.2,'roof',12,r2=size)
        self.sphere((x,y,z+size*2),(size*1.3,size*1.3,size*1.3),'leaf',8,5)
        self.sphere((x+.012,y-.006,z+size*2.7),(size*.65,size*.6,size*.55),'leaf_light',8,4)
    def balcony(self,x,y,z,w=.18,d=.07):
        self.box((x,y,z),(w,d,.017),'white')
        front=y-d/2
        self.rod((x-w/2,front,z+.067),(x+w/2,front,z+.067),.004,'gold')
        for i in range(6):
            xx=x-w/2+w*i/5
            self.rod((xx,front,z+.013),(xx,front,z+.068),.0025,'gold',6)
    def finalize(self,pos):
        mesh=bpy.data.meshes.new(self.name+'_mesh');mesh.from_pydata(self.v,[],self.f);mesh.materials.clear()
        for m in MATS:mesh.materials.append(m)
        for p,i,sm in zip(mesh.polygons,self.mi,self.sm):p.material_index=i;p.use_smooth=sm
        mesh.update()
        root=bpy.data.objects.new(self.name,None);bpy.context.collection.objects.link(root);root.location=pos
        ob=bpy.data.objects.new(self.name+'_geometry',mesh);bpy.context.collection.objects.link(ob);ob.parent=root
        bevel=ob.modifiers.new('Hand finished miniature edges','BEVEL');bevel.width=.0035;bevel.segments=1;bevel.limit_method='ANGLE';bevel.angle_limit=.65
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        try:
            normal=ob.modifiers.new('Architectural weighted normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
            bpy.ops.object.modifier_apply(modifier=normal.name)
        except Exception:pass
        ob.select_set(False)
        root['asset_family']=self.name.rsplit('_',1)[0];root['units']='metres';root['front']='local -Y (glTF +Z)'
        return root

def villa(level):
    b=Builder('villa_'+str(level));w=.49 if level<3 else .55;d=.39; body=.235+(level-1)*.165
    b.box((0,0,.018),(w+.05,d+.05,.036),'stone')
    b.box((0,0,body/2+.035),(w,d,body),'plaster')
    b.box((0,0,body+.038),(w+.025,d+.022,.023),'white')
    for floor in range(level):
        z=.15+floor*.165
        for xx in (-.155,.155):b.front_window(xx,-d/2-.008,z,.075,.10,True)
        for xx in (-w/2-.006,w/2+.006):
            for yy in (-.09,.09):b.side_window(xx,yy,z,.072,.10)
        if floor>0:b.front_window(0,-d/2-.009,z,.072,.10)
    b.door(0,-d/2-.018,.108,.070,.145)
    for n in range(3):b.box((0,-d/2-.035-n*.021,.015+n*.008),(.13,.085-n*.022,.018),'stone')
    b.roof(0,0,body+.058,w+.065,d+.065,.13)
    b.box((.17,.075,body+.17),(.065,.065,.16),'stone');b.box((.17,.075,body+.254),(.079,.079,.019),'white')
    if level>1:b.balcony(0,-d/2-.052,.21,.165,.09)
    if level==3:
        b.box((-.17,-.014,body+.09),(.105,.13,.105),'plaster')
        b.roof(-.17,-.022,body+.144,.14,.15,.08)
        b.front_window(-.17,-.09,body+.102,.045,.052)
    b.planter(-.29,-.17,0,.029);b.planter(.29,-.17,0,.029)
    return b

def shop(level):
    b=Builder('shop_'+str(level));w=.59;d=.40;body=.255+(level-1)*.188
    b.box((0,0,.021),(w+.045,d+.04,.042),'stone')
    b.box((0,0,body/2+.025),(w,d,body),'plaster')
    b.box((0,-.207,.14),(w-.044,.022,.212),'teal')
    for xx in (-.19,.19):
        b.box((xx,-.224,.125),(.145,.012,.14),'white');b.box((xx,-.234,.125),(.124,.011,.12),'glass')
        b.box((xx,-.243,.126),(.006,.006,.115),'gold')
    b.door(0,-.23,.115,.075,.168,'teal')
    # A proper striped sloping fabric awning, with a scalloped lower edge.
    for i in range(10):
        xx=-.2925+.0325+i*.058
        b.poly([(xx-.029,-.216,.239),(xx+.029,-.216,.239),(xx+.029,-.31,.203),(xx-.029,-.31,.203)],[(0,3,2,1)],'teal' if i%2==0 else 'white')
        b.box((xx,-.31,.192),(.058,.011,.025),'teal' if i%2==0 else 'white')
    for floor in range(1,level):
        z=.335+(floor-1)*.188
        for xx in (-.19,0,.19):b.front_window(xx,-.211,z,.095,.12)
        for xx in (-.303,.303):
            for yy in (-.10,.10):b.side_window(xx,yy,z,.083,.12)
        b.box((0,0,z-.09),(.617,.423,.022),'white')
    b.box((0,0,body+.045),(.63,.442,.043),'white')
    b.box((0,0,body+.07),(.56,.37,.035),'teal')
    for yy in (-.18,.18):b.box((0,yy,body+.092),(.58,.025,.055),'white')
    for xx in (-.285,.285):b.box((xx,0,body+.092),(.025,.36,.055),'white')
    b.box((0,-.224,.272),(.24,.03,.061),'teal')
    # Abstract brass storefront crest.
    for xx in (-.055,0,.055):b.cylinder((xx,-.24,.276),.014,.014,'gold',8)
    if level==3:
        b.box((.16,.055,body+.125),(.19,.18,.12),'glass_light')
        b.box((.16,.055,body+.19),(.22,.21,.015),'gold')
    b.planter(-.30,-.282,0,.025);b.planter(.30,-.282,0,.025)
    return b

def hotel(level):
    b=Builder('hotel_'+str(level));w=.61;d=.42;body=.25+(level-1)*.215
    b.box((0,0,.024),(.66,.47,.048),'stone')
    b.box((0,0,body/2+.045),(w,d,body),'rose')
    for xx in (-w/2+.024,w/2-.024):b.box((xx,-.218,body/2+.055),(.039,.025,body+.017),'white')
    for floor in range(level):
        z=.155+floor*.205
        for xx in (-.21,.21):b.front_window(xx,-.22,z,.08,.105)
        if floor:b.front_window(0,-.22,z,.085,.115);b.balcony(0,-.265,z-.073,.195,.083)
        for xx in (-.315,.315):
            for yy in (-.105,.10):b.side_window(xx,yy,z,.083,.105)
        b.box((0,0,z+.08),(.63,.448,.018),'white')
    b.door(0,-.23,.12,.09,.17,'glass')
    b.box((0,-.282,.23),(.24,.14,.026),'gold')
    for xx in (-.104,.104):b.rod((xx,-.332,.035),(xx,-.332,.221),.007,'gold')
    b.box((0,0,body+.071),(.67,.48,.044),'white')
    b.box((0,0,body+.092),(.61,.42,.024),'rose_dark')
    for yy in (-.216,.216):b.box((0,yy,body+.126),(.63,.024,.06),'white')
    for xx in (-.313,.313):b.box((xx,0,body+.126),(.024,.42,.06),'white')
    if level==3:
        b.box((0,.055,body+.135),(.28,.20,.042),'white');b.box((0,.055,body+.16),(.242,.165,.016),'water')
        for xx in (-.235,.235):b.box((xx,0,body+.13),(.075,.145,.027),'teal')
        b.box((0,-.197,body+.202),(.2,.02,.088),'rose_dark')
        for xx in (-.056,0,.056):b.sphere((xx,-.217,body+.21),(.015,.007,.015),'gold',8,4)
    else:
        b.box((0,.065,body+.133),(.235,.18,.07),'rose_dark');b.box((0,.065,body+.173),(.26,.205,.014),'gold')
    b.planter(-.278,-.286,0,.030);b.planter(.278,-.286,0,.030)
    return b

def tower(level):
    b=Builder('tower_'+str(level));height=(.43,.68,.96)[level-1]
    b.box((0,0,.025),(.65,.53,.05),'stone')
    b.box((0,0,.11),(.60,.47,.15),'white')
    for xx in (-.21,0,.21):
        b.box((xx,-.244,.115),(.155,.014,.12),'glass')
        b.box((xx,-.255,.115),(.009,.009,.12),'gold')
    b.box((0,-.282,.18),(.30,.095,.015),'gold')
    w=.45;d=.35;floors=2+level*2;step=(height-.22)/floors
    b.box((0,.015,(height+.18)/2),(w,d,height-.18),'glass')
    for i in range(floors+1):
        z=.195+i*step
        b.box((0,.015,z),(w+.024,d+.024,.017),'white')
        if i<floors:
            for xx in (-.15,-.05,.05,.15):
                b.box((xx,-.166,z+step/2),(.086,.009,step-.023),'glass_light' if (i+int(xx*100))%3 else 'glass')
            for yy in (-.09,.02,.13):
                b.box((.232,yy,z+step/2),(.008,.094,step-.023),'glass_light')
    for xx in (-.232,.232):
        for yy in (-.17,.20):b.box((xx,yy,(height+.18)/2),(.014,.014,height-.18),'gold')
    b.box((0,.015,height+.012),(.49,.395,.027),'gold')
    b.box((.06,.04,height+.045),(.21,.19,.048),'teal')
    if level==3:
        b.box((.06,.04,height+.078),(.17,.15,.019),'white');b.rod((.06,.04,height+.09),(.06,.04,height+.18),.006,'gold')
    b.planter(-.29,-.22,0,.027);b.planter(.29,-.22,0,.027)
    return b

def civic():
    b=Builder('city_hall')
    for i in range(3):b.box((0,-.025,.012+i*.018),(.80-i*.055,.56-i*.04,.023),'stone')
    b.box((0,.018,.24),(.65,.38,.37),'plaster')
    b.box((0,0,.426),(.72,.45,.045),'white')
    for xx in (-.245,-.082,.082,.245):
        b.cylinder((xx,-.213,.24),.024,.30,'white',12)
        for z in (.083,.395):b.cylinder((xx,-.213,z),.034,.022,'gold',12)
    for xx in (-.24,0,.24):b.front_window(xx,-.177,.255,.08,.15)
    b.door(0,-.225,.17,.075,.20)
    b.roof(0,.02,.45,.73,.43,.105)
    b.cylinder((0,.04,.60),.12,.14,'white',16)
    b.sphere((0,.04,.68),(.139,.139,.12),'teal',20,10)
    b.cylinder((0,.04,.805),.027,.04,'gold',12,r2=.011)
    b.rod((0,.04,.82),(0,.04,.91),.005,'gold')
    b.box((.045,.04,.879),(.085,.008,.048),'teal')
    # Clock on the façade above the portico.
    b.sphere((0,-.215,.453),(.054,.010,.054),'gold',16,8)
    b.sphere((0,-.228,.453),(.043,.006,.043),'white',16,8)
    b.rod((0,-.236,.454),(0,-.236,.482),.003,'steel')
    b.rod((0,-.236,.454),(.022,-.236,.442),.003,'steel')
    b.planter(-.37,-.19,0,.035);b.planter(.37,-.19,0,.035)
    return b

def bank():
    b=Builder('bank');b.box((0,0,.045),(.73,.53,.09),'stone');b.box((0,.04,.24),(.59,.35,.34),'plaster')
    for i in range(3):b.box((0,-.23-i*.028,.018+i*.015),(.55,.13-i*.02,.025),'white')
    for xx in (-.23,-.078,.078,.23):
        b.cylinder((xx,-.205,.25),.027,.32,'white',12)
        for z in (.09,.41):b.box((xx,-.205,z),(.072,.072,.023),'gold')
    b.door(0,-.142,.205,.10,.22,'glass')
    b.box((0,-.025,.443),(.70,.49,.045),'white')
    b.roof(0,-.01,.471,.74,.50,.15)
    # Coin-shaped raised vault seal.
    b.sphere((0,-.274,.491),(.065,.015,.065),'gold',20,10)
    b.box((0,-.293,.491),(.012,.01,.078),'white')
    for dz in (-.02,.02):b.box((0,-.292,.491+dz),(.045,.01,.01),'white')
    for xx in (-.3,.3):b.planter(xx,-.29,0,.03)
    return b

def construction():
    b=Builder('construction');b.box((.055,0,.02),(.55,.47,.04),'stone')
    for z in (.10,.285,.47):
        b.box((.075,.04,z),(.42,.32,.03),'plaster')
    for xx in (-.12,.27):
        for yy in (-.10,.18):b.box((xx,yy,.285),(.028,.028,.37),'stone')
    b.box((.07,.183,.19),(.40,.025,.145),'roof')
    # Open lattice tower crane, so this reads as a construction site at a glance.
    for xx in (-.292,-.228):
        for yy in (.09,.154):b.rod((xx,yy,.035),(xx,yy,.72),.009,'crane')
    for i in range(7):
        z=.045+i*.10
        b.rod((-.292,.09,z),(-.228,.09,z+.10),.004,'crane')
        b.rod((-.228,.154,z),(-.292,.154,z+.10),.004,'crane')
        b.rod((-.292,.09,z),(-.292,.154,z+.10),.004,'crane')
    for z in (.70,.765):b.rod((-.36,.122,z),(.38,.122,z),.009,'crane')
    for i in range(8):
        xx=-.36+i*.0925;b.rod((xx,.122,.70),(xx+.0925,.122,.765),.004,'crane')
    b.box((-.26,.075,.684),(.13,.10,.10),'crane');b.box((-.26,.018,.692),(.086,.008,.056),'glass')
    b.rod((.22,.122,.70),(.22,.122,.36),.003,'steel')
    b.rod((.22,.122,.36),(.243,.122,.34),.006,'gold')
    for xx in (-.15,0,.15):
        b.box((xx,-.25,.075),(.125,.025,.08),'crane')
        b.box((xx,-.267,.075),(.025,.008,.08),'white',-.4)
    return b

def card_station():
    b=Builder('card_station');b.box((0,0,.025),(.60,.48,.05),'stone');b.box((0,.02,.22),(.40,.30,.34),'purple')
    for xx in (-.207,.207):b.box((xx,.02,.22),(.025,.33,.36),'gold')
    b.box((0,-.14,.235),(.28,.018,.22),'white');b.box((0,-.154,.235),(.25,.012,.19),'shadow')
    b.box((0,-.204,.16),(.37,.11,.027),'gold')
    b.box((0,.02,.411),(.50,.40,.048),'gold');b.roof(0,.02,.44,.54,.43,.095)
    # Three oversized fortune cards stand above the kiosk.
    for i in (-1,0,1):
        x=i*.086;z=.605-abs(i)*.025
        b.box((x,.02,z),(.112,.031,.16),'white',i*.15)
        b.box((x,-.004,z),(.082,.013,.126),'purple',i*.15)
        b.sphere((x,-.015,z),(.022,.008,.028),'gold',8,4)
    b.planter(-.25,-.15,0,.035);b.planter(.25,-.15,0,.035)
    return b

def tree():
    b=Builder('tree');b.cylinder((0,0,.12),.023,.24,'wood',10)
    for x,y,z,s in [(-.06,0,.265,.095),(.065,.018,.285,.10),(0,-.04,.34,.11),(0,.035,.405,.085)]:
        b.sphere((x,y,z),(s,s*.9,s),'leaf' if z<.33 else 'leaf_light',10,6)
    b.cylinder((0,0,.011),.085,.022,'stone',16)
    return b

def lamp():
    b=Builder('streetlamp');b.cylinder((0,0,.018),.035,.036,'steel',12);b.cylinder((0,0,.18),.012,.34,'steel',12,r2=.008)
    b.rod((0,0,.31),(0,0,.375),.008,'gold');b.box((0,0,.397),(.059,.059,.075),'light')
    for x in (-.031,.031):
        for y in (-.031,.031):b.rod((x,y,.352),(x,y,.44),.0035,'steel')
    b.cylinder((0,0,.347),.045,.016,'steel',4);b.cylinder((0,0,.445),.05,.025,'steel',4,r2=0)
    return b

def fountain():
    b=Builder('fountain');b.cylinder((0,0,.025),.27,.05,'stone',32);b.cylinder((0,0,.071),.235,.065,'white',32)
    b.cylinder((0,0,.108),.214,.012,'water',32);b.cylinder((0,0,.152),.047,.105,'white',16)
    b.cylinder((0,0,.214),.134,.035,'white',24,r2=.15);b.cylinder((0,0,.234),.13,.01,'water',24)
    b.cylinder((0,0,.274),.028,.08,'gold',12);b.sphere((0,0,.324),(.032,.032,.034),'gold',12,6)
    for i in range(8):
        a=i*math.pi/4;x=.127*math.cos(a);y=.127*math.sin(a)
        b.rod((x,y,.218),(x*1.08,y*1.08,.114),.008,'water',8)
    return b

def plot():
    b=Builder('plot_0')
    for x in (-.087,.087):b.box((x,0,.104),(.013,.02,.208),'gold')
    b.box((0,-.006,.168),(.23,.034,.105),'teal');b.box((0,-.026,.17),(.204,.008,.079),'white')
    # House icon instead of a language-specific texture.
    b.box((0,-.034,.166),(.043,.007,.037),'teal')
    b.poly([(-.031,-.039,.183),(.031,-.039,.183),(0,-.039,.211)],[(0,1,2)],'roof')
    b.box((0,-.039,.158),(.011,.006,.021),'white')
    for x in (-.29,.29):
        for y in (-.21,.21):b.box((x,y,.011),(.027,.027,.022),'stone')
    return b

builders=[]
for family in (villa,shop,hotel,tower):
    for level in (1,2,3):builders.append(family(level))
builders.extend([civic(),bank(),construction(),card_station(),tree(),lamp(),fountain(),plot()])
roots=[]
for i,b in enumerate(builders):
    col=i%4;row=i//4
    roots.append(b.finalize(((col-1.5)*1.25,(row-2)*1.16,0)))
    print('BUILT',b.name,'source vertices',len(b.v),flush=True)

# Export only the reusable kit; preview props and lights never enter the GLB.
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for ob in root.children:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'city-kit.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)

manifest={}
for root in roots:
    verts=[v.co for ob in root.children if ob.type=='MESH' for v in ob.data.vertices]
    mins=[min(v[a] for v in verts) for a in range(3)];maxs=[max(v[a] for v in verts) for a in range(3)]
    manifest[root.name]={'width':round(maxs[0]-mins[0],4),'depth':round(maxs[1]-mins[1],4),'height':round(maxs[2],4),'base_z':round(mins[2],4)}
(OUT/'city-kit-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')

# A curated display board, studio lighting, and orthographic camera remain editable.
preview_mat=material('Preview deep petrol background','183941',.88)
base_mat=material('Preview ivory display plinth','E5D8BC',.8)
for i,root in enumerate(roots):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(root.location.x,root.location.y,-.07))
    ob=bpy.context.object;ob.name='Preview plinth '+root.name;ob.scale=(1.10,1.0,.13);ob.data.materials.append(base_mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=ob.modifiers.new('Soft board corners','BEVEL');mod.width=.035;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.145));bpy.context.object.name='Preview backdrop';bpy.context.object.data.materials.append(preview_mat)
scene=bpy.context.scene
world=bpy.data.worlds.new('Soft miniature studio') if not bpy.data.worlds else bpy.data.worlds[0]
scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.43,.57,.64,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-3,-4,7),900,5,(1.0,.86,.69))
area('Cool fill',(4,1,5),550,4,(.65,.85,1.0))
area('Soft edge',(0,5,6),700,3,(1.0,.93,.76))
data=bpy.data.cameras.new('City kit orthographic camera');cam=bpy.data.objects.new('City kit orthographic camera',data);scene.collection.objects.link(cam)
cam.location=(7,-9,10);target=Vector((0,0,.05));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=8.0;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW/'city-kit-preview.png')
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'city-kit.blend'))
bpy.ops.render.render(write_still=True)
print('CITY_KIT_COMPLETE',str(OUT/'city-kit.glb'),os.path.getsize(OUT/'city-kit.glb'),flush=True)
