"""Original cartoon luxury landmarks, authored and rendered in Blender.

Run Blender --background --factory-startup --python art/build_landmarks.py.
X is the long lot edge; Z is up; facades face -Y. GLB exports Y-up.
No external textures, downloaded meshes or dependencies are used.
"""
import bpy
import math
import os
import json
import struct
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'models'
PREVIEW=Path(os.environ.get('LANDMARK_PREVIEW_DIR',str(ROOT/'art')))
OUT.mkdir(parents=True,exist_ok=True);PREVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)

def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def mat(name,hexcolor,rough=.42,metal=0,emit=0):
    rgb=tuple(lin(int(hexcolor[i:i+2],16)/255) for i in (0,2,4))
    m=bpy.data.materials.new('Landmark / '+name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emit:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emit
    return m
M={
 'ivory':mat('Marzipan limestone','F6DDB0',.51),
 'cream':mat('Porcelain edges','FFF2CC',.35),
 'stone':mat('Terrace biscuit stone','BCA682',.61),
 'gold':mat('Honey gold satin','E7AE35',.30,.52),
 'gold_dark':mat('Honey gold shadow','B4873E',.4,.4),
 'teal':mat('Peacock enamel','087B85',.28,.18),
 'teal_light':mat('Turquoise glass','2AB8C3',.26,.12),
 'teal_dark':mat('Deep sea glass','124B64',.31,.13),
 'glass':mat('Warm welcome windows','FFCD72',.33,0,.17),
 'onsen_glass':mat('Onsen deep teal window recess','19545F',.30,.08),
 'onsen_amber':mat('Onsen warm amber interior','C87A32',.40,0,.09),
 'navy':mat('Ink blue ceramic roof','263E6A',.36),
 'navy_light':mat('Blue roof edges','476997',.39),
 'wood':mat('Cinnamon timber','A2643F',.49),
 'wood_light':mat('Golden cedar','D69A5E',.46),
 'water':mat('Milky turquoise hot springs','6ADBCD',.21,.16),
 'foam':mat('Waterfall mint foam','C3FFF1',.28),
 'rock':mat('Soft river slate','809792',.75),
 'rock_light':mat('River stone faces','A9BDB1',.70),
 'jade':mat('Jade pine foliage','247E52',.62),
 'sage':mat('New pine tips','4FAA5E',.64),
 'maple':mat('Maple vermilion','E57648',.65),
 'maple_light':mat('Maple tangerine','F6A253',.62),
}
MATS=list(M.values());IDX={k:MATS.index(v) for k,v in M.items()}

class Mesh:
    def __init__(self,name):self.name=name;self.v=[];self.f=[];self.mi=[];self.sm=[]
    def poly(self,vs,fs,ma,smooth=False):
        n=len(self.v);self.v.extend(vs)
        for f in fs:self.f.append(tuple(i+n for i in f));self.mi.append(IDX[ma]);self.sm.append(smooth)
    def box(self,p,s,ma,rz=0):
        x,y,z=p;a,b,c=(v/2 for v in s);co=math.cos(rz);si=math.sin(rz)
        vv=[(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]
        self.poly([(x+u*co-v*si,y+u*si+v*co,z+w) for u,v,w in vv],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],ma)
    def cyl(self,p,r,h,ma,n=16,r2=None):
        x,y,z=p;r2=r if r2 is None else r2
        vv=[(x+rr*math.cos(i*math.tau/n),y+rr*math.sin(i*math.tau/n),z+zz) for rr,zz in ((r,-h/2),(r2,h/2)) for i in range(n)]
        ff=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.poly(vv,ff,ma,True)
    def oval(self,p,r,h,ma,n=24):
        x,y,z=p;rx,ry=r
        vv=[(x+rx*math.cos(i*math.tau/n),y+ry*math.sin(i*math.tau/n),z+zz) for zz in (-h/2,h/2) for i in range(n)]
        self.poly(vv,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],ma,True)
    def sphere(self,p,r,ma,n=10,rings=6):
        x,y,z=p;sx,sy,sz=r;vv=[]
        for j in range(rings+1):
            a=math.pi*j/rings
            for i in range(n):
                t=i*math.tau/n;vv.append((x+sx*math.sin(a)*math.cos(t),y+sy*math.sin(a)*math.sin(t),z+sz*math.cos(a)))
        self.poly(vv,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)],ma,True)
    def rod(self,a,b,r,ma,n=8):
        a,b=Vector(a),Vector(b);ax=(b-a).normalized();other=Vector((0,0,1)) if abs(ax.z)<.95 else Vector((1,0,0));u=ax.cross(other).normalized();v=ax.cross(u).normalized()
        vv=[tuple(p+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for p in (a,b) for i in range(n)]
        self.poly(vv,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],ma,True)
    def arch(self,x,y,z,w,h,ma,depth=.027):
        r=w/2;shoulder=h-r
        outline=[(-r,0),(r,0),(r,shoulder)]+[(r*math.cos(i*math.pi/12),shoulder+r*math.sin(i*math.pi/12)) for i in range(1,13)]
        vv=[(x+xx,y+yy,z+zz) for yy in (-depth/2,depth/2) for xx,zz in outline];n=len(outline)
        self.poly(vv,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],ma)
    def hip_roof(self,x,y,z,w,d,h):
        # Curved, swept ceramic eaves; four broad roof surfaces remain legible.
        rings=[(w*.5,d*.5,0),(w*.45,d*.43,-h*.10),(w*.27,d*.18,h*.61),(w*.14,.016,h)]
        vv=[]
        for xx,yy,zz in rings:vv.extend([(x-xx,y-yy,z+zz),(x+xx,y-yy,z+zz),(x+xx,y+yy,z+zz),(x-xx,y+yy,z+zz)])
        ff=[]
        for j in range(3):
            for i in range(4):ff.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
        ff.append((12,13,14,15));self.poly(vv,ff,'navy')
        # Big rolled eaves and a single strong ridge, rather than micro tiles.
        for a,b in [((-w/2,-d/2),(w/2,-d/2)),((-w/2,d/2),(w/2,d/2)),((-w/2,-d/2),(-w/2,d/2)),((w/2,-d/2),(w/2,d/2))]:
            self.rod((x+a[0],y+a[1],z),(x+b[0],y+b[1],z),.018,'navy_light',8)
        self.rod((x-w*.16,y,z+h+.012),(x+w*.16,y,z+h+.012),.021,'navy_light',10)
        for sx in (-1,1):
            self.rod((x+sx*w*.15,y,z+h+.012),(x+sx*w*.22,y,z+h+.062),.016,'gold',8)
        for t in (-.33,0,.33):
            self.rod((x+w*t,y-d*.47,z+.012),(x+w*t*.30,y-d*.04,z+h*.94),.009,'navy_light',6)
    def hedge(self,x,y,z,scale=.12,maple=False):
        for dx,dy,dz,ss in [(-.34,0,0,.72),(.3,.1,.12,.8),(0,-.15,.42,.74)]:
            self.sphere((x+dx*scale,y+dy*scale,z+dz*scale),(scale*ss,scale*ss*.70,scale*ss*.68),'maple' if maple else 'jade',9,5)
    def pine(self,x,y,z=0,s=.48,maple=False,narrow=1):
        start=len(self.v)
        self.rod((x,y,z),(x+.035*s,y,z+s*.72),.027*s,'wood',9)
        for side,hh in [(-1,.45),(1,.63),(-.3,.78)]:
            tx=x+side*s*.22;ty=y+side*s*.025;tz=z+s*hh
            self.rod((x,y,z+s*(hh-.18)),(tx,ty,tz),.012*s,'wood',7)
            self.sphere((tx,ty,tz),(s*.26,s*.20,s*.12),'maple' if maple else 'jade',10,5)
            self.sphere((tx+s*.07,ty-.012,tz+s*.07),(s*.19,s*.15,s*.10),'maple_light' if maple else 'sage',10,5)
        self.sphere((x+.03*s,y,z+s*.92),(s*.19,s*.16,s*.11),'maple_light' if maple else 'sage',10,5)
        if narrow!=1:
            for i in range(start,len(self.v)):
                vx,vy,vz=self.v[i];self.v[i]=(x+(vx-x)*narrow,y+(vy-y)*narrow,vz)
    def lamp(self,x,y,z=0,s=1):
        self.cyl((x,y,z+.11*s),.012*s,.22*s,'gold_dark',10)
        self.box((x,y,z+.24*s),(.064*s,.060*s,.095*s),'glass')
        self.cyl((x,y,z+.295*s),.051*s,.030*s,'navy',4,r2=.018*s)
        for xx in (-1,1):self.box((x+xx*.034*s,y,z+.24*s),(.009*s,.067*s,.105*s),'gold')
    def join(self,position):
        mesh=bpy.data.meshes.new(self.name+'_mesh');mesh.from_pydata(self.v,[],self.f)
        for ma in MATS:mesh.materials.append(ma)
        for p,i,sm in zip(mesh.polygons,self.mi,self.sm):p.material_index=i;p.use_smooth=sm
        mesh.update();root=bpy.data.objects.new(self.name,None);bpy.context.collection.objects.link(root);root.location=position
        ob=bpy.data.objects.new(self.name+'_geometry',mesh);bpy.context.collection.objects.link(ob);ob.parent=root
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        bevel=ob.modifiers.new('Plush toy architectural bevels','BEVEL');bevel.width=.022;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.60
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        normal=ob.modifiers.new('Soft polished planes','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
        bpy.ops.object.modifier_apply(modifier=normal.name);ob.select_set(False)
        # Preserve the authored vertical hierarchy exactly for the game camera.
        family,level=self.name.rsplit('_',1)
        target={'skyscraper':(1.7,2.8,4.0),'finance':(1.3,2.0,2.8),'onsen':(.7,1.0,1.35)}[family][int(level)-1]
        sx=1.0
        # mesh has been replaced when applying modifiers: use the live datablock.
        live=ob.data;high=max(v.co.z for v in live.vertices)
        width=max(v.co.x for v in live.vertices)-min(v.co.x for v in live.vertices)
        depth=max(v.co.y for v in live.vertices)-min(v.co.y for v in live.vertices)
        limit=2.62 if family=='onsen' else 2.18
        if width>limit:sx=limit/width
        sy=min(1,(.94 if family=='onsen' else .88)/depth)
        for v in live.vertices:v.co.x*=sx;v.co.y*=sy;v.co.z*=target/high
        root['front']='Blender -Y; exported glTF +Z';root['origin']='base center';root['family']=self.name.rsplit('_',1)[0]
        return root

def compact_normals(path):
    """Keep positions exact; store normals as normalized signed 16-bit values.

    KHR_mesh_quantization is natively supported by our Three.js GLTFLoader.
    Eight-byte vertex stride preserves glTF's four-byte alignment requirement.
    No extra runtime decoder or compressed mesh dependency is introduced.
    """
    raw=path.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
    gltf=json.loads(raw[20:20+json_size]);binary=raw[28+json_size:]
    normal_ids={p['attributes']['NORMAL'] for mesh in gltf['meshes'] for p in mesh['primitives'] if 'NORMAL' in p['attributes']}
    views={}
    for accessor_id in normal_ids:
        accessor=gltf['accessors'][accessor_id]
        if accessor['componentType']!=5126:continue
        index=accessor['bufferView'];view=gltf['bufferViews'][index]
        assert accessor.get('byteOffset',0)==0 and view['byteLength']==accessor['count']*12
        data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        packed=bytearray()
        for x,y,z in struct.iter_unpack('<fff',data):
            packed.extend(struct.pack('<hhhxx',*(round(max(-1,min(1,v))*32767) for v in (x,y,z))))
        views[index]=bytes(packed)
        accessor['componentType']=5122;accessor['normalized']=True
    rebuilt=bytearray()
    for index,view in enumerate(gltf['bufferViews']):
        offset=view.get('byteOffset',0);data=views.get(index,binary[offset:offset+view['byteLength']])
        while len(rebuilt)%4:rebuilt.append(0)
        view['byteOffset']=len(rebuilt);view['byteLength']=len(data)
        if index in views:view['byteStride']=8
        rebuilt.extend(data)
    while len(rebuilt)%4:rebuilt.append(0)
    gltf['buffers'][0]['byteLength']=len(rebuilt)
    for key in ('extensionsUsed','extensionsRequired'):
        gltf.setdefault(key,[])
        if 'KHR_mesh_quantization' not in gltf[key]:gltf[key].append('KHR_mesh_quantization')
    json_data=json.dumps(gltf,separators=(',',':')).encode('utf8')
    json_data+=b' '*((-len(json_data))%4)
    total=12+8+len(json_data)+8+len(rebuilt)
    result=struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(json_data),0x4E4F534A)+json_data+struct.pack('<II',len(rebuilt),0x004E4942)+rebuilt
    temporary=path.with_suffix('.glb.tmp');temporary.write_bytes(result);temporary.replace(path)
    print('NORMAL_STORAGE',len(raw),'->',len(result),'bytes',flush=True)

