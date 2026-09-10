"""Eight original toy-city landmarks, authored as real Blender mesh geometry.

Run Blender 5.2 --background --factory-startup --python art/build_specials.py
CITY_SPECIALS_PREVIEW_DIR optionally selects the contact-sheet/render directory.
No external images, texture files, font files, downloaded models, or old kit edits.
Local origin: bottom centre; Blender Z-up, front -Y; GLB exports Y-up/front +Z.
"""
import bpy
import math
import json
import os
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'models'
PREVIEW = Path(os.environ.get('CITY_SPECIALS_PREVIEW_DIR', str(ROOT / 'work' / 'city-specials-v2')))
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def material(name, color, rough=.4, metallic=0, emission=0):
    rgb = tuple(linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    if emission:
        p.inputs['Emission Color'].default_value = (*rgb, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'ivory': material('Specials porcelain ivory', 'FFF1CF', .36),
    'stone': material('Specials honey limestone', 'D9BE8D', .53),
    'cream': material('Specials warm marble edge', 'F8DFAD', .38),
    'gold': material('Specials satin golden brass', 'DCA326', .34, .35),
    'gold_dark': material('Specials aged gold recess', 'AC7630', .35, .4),
    'mint': material('Specials jade glazed dome', '198F89', .34, .08),
    'mint_light': material('Specials jade highlight', '6ABCAC', .34),
    'petrol': material('Specials deep enamel window', '224E61', .28, .2),
    'navy': material('Specials blue banner', '154F9C', .42),
    'purple': material('Specials velvet purple', '65349D', .4),
    'purple_light': material('Specials lavender enamel', '9A57CC', .36),
    'orange': material('Specials racing orange', 'E56E1E', .39),
    'yellow': material('Specials crane yellow', 'EDAA13', .38, .06),
    'steel': material('Specials blue grey steel', '324F62', .37, .2),
    'dark': material('Specials deep steel recess', '172B36', .43),
    'concrete': material('Specials pale construction concrete', 'B7BDBB', .6),
    'brick': material('Specials warm construction brick', 'C97955', .48),
    'red': material('Specials cherry card heart', 'D75062', .34),
    'leaf': material('Specials rounded jade shrub', '528A50', .5),
    'leaf_light': material('Specials spring shrub crown', '88B35D', .47),
    'soil': material('Specials planter soil', '7F6448', .6),
    'glow': material('Specials warm light', 'FFE39D', .35, 0, .45),
    'cyan': material('Specials portal cyan core', '55E0D7', .28, .05, 1.15),
    'water': material('Specials turquoise pool', '46B9C2', .25, .12),
}
MATS = list(M.values())
IDX = {k: MATS.index(v) for k, v in M.items()}

class Builder:
    def __init__(self, name):
        self.name=name; self.v=[]; self.f=[]; self.mi=[]; self.sm=[]
    def poly(self, vertices, faces, mat, smooth=False):
        offset=len(self.v); self.v.extend(tuple(v) for v in vertices)
        for f in faces:
            self.f.append(tuple(offset+i for i in f)); self.mi.append(IDX[mat]); self.sm.append(smooth)
    def merge(self, other, matrix=None):
        matrix=matrix or Matrix.Identity(4)
        offset=len(self.v); self.v.extend(tuple(matrix @ Vector(v)) for v in other.v)
        self.f.extend(tuple(offset+i for i in f) for f in other.f)
        self.mi.extend(other.mi); self.sm.extend(other.sm)
    def box(self, p, s, mat, angle=0):
        x,y,z=p; a,b,c=(i/2 for i in s); co,si=math.cos(angle),math.sin(angle)
        vs=[(x+xx*co-yy*si,y+xx*si+yy*co,z+zz) for xx,yy,zz in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]]
        self.poly(vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],mat)
    def cylinder(self, p, radius, height, mat, n=24, r2=None):
        r2=radius if r2 is None else r2
        x,y,z=p
        vs=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z+zz) for r,zz in [(radius,-height/2),(r2,height/2)] for i in range(n)]
        self.poly(vs,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,True)
    def rod(self, p1, p2, radius, mat, n=10):
        a,b=Vector(p1),Vector(p2); axis=(b-a).normalized()
        aux=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0))
        u=axis.cross(aux).normalized();v=axis.cross(u).normalized()
        vs=[tuple(p+radius*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for p in (a,b) for i in range(n)]
        self.poly(vs,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,True)
    def sphere(self,p,s,mat,n=16,rings=9):
        x,y,z=p; sx,sy,sz=s
        vs=[(x+sx*math.sin(math.pi*j/rings)*math.cos(i*math.tau/n),y+sy*math.sin(math.pi*j/rings)*math.sin(i*math.tau/n),z+sz*math.cos(math.pi*j/rings)) for j in range(rings+1) for i in range(n)]
        fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)]
        self.poly(vs,fs,mat,True)
    def torus(self,p,r,tube,mat,axis='Y',n=48,m=8,angle=0,start=0,end=math.tau):
        # Y rings lie in the front-facing XZ plane. angle yaws around world Z.
        x,y,z=p; co,si=math.cos(angle),math.sin(angle)
        vs=[]
        for i in range(n+1):
            a=start+(end-start)*i/n
            for j in range(m):
                b=j*math.tau/m
                xx=(r+tube*math.cos(b))*math.cos(a); zz=(r+tube*math.cos(b))*math.sin(a); yy=tube*math.sin(b)
                if axis=='Z': yy,zz=zz,yy
                vs.append((x+xx*co-yy*si,y+xx*si+yy*co,z+zz))
        self.poly(vs,[(i*m+j,i*m+(j+1)%m,(i+1)*m+(j+1)%m,(i+1)*m+j) for i in range(n) for j in range(m)],mat,True)
    def front_disc(self,p,r,depth,mat,n=40,angle=0):
        b=Builder('disc');b.cylinder((0,0,0),r,depth,mat,n)
        matrix=Matrix.Translation(Vector(p)) @ Matrix.Rotation(angle,4,'Z') @ Matrix.Rotation(math.pi/2,4,'X')
        self.merge(b,matrix)
    def xz_shape(self,points,p,depth,mat,angle=0):
        # A solid silhouette, extruded along Y. Rounded edges are applied at the end.
        x,y,z=p; co,si=math.cos(angle),math.sin(angle);count=len(points)
        vs=[]
        for yy in (-depth/2,depth/2):
            for xx,zz in points:vs.append((x+xx*co-yy*si,y+xx*si+yy*co,z+zz))
        self.poly(vs,[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)],mat)
    def star(self,p,r,mat,depth=.018,n=5):
        pts=[(math.cos(math.pi/2+i*math.pi/n)*r*(1 if i%2==0 else .45),math.sin(math.pi/2+i*math.pi/n)*r*(1 if i%2==0 else .45)) for i in range(n*2)]
        self.xz_shape(pts,p,depth,mat)
    def window(self,x,y,z,w=.075,h=.14,mat='petrol'):
        self.box((x,y,z),(w+.026,.024,h+.028),'cream')
        self.box((x,y-.017,z),(w,.014,h),mat)
        self.box((x,y-.027,z),(.008,.010,h),'gold')
        self.box((x,y-.027,z),(w,.010,.009),'gold')
    def door(self,x,y,z=.21,w=.13,h=.24):
        self.box((x,y,z),(w+.045,.044,h+.042),'gold')
        self.box((x,y-.027,z),(w,.02,h),'petrol')
        self.box((x,y-.044,z),(.009,.014,h),'gold')
        for side in (-1,1):self.sphere((x+side*.025,y-.056,z-.025),(.010,.008,.010),'gold',10,6)
    def stairs(self,x,y,z=.07,w=.42,steps=4):
        for i in range(steps):self.box((x,y-i*.035,z-i*.012),(w+i*.025,.068,.030),'ivory')
    def column(self,x,y,z,height,r=.035):
        self.cylinder((x,y,z+height/2),r,height,'ivory',16)
        for zz in [z+.017,z+height-.017]:self.cylinder((x,y,zz),r*1.38,.034,'gold',16)
        self.box((x,y,z+height+.004),(r*3,r*3,.025),'cream')
    def planter(self,x,y,z=.05,r=.045):
        self.box((x,y,z+.033),(r*1.8,r*1.8,.065),'cream')
        self.sphere((x,y,z+.11),(r,r,r*1.05),'leaf',12,7)
        self.sphere((x+.014,y-.008,z+.14),(r*.75,r*.75,r*.80),'leaf_light',12,7)
    def lamp(self,x,y,z=.04):
        self.cylinder((x,y,z+.02),.034,.04,'stone',12)
        self.cylinder((x,y,z+.11),.012,.18,'gold',10)
        self.box((x,y,z+.245),(.053,.053,.075),'glow')
        for xx in [-.031,.031]:
            for yy in [-.031,.031]:self.rod((x+xx,y+yy,z+.2),(x+xx,y+yy,z+.289),.004,'gold',6)
        self.cylinder((x,y,z+.3),.047,.038,'gold',4,r2=0)
    def base(self):
        self.box((0,0,.025),(1.02,1.02,.05),'stone')
        self.box((0,0,.056),(1.0,1.0,.018),'ivory')
        for side in [-1,1]:
            self.box((side*.455,0,.069),(.08,.89,.012),'cream')
    def finalize(self):
        mesh=bpy.data.meshes.new(self.name+'_mesh');mesh.from_pydata(self.v,[],self.f);mesh.materials.clear()
        for m in MATS:mesh.materials.append(m)
        for p,i,sm in zip(mesh.polygons,self.mi,self.sm):p.material_index=i;p.use_smooth=sm
        mesh.update()
        root=bpy.data.objects.new(self.name,None);bpy.context.collection.objects.link(root)
        ob=bpy.data.objects.new(self.name+'_geometry',mesh);bpy.context.collection.objects.link(ob);ob.parent=root
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        bevel=ob.modifiers.new('Rounded toy architecture edges','BEVEL');bevel.width=.0038;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.65
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        try:
            norm=ob.modifiers.new('Weighted architectural normals','WEIGHTED_NORMAL');norm.keep_sharp=True;norm.weight=45;bpy.ops.object.modifier_apply(modifier=norm.name)
        except Exception:pass
        ob.select_set(False)
        root['asset_family']='specials';root['front']='local -Y; GLB +Z';root['units']='metres';root['version']='cartoon-v2'
        return root

def dome(b,x,y,z,r,height):
    b.cylinder((x,y,z-.025),r*1.08,.055,'cream',32)
    b.cylinder((x,y,z+.025),r,.06,'gold',32)
    # A complete hemisphere with clearly readable, raised brass meridians.
    vs=[];segs=32;rings=9
    for j in range(rings+1):
        a=math.pi/2*j/rings
        for i in range(segs):vs.append((x+r*math.cos(a)*math.cos(i*math.tau/segs),y+r*math.cos(a)*math.sin(i*math.tau/segs),z+.04+height*math.sin(a)))
    b.poly(vs,[(j*segs+i,j*segs+(i+1)%segs,(j+1)*segs+(i+1)%segs,(j+1)*segs+i) for j in range(rings) for i in range(segs)],'mint',True)
    for i in range(8):
        a=i*math.tau/8
        for j in range(7):
            t1=math.pi/2*j/7;t2=math.pi/2*(j+1)/7
            b.rod((x+(r+.003)*math.cos(t1)*math.cos(a),y+(r+.003)*math.cos(t1)*math.sin(a),z+.043+height*math.sin(t1)),(x+(r+.003)*math.cos(t2)*math.cos(a),y+(r+.003)*math.cos(t2)*math.sin(a),z+.043+height*math.sin(t2)),.006,'gold',6)
    b.cylinder((x,y,z+height+.075),.035,.08,'gold',16,r2=.020)
    b.sphere((x,y,z+height+.13),(.029,.029,.030),'gold',12,7)