def stair(m,x,y,z,w,steps=4):
    for i in range(steps):m.box((x,y-i*.025,z+.012+i*.017),(w,.13-i*.023,.022),'cream')

def planter(m,x,y,z,s=.13):
    m.box((x,y,z+.025),(s*1.5,s,.05),'cream');m.hedge(x,y,z+.065,s*.65)

def shaft(m,x,y,z,w,d,h,ribs=5):
    m.box((x,y,z+h/2),(w,d,h),'teal')
    # Broad pale glass bays with a few gold mullions, no fine window grid.
    for i in range(ribs):
        xx=x-w*.42+w*.84*i/(ribs-1)
        m.box((xx,y-d/2-.008,z+h*.51),(w/(ribs+1)*.57,.015,h*.91),'teal_light' if i%2==0 else 'teal_dark')
        m.box((xx-w/(ribs+1)*.38,y-d/2-.02,z+h/2),(.012,.021,h+.013),'gold')
    for xx in (-w/2,w/2):
        for yy in (-d/2,d/2):m.box((x+xx,y+yy,z+h/2),(.035,.034,h+.023),'gold')
    for side in (-1,1):
        for yy in (-.22,0,.22):m.box((x+side*(w/2+.006),y+yy*d,z+h*.51),(.014,d*.20,h*.89),'teal_light')
    for i in range(1,max(2,int(h/.16))):
        zz=z+h*i/max(2,int(h/.16))
        m.poly([(x-w/2+.023,y-d/2-.029,zz-.0035),(x+w/2-.023,y-d/2-.029,zz-.0035),(x+w/2-.023,y-d/2-.029,zz+.0035),(x-w/2+.023,y-d/2-.029,zz+.0035)],[(0,1,2,3)],'teal_dark')
        for side in (-1,1):
            xx=x+side*(w/2+.020)
            m.poly([(xx,y-d/2+.015,zz-.0035),(xx,y+d/2-.015,zz-.0035),(xx,y+d/2-.015,zz+.0035),(xx,y-d/2+.015,zz+.0035)],[(0,1,2,3)],'teal_dark')
    if h>.50:
        for i in (1,3,6):
            zz=z+h*(.12+i*.093);xx=x+((i%3)-1)*w*.22
            m.poly([(xx-w*.023,y-d/2-.031,zz-.026),(xx+w*.023,y-d/2-.031,zz-.026),(xx+w*.023,y-d/2-.031,zz+.026),(xx-w*.023,y-d/2-.031,zz+.026)],[(0,1,2,3)],'glass')
    m.box((x,y,z+h),(w+.038,d+.038,.045),'gold')

def skyscraper(level):
    m=Mesh('skyscraper_'+str(level));H=(1.70,2.80,4.00)[level-1]
    podium=.28+.07*(level-1)
    m.box((0,0,.04),(2.16,.84,.08),'stone');m.box((0,.06,podium/2+.035),(1.68,.61,podium-.01),'ivory')
    m.box((0,.06,podium+.052),(1.79,.68,.055),'cream')
    for x in (-.67,-.44,.44,.67):
        m.box((x,-.26,podium*.51+.043),(.12,.02,podium*.68),'glass')
        for side in (-1,1):m.box((x+side*.075,-.28,podium*.50+.043),(.032,.04,podium*.89),'gold')
    for x in (-.65,.65):
        wingH=H*(.37 if level==1 else .40);shaft(m,x,.08,podium+.08,.36,.40,wingH-podium-.08,3)
        m.box((x,.08,wingH+.028),(.42,.46,.055),'cream');planter(m,x,.10,wingH+.055,.18)
    # Tall Art Deco silhouette: five slim, visibly recessed stages.
    spans=[(podium+.08,H*.61,.75,.45),(H*.61,H*.77,.62,.39),(H*.77,H*.86,.47,.32),(H*.86,H*.91,.31,.25)]
    for low,high,w,d in spans:shaft(m,0,.065,low,w,d,high-low,5 if w>.45 else 3)
    for low,high,r1,r2,material in [(.913,.951,.146,.105,'gold'),(.951,.975,.090,.066,'teal'),(.975,.990,.061,.028,'gold'),(.990,1.0,.026,.004,'gold')]:
        m.cyl((0,.065,H*(low+high)/2),r1,H*(high-low),material,8,r2=r2)
    for i in range(4):
        a=math.pi/4+i*math.pi/2
        m.rod((.12*math.cos(a),.065+.12*math.sin(a),H*.92),(.09*math.cos(a),.065+.09*math.sin(a),H*.97),.012,'gold')
    for side in (-1,1):
        m.rod((side*.13,.065,H*.86),(side*.13,.065,H*.955),.012,'gold')
        m.sphere((side*.13,.065,H*.955),(.018,.018,.024),'gold',8,5)
    # Grand bright entrance, canopy and a ceremonial stair.
    m.arch(0,-.285,.08,.34,podium+.06,'gold',.07);m.arch(0,-.328,.087,.26,podium+.01,'glass',.013)
    m.box((0,-.343,podium*.51+.08),(.015,.012,podium*.80),'wood');m.box((0,-.35,podium+.12),(.57,.16,.040),'gold')
    m.box((0,-.357,podium+.145),(.49,.12,.025),'teal_light');stair(m,0,-.335,.003,.42)
    for x in (-.85,.85):
        m.pine(x,.18,podium+.075,.41 if level>1 else .30,narrow=.5);m.lamp(x*1.17,-.31,.08,.82)
    for x in (-.52,.52):planter(m,x,-.285,.07,.21)
    if level>=2:
        for x in (-.98,.98):
            m.oval((x,-.15,.104),(.075,.105),.033,'cream',18);m.oval((x,-.15,.125),(.055,.082),.012,'water',18)
            m.cyl((x,-.15,.215),.019,.177,'water',10,r2=.006)
            m.cyl((x,-.15,.215),.008,.19,'foam',10,r2=.003)
    return m