def civic_hall():
    b=Builder('civic_hall');b.base()
    b.box((0,.055,.315),(.78,.55,.48),'ivory')
    b.box((0,.055,.11),(.84,.61,.09),'cream')
    b.box((0,.055,.59),(.88,.66,.08),'ivory')
    b.box((0,.055,.64),(.80,.58,.035),'gold')
    b.box((0,.055,.676),(.72,.50,.06),'cream')
    b.door(-.04,-.241,.265,.14,.26)
    for xx in [-.30,-.16,.15,.30]:b.column(xx,-.288,.13,.39,.032)
    b.box((0,-.30,.548),(.85,.17,.064),'ivory')
    b.box((0,-.39,.552),(.81,.026,.025),'gold')
    b.xz_shape([(-.25,0),(.25,0),(0,.13)],(0,-.343,.58),.14,'cream')
    b.star((0,-.422,.635),.046,'gold')
    b.stairs(0,-.36,.128,.44,4)
    for xx in [-.40,.40]:
        for yy in [-.07,.12,.27]:
            b.box((xx,yy,.34),(.022,.065,.21),'gold')
            b.box((xx*1.035,yy,.34),(.014,.045,.18),'petrol')
    b.cylinder((-.12,.04,.785),.204,.23,'ivory',32)
    for angle in [-math.pi*.88,-math.pi*.66,-math.pi*.44,-math.pi*.22,0]:
        xx=-.12+.208*math.cos(angle);yy=.04+.208*math.sin(angle)
        w=Builder('drum_window');w.window(0,0,0,.043,.10,'petrol')
        b.merge(w,Matrix.Translation(Vector((xx,yy,.789))) @ Matrix.Rotation(angle+math.pi/2,4,'Z'))
    dome(b,-.12,.04,.895,.24,.20)
    # Offset clock tower creates an unmistakable two-peak silhouette.
    b.box((.278,.17,.921),(.17,.19,.51),'ivory')
    for zz in [.735,.995,1.14]:b.box((.278,.17,zz),(.222,.235,.033),'cream')
    b.front_disc((.278,.041,1.055),.067,.020,'gold',24)
    b.front_disc((.278,.026,1.055),.052,.010,'ivory',24)
    b.rod((.278,.013,1.055),(.278,.013,1.087),.005,'petrol',6)
    b.rod((.278,.013,1.055),(.304,.013,1.040),.005,'petrol',6)
    dome(b,.278,.17,1.166,.116,.10)
    b.box((.278,.061,.895),(.074,.018,.107),'navy')
    b.star((.278,.046,.910),.024,'gold',.012)
    for xx,yy in [(-.36,-.20),(-.36,.28),(.37,-.20),(.37,.32)]:
        b.box((xx,yy,.691),(.057,.057,.049),'ivory')
        b.sphere((xx,yy,.734),(.023,.023,.03),'gold',12,7)
    for xx in [-.34,.34]:
        b.box((xx,-.344,.403),(.084,.013,.225),'navy')
        b.star((xx,-.355,.434),.025,'gold',.009)
        b.xz_shape([(-.042,0),(.042,0),(0,-.05)],(xx,-.343,.293),.014,'navy')
    for xx in [-.43,.43]:b.planter(xx,-.30,r=.036);b.lamp(xx,-.435)
    for xx in [-.34,-.08,.17,.38]:b.planter(xx,.37,r=.041)
    b.cylinder((-.12,-.415,.084),.095,.035,'gold',24)
    b.cylinder((-.12,-.415,.105),.082,.015,'water',24)
    b.cylinder((-.12,-.415,.149),.017,.08,'cyan',12,r2=.009)
    return b