def finance(level):
    m=Mesh('finance_'+str(level));H=(1.30,2.00,2.80)[level-1]
    m.box((0,0,.04),(2.16,.84,.08),'stone');m.box((0,.045,.18),(1.70,.62,.28),'ivory')
    m.box((0,.045,.329),(1.81,.67,.06),'gold');m.box((0,.045,.369),(1.71,.59,.035),'cream')
    for x,height,width in [(-.43,H,.58),(.43,H*.77,.58)]:
        shaft(m,x,.06,.385,width,.41,height*.60-.385,4)
        shaft(m,x,.065,height*.60,width*.81,.35,height*.22,4)
        shaft(m,x,.065,height*.82,width*.62,.29,height*.12,3)
        m.box((x,.065,height*.963),(width*.70,.35,height*.052),'gold')
        m.box((x,.065,height*.993),(width*.48,.23,height*.017),'teal_light')
        # Stepped side buttresses accent the twin towers' broader shoulders.
        for side in (-1,1):m.box((x+side*width*.47,.06,height*.39),(.047,.48,height*.49),'cream')
    if level>=2:
        bridgeZ=H*.52
        m.box((0,.02,bridgeZ),(.49,.29,.12),'gold');m.box((0,-.135,bridgeZ+.01),(.41,.014,.067),'teal_light')
        m.box((0,.02,bridgeZ+.09),(.54,.32,.041),'cream')
    # Vault crest, two giant arched banking windows, and a central door.
    for x in (-.53,.53):m.arch(x,-.283,.083,.33,.23,'gold',.047);m.arch(x,-.315,.09,.27,.18,'glass',.014)
    m.arch(0,-.292,.078,.25,.245,'gold',.048);m.arch(0,-.322,.085,.18,.195,'teal_dark',.012)
    m.sphere((0,-.302,.333),(.101,.022,.101),'gold',18,10)
    m.sphere((0,-.33,.333),(.076,.014,.076),'gold_dark',16,8)
    m.rod((0,-.349,.28),(0,-.349,.385),.010,'cream')
    m.rod((-.035,-.348,.357),(.032,-.348,.357),.009,'cream')
    m.rod((-.030,-.348,.311),(.035,-.348,.311),.009,'cream')
    stair(m,0,-.335,.006,.37)
    for x in (-.92,.92):m.pine(x,.22,.08,.34);m.lamp(x,-.28,.08,.74)
    for x in (-.69,.69):planter(m,x,-.308,.077,.22)
    return m

def bath(m,x,y,z,rx=.32,ry=.18):
    m.oval((x,y,z+.032),(rx,ry),.064,'rock_light',24)
    m.oval((x,y,z+.069),(rx*.92,ry*.87),.028,'cream',24)
    m.oval((x,y,z+.086),(rx*.82,ry*.75),.013,'water',24)
    for i in range(9):
        a=i*math.tau/9
        m.sphere((x+rx*.91*math.cos(a),y+ry*.88*math.sin(a),z+.081),(.045,.033,.025),'rock' if i%3 else 'rock_light',8,4)
    for dx,dy in ((-.10,0),(.11,.01)):
        m.sphere((x+dx,y+dy,z+.092),(.027,.013,.004),'foam',10,4)

def pavilion(m,x,y,z,w=.50,d=.35,floors=1,height=.46):
    body=height*.61;floorH=body/floors
    m.box((x,y,z+.034),(w+.06,d+.048,.068),'stone')
    m.box((x,y,z+body/2+.05),(w,d,body),'ivory')
    for f in range(floors):
        zz=z+.05+f*floorH
        for j,xx in enumerate((-w*.39,0,w*.39)):
            # Front-most glazing is visibly recessed behind the cedar lattice;
            # it must never share the ivory wall's plane or colour.
            m.box((x+xx,y-d/2-.020,zz+floorH*.49),(w*.30,.022,floorH*.73),'wood')
            m.box((x+xx,y-d/2-.037,zz+floorH*.49),(w*.265,.014,floorH*.65),'onsen_glass' if (j+f)%3==1 else 'onsen_amber')
            m.box((x+xx,y-d/2-.053,zz+floorH*.49),(.013,.014,floorH*.73),'wood_light')
            for fraction in (.22,.48,.76):
                m.box((x+xx,y-d/2-.054,zz+floorH*fraction),(w*.285,.014,.014),'wood_light')
        for side in (-1,1):
            m.box((x+side*w/2,y,zz+floorH*.5),(.032,d+.016,floorH),'wood')
            m.box((x+side*(w/2+.020),y,zz+floorH*.5),(.025,d*.67,floorH*.60),'wood')
            m.box((x+side*(w/2+.037),y,zz+floorH*.5),(.014,d*.59,floorH*.51),'onsen_glass')
        m.box((x,y-d*.59,zz+.012),(w+.10,d*.28,.030),'wood_light')
        m.box((x,y,zz+floorH),(w+.06,d+.038,.033),'wood')
        # Chubby wooden balconies.
        if f>0:
            front=y-d*.75
            m.box((x,front+.018,zz+.004),(w+.13,.12,.031),'wood_light')
            m.rod((x-w*.55,front,zz+.092),(x+w*.55,front,zz+.092),.014,'wood')
            for i in range(5):m.rod((x-w*.53+w*1.06*i/4,front,zz+.02),(x-w*.53+w*1.06*i/4,front,zz+.094),.009,'wood',6)
    m.hip_roof(x,y,z+body+.06,w+.17,d+.16,height*.27)