def vault_bank():
    b=Builder('vault_bank');b.base()
    # Real recessed portal built from piers and a lintel: gold is visible inside.
    b.box((0,.20,.49),(.82,.27,.80),'steel')
    for xx in [-.315,.315]:b.box((xx,-.055,.49),(.20,.38,.80),'steel')
    b.box((0,-.045,.823),(.84,.42,.16),'steel')
    b.box((0,.03,.934),(.95,.68,.074),'cream')
    b.box((0,.03,.981),(.87,.60,.035),'gold')
    b.box((0,.07,1.014),(.57,.37,.055),'steel')
    b.box((0,.07,1.055),(.63,.42,.030),'cream')
    b.box((0,-.098,.414),(.48,.022,.56),'dark')
    for xx in [-.385,.385]:
        b.column(xx,-.274 if xx<0 else -.12,.10,.72,.037)
        b.box((xx,.31,.45),(.08,.08,.73),'ivory')
    for xx in [-.30,-.18,0,.18,.30]:b.sphere((xx,-.322,.924),(.024,.018,.024),'gold',12,7)
    # The thick, circular opening and open door are the building's architecture.
    b.torus((-.045,-.28,.438),.263,.040,'gold',n=48,m=10)
    b.torus((-.045,-.300,.438),.214,.022,'gold_dark',n=48)
    for i in range(12):
        a=i*math.tau/12;b.front_disc((-.045+.269*math.cos(a),-.323,.438+.269*math.sin(a)),.010,.014,'ivory',10)
    for row in range(5):
        for col in range(4-row//3):
            xx=-.172+col*.084+(row%2)*.018
            b.box((xx,-.19,row*.069+.197),(.072,.122,.055),'gold')
            b.box((xx,-.255,row*.069+.216),(.052,.010,.008),'glow')
    # Door yaw makes its thickness, handle and concentric locks readable.
    door=Builder('vault_door')
    door.front_disc((0,0,0),.24,.065,'steel',40)
    door.torus((0,-.046,0),.216,.022,'gold',n=40)
    door.torus((0,-.06,0),.164,.011,'ivory',n=36)
    door.front_disc((0,-.069,0),.081,.045,'gold',24)
    for i in range(5):
        a=i*math.tau/5
        door.rod((.063*math.cos(a),-.095,.063*math.sin(a)),(.151*math.cos(a),-.095,.151*math.sin(a)),.012,'gold',8)
        door.front_disc((.19*math.cos(a),-.07,.19*math.sin(a)),.016,.034,'gold',12)
    b.merge(door,Matrix.Translation(Vector((.31,-.309,.438))) @ Matrix.Rotation(math.radians(57),4,'Z'))
    for yy in [-.06,.24]:
        b.box((.426,yy,.478),(.029,.062,.67),'gold_dark')
        b.box((.445,yy,.479),(.018,.035,.60),'cream')
    b.box((.431,.085,.13),(.035,.51,.057),'cream')
    for zz in [.31,.55]:b.cylinder((.182,-.274,zz),.024,.073,'gold',12)
    b.front_disc((0,-.324,1.02),.102,.041,'gold',32)
    b.front_disc((0,-.351,1.02),.079,.018,'gold_dark',32)
    # Money crest uses a clear sculpted currency glyph, with no font dependency.
    b.rod((0,-.371,.955),(0,-.371,1.086),.008,'ivory',8)
    b.torus((0,-.373,1.026),.045,.008,'ivory',n=26,m=6,start=.4,end=math.pi*1.3)
    b.torus((0,-.373,.999),.037,.008,'ivory',n=24,m=6,start=math.pi*1.15,end=math.pi*2.2)
    b.stairs(-.065,-.405,.115,.45,3)
    for xx in [-.445,.445]:b.planter(xx,.31,r=.040);b.lamp(xx,-.425)
    return b

def builders_guild():
    b=Builder('builders_guild');b.base()
    b.box((.17,.095,.31),(.46,.53,.44),'brick')
    # Three floors of intentionally incomplete structure.
    for zz in [.13,.43,.73,.99]:
        b.box((.16,.115,zz),(.51,.58,.038),'concrete')
        for yy in [-.15,.39]:b.rod((-.11,yy,zz+.025),(.425,yy,zz+.025),.016,'orange',8)
    for xx in [-.07,.16,.395]:
        for yy in [-.10,.14,.36]:
            b.box((xx,yy,.625),(.029,.029,1.05),'steel')
            if xx==.395 or yy==.36:b.rod((xx,yy,1.13),(xx,yy,1.25),.006,'dark',6)
    for zz in [.3,.59,.9]:
        b.rod((-.07,-.12,zz-.13),(.16,-.12,zz+.12),.009,'orange',6)
        b.rod((.18,-.12,zz+.12),(.395,-.12,zz-.13),.009,'orange',6)
    for z in [.24,.34]:
        for x in [-.015,.09,.195,.30]:b.box((x,-.184,z),(.073,.025,.047),'cream')
    # A substantial welcoming office with a giant hardhat roof.
    b.box((-.19,-.272,.265),(.39,.28,.36),'ivory')
    b.door(-.19,-.426,.248,.13,.23)
    b.box((-.19,-.27,.475),(.46,.35,.065),'cream')
    b.cylinder((-.19,-.27,.518),.191,.045,'yellow',28)
    b.sphere((-.19,-.27,.535),(.166,.144,.147),'yellow',24,12)
    b.box((-.19,-.27,.630),(.033,.20,.095),'gold')
    # Four-legged lattice tower and its full-width triangular crane boom.
    cx,cy=-.338,.17
    for dx in [-.042,.042]:
        for dy in [-.042,.042]:b.rod((cx+dx,cy+dy,.12),(cx+dx,cy+dy,1.29),.013,'yellow',8)
    for z in [.2,.38,.56,.74,.92,1.10,1.28]:
        b.rod((cx-.045,cy-.045,z),(cx+.045,cy-.045,z),.011,'yellow',8)
        b.rod((cx-.045,cy-.045,z-.15),(cx+.045,cy-.045,z),.009,'yellow',6)
        b.rod((cx+.045,cy-.045,z-.15),(cx-.045,cy-.045,z),.009,'yellow',6)
        b.rod((cx+.045,cy-.045,z-.15),(cx+.045,cy+.045,z),.009,'yellow',6)
    b.box((cx-.025,cy-.053,1.215),(.17,.13,.103),'yellow')
    b.box((cx-.025,cy-.125,1.219),(.13,.014,.065),'petrol')
    for y in [cy-.046,cy+.046]:b.rod((-.47,y,1.34),(.47,y,1.34),.012,'yellow',8)
    b.rod((-.47,cy,1.42),(.47,cy,1.42),.012,'yellow',8)
    for i in range(10):
        x=-.47+i*.094
        for y in [cy-.046,cy+.046]:
            b.rod((x,y,1.34),(x+.047,cy,1.42),.007,'yellow',6)
            b.rod((x+.047,cy,1.42),(x+.094,y,1.34),.007,'yellow',6)
    b.rod((cx,cy,1.58),(-.45,cy,1.43),.005,'steel',6)
    b.rod((cx,cy,1.58),(.43,cy,1.43),.005,'steel',6)
    b.rod((cx,cy,1.34),(cx,cy,1.58),.008,'yellow',6)
    b.box((-.427,cy,1.302),(.13,.18,.092),'steel')
    b.rod((.32,cy,1.33),(.32,cy,1.05),.006,'dark',6)
    b.box((.32,cy,1.02),(.089,.079,.102),'concrete')
    # Construction fencing, diagonal hazard stripes and stout traffic cones.
    for x in [-.34,.29]:
        b.box((x,-.466,.156),(.20,.030,.15),'yellow')
        for j in range(4):b.rod((x-.085+j*.048,-.485,.098),(x-.035+j*.048,-.485,.21),.012,'dark',6)
    for y in [.0,.16,.32]:b.box((.47,y,.15),(.020,.145,.17),'steel')
    for x,y in [(-.42,-.37),(.40,-.38)]:
        b.box((x,y,.082),(.075,.075,.024),'cream')
        b.cylinder((x,y,.135),.030,.09,'orange',12,r2=.008)
        b.cylinder((x,y,.142),.023,.020,'ivory',12,r2=.018)
    return b

def card_symbol(b,which,p,size):
    x,y,z=p
    if which=='heart':
        pts=[]
        for i in range(32):
            a=i*math.tau/32
            pts.append((size*math.sin(a)**3, size*(13*math.cos(a)-5*math.cos(2*a)-2*math.cos(3*a)-math.cos(4*a))/16))
        b.xz_shape(pts,p,.018,'red')
    elif which=='spade':
        pts=[(0,size),(-size*.90,-size*.05),(-size*.78,-size*.48),(-size*.30,-size*.52),(0,-size*.25),(size*.30,-size*.52),(size*.78,-size*.48),(size*.90,-size*.05)]
        b.xz_shape(pts,p,.018,'petrol')
        b.xz_shape([(-size*.27,-size*.79),(size*.27,-size*.79),(0,-size*.12)],p,.019,'petrol')
    else:
        for dx,dz in [(0,.40),(-.40,-.05),(.40,-.05)]:b.front_disc((x+dx*size,y,z+dz*size),size*.48,.018,'petrol',18)
        b.xz_shape([(-size*.30,-size*.82),(size*.30,-size*.82),(0,0)],p,.019,'petrol')

def card_pavilion():
    b=Builder('card_pavilion');b.base()
    b.cylinder((0,.015,.12),.398,.11,'cream',12)
    b.cylinder((0,.015,.322),.351,.36,'purple',12)
    for i in range(10):
        a=i*math.tau/10
        x=.337*math.cos(a);y=.015+.337*math.sin(a)
        b.column(x,y,.15,.34,.024)
    for angle in [-math.pi*.79,-math.pi*.65,-math.pi*.35,-math.pi*.21]:
        w=Builder('pavilion_window');w.window(0,0,0,.060,.18,'glow')
        b.merge(w,Matrix.Translation(Vector((.357*math.cos(angle),.015+.357*math.sin(angle),.342))) @ Matrix.Rotation(angle+math.pi/2,4,'Z'))
    b.door(0,-.357,.30,.145,.28)
    b.cylinder((0,.015,.538),.426,.065,'gold',36)
    b.cylinder((0,.015,.572),.407,.052,'purple',36)
    b.cylinder((0,.015,.64),.392,.13,'purple',36,r2=.16)
    b.torus((0,.015,.582),.4,.018,'gold',axis='Z',n=48)
    dome_part=Builder('purple_roof')
    dome_part.sphere((0,0,0),(.155,.155,.18),'purple',24,12)
    b.merge(dome_part,Matrix.Translation(Vector((0,.015,.706))))
    for i in range(8):
        a=i*math.tau/8
        b.rod((.38*math.cos(a),.015+.38*math.sin(a),.59),(.13*math.cos(a),.015+.13*math.sin(a),.757),.009,'gold',8)
    b.star((0,-.15,.745),.088,'gold',.025)
    for i,which in [(-1,'spade'),(0,'heart'),(1,'club')]:
        card=Builder('card')
        card.box((0,0,0),(.29,.055,.545),'gold')
        card.box((0,-.033,0),(.263,.020,.514),'ivory')
        card_symbol(card,which,(0,-.053,-.025),.085)
        card_symbol(card,which,(-.095,-.053,.195),.022)
        transform=Matrix.Translation(Vector((i*.255,.045 if i==0 else .12,1.066-abs(i)*.066))) @ Matrix.Rotation(i*math.radians(23),4,'Y')
        b.merge(card,transform)
    b.stairs(0,-.382,.12,.38,3)
    for x in [-.425,.425]:
        b.cylinder((x,.20,.54),.012,.92,'gold',10)
        b.star((x,.20,1.044),.047,'gold')
        b.box((x,.182,.79),(.105,.022,.33),'purple')
        for z in [.72,.84]:b.star((x,.162,z),.034,'gold',.014)
        b.planter(x,-.21,r=.042);b.lamp(x,-.414)
    return b

def chance_wheel():
    b=Builder('chance_wheel');b.base()
    b.box((0,.045,.127),(.65,.55,.13),'purple')
    b.box((0,.045,.196),(.71,.6,.026),'gold')
    b.rod((-.27,.02,.18),(-.12,.10,.70),.052,'purple',14)
    b.rod((.27,.02,.18),(.12,.10,.70),.052,'purple',14)
    center=(0,-.005,.69)
    b.front_disc(center,.379,.103,'purple',48)
    b.torus((0,-.072,.69),.350,.022,'gold',n=48)
    colors=['orange','ivory','mint','red','ivory','purple_light','yellow','mint_light']
    for i,mat in enumerate(colors):
        a1=math.tau*i/8;a2=math.tau*(i+1)/8
        pts=[(0,0)]+[(.322*math.cos(a1+(a2-a1)*j/6),.322*math.sin(a1+(a2-a1)*j/6)) for j in range(7)]
        b.xz_shape(pts,(0,-.077,.69),.02,mat)
        a=(a1+a2)/2
        b.star((.236*math.cos(a),-.097,.69+.236*math.sin(a)),.027,'gold',.010)
        b.rod((0,-.101,.69),(.327*math.cos(a1),-.101,.69+.327*math.sin(a1)),.005,'gold',6)
    for i in range(16):
        a=i*math.tau/16;b.sphere((.35*math.cos(a),-.10,.69+.35*math.sin(a)),(.014,.012,.014),'glow',10,6)
    b.front_disc((0,-.106,.69),.092,.032,'gold',24)
    b.star((0,-.137,.69),.071,'ivory',.023)
    b.xz_shape([(-.058,0),(.058,0),(0,-.11)],(0,-.098,1.12),.037,'red')
    b.sphere((0,-.088,1.137),(.031,.027,.031),'gold',12,7)
    for x in [-.36,.36]:
        b.lamp(x,-.37);b.planter(x,.34,r=.05)
    b.box((0,-.29,.256),(.38,.08,.095),'ivory')
    for x in [-.105,0,.105]:b.star((x,-.337,.259),.035,'gold')
    return b

def teleport_gate():
    b=Builder('teleport_gate');b.base()
    b.cylinder((0,.02,.109),.429,.09,'petrol',10)
    b.cylinder((0,.02,.166),.405,.035,'gold',10)
    b.cylinder((0,.02,.19),.370,.027,'mint',10)
    for x in [-.34,.34]:
        b.box((x,.025,.415),(.145,.24,.45),'petrol')
        b.box((x,-.105,.416),(.083,.020,.32),'mint')
        b.box((x,-.12,.416),(.025,.012,.23),'cyan')
        b.sphere((x,.03,.657),(.081,.081,.07),'gold',16,8)
    b.torus((0,.085,.67),.358,.041,'gold',n=48,m=10,angle=.14)
    b.torus((0,.076,.67),.322,.026,'cyan',n=48,m=10,angle=.14)
    b.torus((0,-.073,.67),.302,.036,'mint',n=48,m=10,angle=-.26)
    b.torus((0,-.11,.67),.276,.018,'cyan',n=48,m=8,angle=-.26)
    # No opaque fill: the opening reads as a gate, with luminous floating gems.
    for x,z,s in [(-.105,.68,.045),(.088,.74,.034),(.014,.57,.025),(.03,.85,.031)]:
        b.xz_shape([(0,s),(-s,0),(0,-s),(s,0)],(x,-.025,z),.038,'cyan')
    for x in [-.23,-.08,.08,.23]:b.box((x,-.28,.209),(.041,.090,.013),'cyan')
    b.star((0,.023,1.055),.065,'gold',.024)
    for x in [-.43,.43]:b.planter(x,.34,r=.040)
    return b

def rush_station():
    b=Builder('rush_station');b.base()
    b.box((0,0,.091),(.54,.9,.055),'steel')
    for x in [-.18,.18]:b.box((x,-.03,.122),(.026,.82,.009),'ivory')
    for x in [-.36,.36]:
        b.box((x,.055,.451),(.15,.23,.76),'orange')
        b.box((x,-.073,.46),(.092,.021,.52),'ivory')
        b.box((x,.055,.868),(.20,.28,.078),'cream')
        b.box((x,.055,.914),(.15,.21,.052),'gold')
    b.box((0,.055,.864),(.87,.25,.15),'orange')
    b.box((0,-.082,.857),(.72,.02,.082),'petrol')
    for i in range(8):
        for j in range(2):
            b.box((-.315+i*.09,-.098,.837+j*.035),(.081,.012,.028),'ivory' if (i+j)%2==0 else 'petrol')
    for x in [-.12,.12]:
        b.xz_shape([(-.10,-.055),(-.025,-.055),(.085,.065),(-.025,.17),(-.10,.17),(.008,.065)],(x,-.115,1.08),.045,'orange')
    b.rod((0,.06,.94),(0,.06,1.21),.014,'gold',10)
    b.box((.118,.065,1.18),(.235,.028,.126),'mint')
    for x in [-.41,.41]:
        b.cylinder((x,-.35,.11),.047,.09,'orange',14,r2=.030)
        b.cylinder((x,-.35,.148),.035,.026,'ivory',14,r2=.029)
    for y in [-.30,-.10,.10]:
        b.box((-.05,y,.130),(.13,.030,.013),'yellow',-.62)
        b.box((.05,y,.130),(.13,.030,.013),'yellow',.62)
    return b

def junction_hub():
    b=Builder('junction_hub');b.base()
    b.cylinder((0,0,.111),.433,.092,'cream',12)
    b.cylinder((0,0,.167),.390,.024,'petrol',12)
    # Two full architectural arches cross over the route hub, not a flat icon.
    for angle,mat in [(math.pi/4,'mint'),(-math.pi/4,'purple')]:
        g=Builder('route_arch')
        for x in [-.335,.335]:
            g.box((x,0,.348),(.115,.15,.385),mat)
            g.box((x,0,.185),(.154,.18,.065),'gold')
            g.box((x,0,.506),(.143,.175,.042),'gold')
        g.torus((0,0,.52),.335,.064,mat,n=32,m=10,start=0,end=math.pi)
        g.torus((0,-.066,.52),.335,.010,'gold',n=32,m=6,start=0,end=math.pi)
        b.merge(g,Matrix.Rotation(angle,4,'Z'))
    b.cylinder((0,.0,.936),.073,.10,'gold',16)
    b.sphere((0,0,1.016),(.061,.061,.061),'mint_light',16,9)
    b.rod((0,.16,.19),(0,.16,1.17),.025,'gold',12)
    b.xz_shape([(-.25,-.045),(.16,-.045),(.24,.018),(.16,.08),(-.25,.08)],(0,.15,1.165),.064,'purple')
    b.xz_shape([(-.24,.018),(-.16,-.045),(.25,-.045),(.25,.08),(-.16,.08)],(0,.135,1.045),.064,'mint')
    for side in [-1,1]:
        b.rod((0,-.35,.188),(side*.25,.07,.188),.021,'gold',8)
        b.rod((side*.25,.07,.188),(side*.28,-.02,.188),.021,'gold',8)
    for x in [-.42,.42]:b.planter(x,.34,r=.041);b.lamp(x,-.37)
    return b

FACTORIES=[civic_hall,vault_bank,builders_guild,card_pavilion,chance_wheel,teleport_gate,rush_station,junction_hub]
roots=[]
for factory in FACTORIES:
    builder=factory();root=builder.finalize();roots.append(root)
    print('SPECIAL_BUILT',root.name,'source_vertices',len(builder.v),flush=True)

# All exported roots have exactly zero transform and all geometry sits above Z=0.
bpy.ops.object.select_all(action='DESELECT')
manifest={'version':'cartoon-v2','source':'original Blender geometry','coordinates':{'blender_up':'Z','blender_front':'-Y','gltf_up':'Y','gltf_front':'+Z'},'assets':{}}
total_triangles=0
for root in roots:
    root.select_set(True)
    verts=[];triangles=0
    for ob in root.children:
        ob.select_set(True);verts.extend(v.co for v in ob.data.vertices)
        ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
    mins=[min(v[a] for v in verts) for a in range(3)];maxs=[max(v[a] for v in verts) for a in range(3)]
    dimensions=[round(maxs[i]-mins[i],5) for i in range(3)]
    assert dimensions[0]<=1.05 and dimensions[1]<=1.05,(root.name,dimensions)
    assert -.001<=mins[2] and maxs[2]<=1.7,(root.name,mins,maxs)
    manifest['assets'][root.name]={'width':dimensions[0],'depth':dimensions[1],'height':dimensions[2],'base_z':round(mins[2],5),'bounds_min':mins,'bounds_max':maxs,'triangles':triangles,'root_translation':[0,0,0]}
    total_triangles+=triangles
bpy.ops.export_scene.gltf(filepath=str(OUT/'specials.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
manifest['total_triangles']=total_triangles
manifest['glb_bytes']=(OUT/'specials.glb').stat().st_size
(OUT/'specials-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')

# Editable studio display remains in the .blend, and never enters the export.
scene=bpy.context.scene
world=bpy.data.worlds.new('Specials warm studio');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.78,.72,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35
groundmat=material('Preview matte warm backdrop','DED7C5',.8)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));ground=bpy.context.object;ground.name='Preview ground';ground.data.materials.append(groundmat)
def area(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm softbox',(-3,-4,6),500,4.0,(1.0,.88,.69))
area('Cool studio fill',(4,-1,4),250,3.5,(.72,.87,1.0))
area('Golden rim',(1,4,6),450,3.0,(1.0,.94,.78))
data=bpy.data.cameras.new('Specials camera');cam=bpy.data.objects.new('Specials camera',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO'
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.cycles.max_bounces=6
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=680;scene.render.resolution_y=740;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.15
data.ortho_scale=1.94
cam.location=(2.7,-4.5,2.9);cam.rotation_euler=(Vector((0,0,.69))-cam.location).to_track_quat('-Z','Y').to_euler()
for root in roots:
    for ob in root.children:ob.hide_render=True
render_names=set(filter(None,os.environ.get('CITY_SPECIALS_RENDER_NAMES','').split(',')))
for root in roots:
    if render_names and root.name not in render_names:continue
    for ob in root.children:ob.hide_render=False
    scene.render.filepath=str(PREVIEW/(root.name+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob in root.children:ob.hide_render=True
    print('SPECIAL_RENDERED',root.name,flush=True)
# Arrange the complete eight-model kit for inspection in the native source file.
for i,root in enumerate(roots):
    root.location=((i%4-1.5)*1.65,(i//4-.5)*2.4,0)
    for ob in root.children:ob.hide_render=False
data.ortho_scale=7.8
cam.location=(2.2,-9.8,10.7);cam.rotation_euler=(Vector((0,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1800;scene.render.resolution_y=1150
scene.render.filepath=str(PREVIEW/'specials-contact-sheet.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'specials.blend'))
bpy.ops.render.render(write_still=True)
print('SPECIALS_COMPLETE',json.dumps({'glb_bytes':manifest['glb_bytes'],'triangles':total_triangles,'assets':len(roots),'preview':str(PREVIEW)}),flush=True)