def bridge(m,x,y,z,length=.34,width=.135):
    # Planked, visibly arched bridge crossing the channel between pools.
    for i in range(9):
        t=i/8;xx=x-length/2+t*length;zz=z+math.sin(t*math.pi)*.085
        m.box((xx,y,zz),(length/8+.008,width,.025),'wood_light')
    for side in (-1,1):
        yy=y+side*width*.55
        for i in range(4):
            t=i/3;xx=x-length/2+t*length;zz=z+math.sin(t*math.pi)*.085
            m.rod((xx,yy,zz),(xx,yy,zz+.10),.011,'wood')
        for i in range(8):
            t=i/8;t2=(i+1)/8
            m.rod((x-length/2+t*length,yy,z+.10+math.sin(t*math.pi)*.085),(x-length/2+t2*length,yy,z+.10+math.sin(t2*math.pi)*.085),.012,'wood')

def waterfall(m,x,y,z=.09):
    for dx,dy,dz,r in [(-.07,.02,.10,.13),(.08,.04,.16,.13),(0,.04,.25,.11),(-.14,.015,.045,.09)]:
        m.sphere((x+dx,y+dy,z+dz),(r,r*.58,r*.90),'rock' if dx>0 else 'rock_light',8,5)
    m.oval((x,y-.018,z+.273),(.079,.056),.021,'water',18)
    profile=[(-.020,.281),(-.074,.28),(-.108,.248),(-.123,.17),(-.144,.107),(-.178,.086)]
    for i in range(7):
        left=x-.061+i*.0175;right=left+.018
        verts=[(xx,y+yy,z+zz) for yy,zz in profile for xx in (left,right)]
        m.poly(verts,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(len(profile)-1)],'foam' if i in (0,4) else 'water',True)
    for off in (-.018,.035):
        for a,b in zip(profile[:-1],profile[1:]):m.rod((x+off,y+a[0]-.001,z+a[1]+.003),(x+off,y+b[0]-.001,z+b[1]+.003),.004,'foam',6)
    m.oval((x,y-.175,z+.088),(.109,.059),.015,'foam',16)

def onsen(level):
    m=Mesh('onsen_'+str(level));m.box((0,0,.037),(2.62,.94,.074),'stone')
    # Extra garden space is modelled, not created by stretching the buildings.
    m.box((0,0,.081),(2.54,.87,.033),'rock_light')
    for x in (-1.256,1.256):m.box((x,.015,.15),(.044,.86,.13),'ivory')
    for x in (-.76,.76):m.box((x,-.436,.137),(.83,.042,.104),'ivory')
    for x in (-1.15,-.39,.39,1.15):m.lamp(x,-.412,.19,.67)
    m.oval((.015,-.195,.17),(.82,.135),.025,'water',28)
    if level==1:
        pavilion(m,.28,.21,.10,.70,.32,1,.58)
        pavilion(m,-.88,.23,.10,.41,.29,1,.43)
        bath(m,-.60,-.19,.10,.38,.185);bath(m,.55,-.21,.10,.31,.165)
        waterfall(m,-.66,.10,.10)
        m.pine(1.08,.22,.10,.40);m.pine(-1.11,.23,.10,.35,True)
        bridge(m,-.02,-.195,.16,.36,.15)
    else:
        mainH=.78 if level==2 else 1.10
        pavilion(m,.02,.235,.10,.65,.30,2,mainH)
        pavilion(m,-.89,.225,.10,.43,.29,1 if level==2 else 2,.56 if level==2 else .76)
        pavilion(m,.90,.22,.10,.43,.30,1 if level==2 else 2,.55 if level==2 else .80)
        bath(m,-.60,-.20,.10,.39,.185);bath(m,.61,-.205,.10,.36,.18)
        bridge(m,.025,-.205,.164,.40,.165)
        waterfall(m,-.59,.08,.10);waterfall(m,.58,.07,.10)
        m.pine(-1.075,.265,.12,.76,True,.64);m.pine(1.075,.275,.12,.81,False,.64)
        if level==3:
            # A third private rooftop bath and upper pagoda crown distinguish Lv3.
            bath(m,-1.075,-.19,.10,.15,.12)
            m.hip_roof(.02,.235,1.035,.46,.35,.19)
            m.pine(-.28,.34,.11,.56);m.pine(.38,.32,.10,.43,True)
            for x in (-.72,.73):
                m.sphere((x,.06,.29),(.13,.07,.18),'rock',8,5)
                m.sphere((x-.02,.08,.40),(.085,.065,.12),'rock_light',8,5)
    # Cedar entrance arch, stepping stones and surrounding gardens.
    for x in (-.20,.20):m.cyl((x,-.401,.246),.026,.29,'wood',10)
    m.box((0,-.401,.392),(.49,.07,.046),'wood_light');m.box((0,-.401,.438),(.58,.065,.043),'navy')
    for x in (-.30,.30):m.hedge(x,-.36,.14,.09)
    for x in (-1.13,1.13):m.hedge(x,-.05,.14,.105)
    for i in range(4):m.oval((-.025,-.39+i*.055,.111),(.043,.021),.013,'cream',10)
    return m

builders=[fn(lv) for fn in (skyscraper,finance,onsen) for lv in (1,2,3)]
roots=[]
for i,m in enumerate(builders):
    # Three rows by family, three ascending levels left to right.
    roots.append(m.join(((i%3-1)*2.75,(i//3-1)*2.30,0)))
    print('BUILT',m.name,'base vertices',len(m.v),flush=True)
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for ob in root.children:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'landmarks.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
compact_normals(OUT/'landmarks.glb')
manifest={}
for root in roots:
    verts=[v.co for ob in root.children for v in ob.data.vertices]
    lo=[min(v[a] for v in verts) for a in range(3)];hi=[max(v[a] for v in verts) for a in range(3)]
    tris=sum(len(p.vertices)-2 for ob in root.children for p in ob.data.polygons)
    bounds={'min':[round(lo[0],4),round(lo[2],4),round(-hi[1],4)],'max':[round(hi[0],4),round(hi[2],4),round(-lo[1],4)]}
    entry={'width':round(hi[0]-lo[0],4),'depth':round(hi[1]-lo[1],4),'height':round(hi[2],4),'base_z':round(lo[2],4),'triangles':tris,'bounds':bounds}
    if root.name.startswith('skyscraper_'):
        h=hi[2]
        entry['frameBoxes']={'podium':{'min':[-1.09,0,-.44],'max':[1.09,min(.65,h*.29),.44]},'body':{'min':[-.85,.24,-.31],'max':[.85,round(h*.86,4),.32]},'crown':{'min':[-.30,round(h*.81,4),-.23],'max':[.30,round(h,4),.23]}}
    manifest[root.name]=entry
(OUT/'landmarks-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')

# Editable studio, with plinths separate from exported models.
bg=mat('Studio warm chalk','E4D7C0',.8);plinth=mat('Studio porcelain bases','FFF0D3',.7)
for root in roots:
    bpy.ops.mesh.primitive_cube_add(size=1,location=(root.location.x,root.location.y,-.07));ob=bpy.context.object;ob.name='Studio '+root.name;ob.scale=(2.40,1.20,.13);ob.data.materials.append(plinth)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bevel=ob.modifiers.new('Plinth rounds','BEVEL');bevel.width=.05;bevel.segments=4;bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.145));bpy.context.object.name='Studio ground';bpy.context.object.data.materials.append(bg)
scene=bpy.context.scene;scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.60,.70,.74,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.30
def light(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
light('Warm window softbox',(-5,-7,10),1450,7,(1,.84,.65));light('Sky softbox',(5,0,8),1050,6,(.68,.87,1));light('Honey rim',(0,7,9),1700,5,(1,.94,.78))
data=bpy.data.cameras.new('Landmark library camera');cam=bpy.data.objects.new('Landmark library camera',data);scene.collection.objects.link(cam)
cam.location=(9,-14,12);cam.rotation_euler=(Vector((0,0,1.05))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=11.6;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=56;scene.cycles.use_denoising=True
scene.render.resolution_x=2200;scene.render.resolution_y=1750;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW/'landmarks-preview.png');scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'landmarks.blend'))
render_only=os.environ.get('LANDMARK_RENDER_ONLY','')
if not render_only:bpy.ops.render.render(write_still=True)
for hero in (render_only,) if render_only else ('skyscraper_3','finance_3','onsen_3'):
    chosen=bpy.data.objects[hero]
    for r in roots:
        for ob in r.children:ob.hide_render=(r!=chosen)
        bpy.data.objects['Studio '+r.name].hide_render=(r!=chosen)
    location=chosen.location;h=manifest[hero]['height'];target=Vector((location.x,location.y,h*.47))
    cam.location=target+Vector((5,-8,5.6 if hero=='onsen_3' else 4.4));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    data.ortho_scale=3.25 if hero=='onsen_3' else 5.35 if hero=='skyscraper_3' else 4.30
    scene.render.resolution_x=1700;scene.render.resolution_y=1600;scene.render.filepath=str(PREVIEW/(hero+'-closeup.png'))
    bpy.ops.render.render(write_still=True)
print('LANDMARKS_COMPLETE',os.path.getsize(OUT/'landmarks.glb'),'bytes',json.dumps(manifest),flush=True)
