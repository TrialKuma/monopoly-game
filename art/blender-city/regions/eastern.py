"""Reference-led Kyoto and Alpine architecture, built as solid Blender geometry.

Public API: build(region, asset) -> a ground-centred, Z-up root facing -Y.
No inference, no destructive scene reset, no publishing or export side effects.
"""
from pathlib import Path
import importlib.util
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
legacy=module('eastern_mesh',ROOT/'art/build_regional_city.py')
study=module('eastern_approved_study',ROOT/'art/blender-quality-study/kyoto-villa2/build_kyoto_villa2.py')
class Mesh(legacy.Mesh):
    """Keep visible bevels; sub-5.5cm battens have crisp manufactured edges.

    At the runtime parcel scale these thinner members are below a pixel wide.
    Giving every rail and roof batten a 26-face bevel obscures their shape while
    wasting most of the mesh. Major framing retains the sample's real bevels.
    """
    def box(self,p,size,material,rotate=0):
        x,y,z=p;a,b,c=(s/2 for s in size);co,si=math.cos(rotate),math.sin(rotate)
        corners=[(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]
        self.poly([(x+u*co-v*si,y+u*si+v*co,z+q) for u,v,q in corners],[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],material,bevel=min(size)>=.055)
TAU=math.tau
FACES=((0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0))

def materials(region):
    palette={
        'compact':{'wall':'E8D5AD','dark':'443222','wood':'765036','lightwood':'9E764F','roof':'3D4B5B','edge':'586678','stone':'A4A59D','stone2':'BDB8A6','glass':'EEB55F','unlit':'85714B','indigo':'253C67','cream':'ECD7A9','bronze':'966938','leaf':'54723B','leaf2':'7B9848','water':'66BFC6'},
        'alpine':{'wall':'EAD8B5','dark':'483A2A','wood':'92623E','lightwood':'BF925F','roof':'BC5839','edge':'DC7951','stone':'A6A194','stone2':'C2BAA8','glass':'F6BD63','unlit':'6D624A','indigo':'377D7C','cream':'F2E1B9','bronze':'966830','leaf':'48724B','leaf2':'749B50','water':'6DBFC6'},
    }[region]
    return {k:study.material(region+' / '+k,c,.78 if k in ('wall','stone','stone2') else .51,.08 if k=='glass' else 0) for k,c in palette.items()}

def beam(b,a,c,w,d,mat='wood'):
    a,c=Vector(a),Vector(c);axis=(c-a).normalized()
    aux=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0))
    u=axis.cross(aux).normalized();v=axis.cross(u).normalized()
    vv=[tuple(p+sx*w/2*u+sy*d/2*v) for p in (a,c) for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1))]
    b.poly(vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,bevel=True)

def directions(w,d):
    return ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w))

def masonry(b,w,d,z,height,rows=3,facades=None,front_limit=None):
    for angle,span,depth in directions(w,d):
        if facades is not None and angle not in facades:continue
        with b.facing(angle):
            cells=max(4,round(span/.31));cw=span/cells
            for row in range(rows):
                for i in range(cells):
                    x=-span/2+(i+.5)*cw
                    if angle==0 and front_limit is not None and abs(x)>front_limit:continue
                    b.box((x,-depth/2-.025,z+(row+.5)*height/rows),(cw-.014,.075,height/rows-.014),'stone2' if (i+row)%4==0 else 'stone')

def base(b,w,d):
    b.box((0,0,.085),(w+.18,d+.18,.17),'stone')
    masonry(b,w+.06,d+.06,.05,.19,1)
    b.box((0,-d/2-.19,.055),(.90,.40,.11),'stone2')
    b.box((0,-d/2-.10,.12),(.86,.24,.12),'stone')

def tiles(b,x0,x1,y0,y1,z0,z1,cols,rows,roll=True,collars=True):
    """Solid roof deck and visible tile shells; no hidden tile undersides.

    Along a straight pitch the original middle tile row is exactly coplanar,
    so it is removed without changing shape. Five transverse samples keep the
    reference's concave pan. The narrow convex caps use smooth 4-segment arcs.
    """
    deck=[(x0,y0,z0-.015),(x1,y0,z0-.015),(x1,y1,z1-.015),(x0,y1,z1-.015)]
    deck+= [(x,y,z-.034) for x,y,z in deck]
    b.poly(deck,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'roof')
    width=(x1-x0)/cols;slope=(z1-z0)/(y1-y0)
    for row in range(rows):
        yy0=y0+(y1-y0)*row/rows;yy1=y0+(y1-y0)*min(1,(row+1.10)/rows)
        for col in range(cols):
            xx0=x0+col*width;xx1=xx0+width;vv=[]
            for yy,t in ((yy0,0),(yy1,1)):
                for i in range(5):
                    u=i/4;vv.append((xx0+u*width,yy,z0+(yy-y0)*slope+.020*t+.022*(2*u-1)**2))
            ff=[(i,i+1,i+6,i+5) for i in range(4)]
            if y1<y0:ff=[tuple(reversed(f)) for f in ff]
            b.poly(vv,ff,'roof',True)
            # The visible front cut of every tile course has physical thickness.
            lip=vv[5:]+[(x,y,z-.017) for x,y,z in vv[5:]]
            faces=[(i,i+1,i+6,i+5) for i in range(4)]
            if y1>y0:faces=[tuple(reversed(f)) for f in faces]
            b.poly(lip,faces,'edge',False)
            for i in (0,4):
                if (i==0 and col==0) or (i==4 and col==cols-1):
                    a=vv[i];c=vv[i+5]
                    b.poly([a,c,(c[0],c[1],c[2]-.025),(a[0],a[1],a[2]-.025)],[(0,1,2,3)],'roof')
        if roll:
            for col in range(cols+1):
                xx=x0+col*width;n=5;vv=[]
                for yy,t in ((yy0,0),(yy1,1)):
                    zz=z0+(yy-y0)*slope+.020*t+.022
                    for k in range(n):
                        a=math.pi*k/(n-1);vv.append((xx+.036*math.cos(a),yy,zz+.036*math.sin(a)))
                ff=[(i,i+1,i+n+1,i+n) for i in range(n-1)]
                caps=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
                if y1>y0:ff=[tuple(reversed(f)) for f in ff];caps=[tuple(reversed(f)) for f in caps]
                b.poly(vv,ff,'roof',True);b.poly(vv,caps,'roof')
                if row<rows-1 and collars:
                    yy=yy1-(yy1-yy0)*.04;zz=z0+(yy-y0)*slope+.044
                    cuff=[]
                    for y in (yy,yy+(y1-y0)*.009):
                        for k in range(n):
                            a=math.pi*k/(n-1);cuff.append((xx+.037*math.cos(a),y,zz+(y-yy)*slope+.037*math.sin(a)))
                    ff=[(i,i+1,i+n+1,i+n) for i in range(n-1)]
                    if y1>y0:ff=[tuple(reversed(f)) for f in ff]
                    b.poly(cuff,ff,'edge',True)

def roof(b,region,w,d,z,rise=.58,axis='x',cols=None,rows=5):
    """Continuous watertight gables plus ordered ceramic pans and solid end caps."""
    if axis=='y':
        with b.facing(math.pi/2):roof(b,region,d,w,z,rise,'x',cols,rows)
        return
    cols=cols or max(6,min(16,round(w/.22)))
    for sign in (-1,1):
        # Physical course ends already describe the tile overlaps.
        # An almost-coplanar extra cuff on each cap only creates dark flecks
        # at the elevated phone camera; keep the complete ceramic cap itself.
        tiles(b,-w/2,w/2,0,sign*d/2,z+rise,z,cols,rows,True,collars=False)
        b.box((0,sign*d/2,z-.042),(w+.06,.11,.085),'wood')
        b.box((0,sign*(d/2+.050),z-.018),(w+.07,.024,.024),'lightwood')
        for k in range(cols):
            xx=-w/2+(k+.5)*w/cols;b.box((xx,sign*(d/2-.015),z-.105),(.043,.18,.09),'wood')
        for xx in (-w/2+.10,w/2-.10):
            beam(b,(xx,sign*(d/2-.16),z-.22),(xx,sign*(d/2+.025),z-.055),.07,.07)
    for x in (-w/2,w/2):
        for sign in (-1,1):
            beam(b,(x,0,z+rise-.03),(x,sign*d/2,z-.04),.09,.08)
            for k in range(rows):
                a=k/rows+.002;c=(k+1)/rows-.002
                beam(b,(x+math.copysign(.044,x),sign*d/2*a,z+rise*(1-a)+.029),(x+math.copysign(.044,x),sign*d/2*c,z+rise*(1-c)+.029),.073,.075,'roof')
        b.rod((x-.05,0,z+rise+.06),(x+.05,0,z+rise+.06),.076,'edge',12)
    for i in range(cols):
        x=-w/2+i*w/cols;b.rod((x,0,z+rise+.052),(x+w/cols-.006,0,z+rise+.052),.060,'roof',10)

def gable_infill(b,w,d,z,rise,front=True,framing=True,region=None):
    # Front gable for chalets / side gable for machiya.
    with b.facing(0 if front else math.pi/2):
        span,dep=(w,d) if front else (d,w)
        for s in (-1,1):
            y=s*dep/2;b.xz_shape([(-span/2,z),(span/2,z),(0,z+rise)],(0,y,0),.045,'wall')
            if framing:
                yy=y+math.copysign(.04,y)
                # The ceramic pan reference is its exterior, not a beam
                # centreline. Include the beam section's projection against
                # the pitch, plus the .015 roof-deck inset and .005 clearance.
                # A fixed vertical offset fails on the steeper front gables.
                # This leaves the full visible timber A-frame on the gable face,
                # while its upper corners cannot pierce the ridge-side pans.
                recess=.020+.045*math.sqrt(1+(2*rise/span)**2) if region in ('compact','alpine') else 0
                frame_z=z-recess
                for a,c in (((-span/2,yy,frame_z),(0,yy,frame_z+rise)),((0,yy,frame_z+rise),(span/2,yy,frame_z))):beam(b,a,c,.08,.09)
                beam(b,(0,yy,frame_z),(0,yy,frame_z+rise),.09,.10)
                for sign in (-1,1):beam(b,(0,yy,frame_z+.04),(sign*span*.29,yy,frame_z+rise*.40),.065,.065)

def eave(b,w,d,z,region=None):
    for sign in (-1,1):
        tiles(b,-w/2-.15,w/2+.15,sign*(d/2-.02),sign*(d/2+.31),z+.16,z,max(7,min(24,round(w/.22))),2,True,collars=False)
        b.box((0,sign*(d/2+.30),z-.04),(w+.36,.10,.075),'wood')
        for i in range(max(6,round(w/.22))):
            n=max(6,round(w/.22));b.box((-w/2+(i+.5)*w/n,sign*(d/2+.25),z-.105),(.04,.19,.09),'wood')

def grid_window(b,x,y,z,w=.55,h=.62,cols=5,rows=2):
    study.window(b,x,y,z,w,h,cols,rows,True)

def flowerbox(b,x,y,z,w=.53):
    b.box((x,y,z),(w,.21,.14),'wood')
    for zz in (z-.048,z+.048):b.box((x,y-.115,zz),(w+.045,.026,.028),'lightwood')
    for k in range(6):
        xx=x-w*.43+k*w*.86/5
        b.sphere((xx,y,z+.12),(.10,.105,.082),'leaf' if k%2 else 'leaf2',6,3)
        for q in range(2):b.sphere((xx+.025*(q*2-1),y-.045,z+.173+q*.025),(.027,.025,.022),'cream',6,3)

def shutter_window(b,x,y,z,w=.48,h=.62,flowers=False,arched=False,max_span=None):
    # Include both open shutters and their straps in the available wall bay.
    # Glass width alone used to fit while the two neighbouring shutters overlapped.
    shutter_w=.22
    if max_span is not None and w+.525>max_span:
        w=min(w,max_span*.53)
        shutter_w=(max_span-w-.085)/2
        assert shutter_w>=.04, 'Opening is too narrow for a framed shutter window'
    if arched:
        b.arch(x,y-.025,z,w+.16,h+.12,'stone',.08)
        b.arch(x,y-.080,z+.025,w,h,'glass',.025)
        b.box((x,y-.130,z+h*.48),(.031,.037,h*.87),'wood')
        for zz in (z+.035,z+h*.40,z+h*.71):b.box((x,y-.131,zz),(w,.038,.030),'wood')
        for xx in (x-w/2+.015,x+w/2-.015):b.box((xx,y-.125,z+(h-w/2)/2),(.032,.036,h-w/2),'wood')
        for k in range(12):
            a=k*math.pi/12;c=(k+1)*math.pi/12
            b.rod((x+math.cos(a)*w/2,y-.130,z+h-w/2+math.sin(a)*w/2),(x+math.cos(c)*w/2,y-.130,z+h-w/2+math.sin(c)*w/2),.018,'wood',6)
        b.box((x,y-.11,z),(w+.14,.14,.055),'stone2')
    else:grid_window(b,x,y,z,w,h,2,2)
    for sign in (-1,1):
        sx=x+sign*(w/2+.03+shutter_w/2);b.box((sx,y-.07,z+h/2),(shutter_w,.065,h+.035),'indigo')
        slat_step=.067 if shutter_w==.22 else shutter_w*.3045
        for k in range(3):b.box((sx+(k-1)*slat_step,y-.108,z+h/2),(.008,.012,h-.025),'dark')
        for zz in (z+.10,z+h-.10):b.box((sx,y-.122,zz),(shutter_w+.025,.026,.043),'indigo')
    if flowers:flowerbox(b,x,y-.16,z-.07,w+.11)

def railing(b,w,y,z,region,flowers=False):
    b.box((0,y+.07,z),(w+.10,.37,.075),'wood')
    for xx in (-w/2,w/2):
        b.box((xx,y-.08,z+.19),(.075,.075,.40),'wood')
        b.sphere((xx,y-.08,z+.415),(.048,.048,.045),'lightwood',8,4)
    for zz in (z+.075,z+.37):b.box((0,y-.08,zz),(w+.12,.065,.065),'wood')
    n=max(5,round(w/.13))
    for i in range(n):b.box((-w/2+(i+.5)*w/n,y-.08,z+.22),(.037,.052,.26),'lightwood' if region=='alpine' else 'wood')
    for sign in (-1,1):
        b.box((sign*w/2,y+.07,z+.37),(.06,.32,.055),'wood')
        beam(b,(sign*w*.37,y+.20,z-.22),(sign*w*.37,y-.07,z-.03),.065,.065)
    if flowers:flowerbox(b,0,y-.16,z+.20,min(.67,w*.68))

def pot(b,x,y,z=0,flowers=False):
    b.cylinder((x,y,z+.15),.11,.27,'bronze',12,top=.145)
    b.cylinder((x,y,z+.29),.153,.04,'lightwood',12)
    b.cylinder((x,y,z+.312),.132,.01,'dark',12)
    for j in range(3):
        for k in range(7-j):
            a=k*TAU/(7-j)+j*.61
            start=Vector((x,y,z+.32+j*.065));tip=start+Vector((math.cos(a)*(.19-j*.033),math.sin(a)*(.19-j*.033),.09))
            middle=start.lerp(tip,.52)+Vector((0,0,.045));side=Vector((-math.sin(a),math.cos(a),0))*(.050-j*.007)
            b.rod(tuple(start),tuple(tip),.004,'wood',5)
            b.poly([tuple(start),tuple(middle-side),tuple(tip),tuple(middle+side),tuple(middle+Vector((0,0,.017)))],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'leaf' if k%2 else 'leaf2')
            if flowers and j==2:b.sphere(tuple(tip+Vector((0,0,.025))),(.029,.029,.025),'cream',6,3)

def lantern(b,x,y,z,region='compact'):
    b.rod((x,y+.10,z+.28),(x,y-.08,z+.28),.014,'bronze',8)
    b.rod((x,y-.08,z+.28),(x,y-.08,z+.17),.009,'dark',8)
    if region=='compact':
        b.cylinder((x,y-.08,z),.079,.27,'glass',12)
        for zz in (z-.14,z+.14):b.cylinder((x,y-.08,zz),.072,.025,'dark',12)
        for j in range(6):
            zz=z-.12+j*.048
            for k in range(12):
                a=k*TAU/12;c=(k+1)*TAU/12
                b.rod((x+.08*math.cos(a),y-.08+.08*math.sin(a),zz),(x+.08*math.cos(c),y-.08+.08*math.sin(c),zz),.003,'cream',4)
    else:
        b.box((x,y-.08,z),(.13,.13,.21),'glass')
        for xx in (-.073,.073):
            for yy in (-.073,.073):b.box((x+xx,y-.08+yy,z),(.018,.018,.24),'dark')
        b.cylinder((x,y-.08,z+.16),.13,.11,'dark',4,top=.035)
        b.box((x,y-.08,z-.13),(.16,.16,.026),'dark')

def noren(b,y,z,w=.86,color='indigo'):
    b.rod((-w/2-.07,y,z+.05),(w/2+.07,y,z+.05),.022,'wood',10)
    for i in range(3):
        x=-w/2+(i+.5)*w/3;b.box((x,y-.01,z-.18),(w/3-.014,.025,.37),color)
    # Simple manufactured flower crest, readable at phone size.
    for k in range(5):
        a=k*TAU/5;b.sphere((.06*math.sin(a),y-.031,z-.18+.06*math.cos(a)),(.042,.009,.041),'cream',8,4)

def door(b,region,x,y,z=.17,w=.66,h=.98):
    if region=='compact':
        grid_window(b,x,y,z,w,h,7,4)
        b.box((x,y-.14,z+h/2),(.046,.04,h+.04),'wood')
        b.box((x,y-.11,z+.10),(w,.035,.20),'wood')
    else:
        b.arch(x,y-.015,z,w+.17,h+.11,'stone2',.09)
        b.arch(x,y-.078,z+.025,w,h,'wood',.035)
        for k in range(7):
            xx=x-w*.43+k*w*.86/6;rise=math.sqrt(max(0,(w/2)**2-(xx-x)**2))
            b.box((xx,y-.103,z+.04+(h-w/2+rise-.04)/2),(.009,.015,h-w/2+rise-.04),'dark')
        for zz in (z+.23,z+.67):
            b.box((x-w*.23,y-.125,zz),(.16,.03,.034),'dark')
            b.cylinder((x-w*.29,y-.145,zz),.02,.01,'bronze',8)
        b.rod((x+w*.20,y-.12,z+.48),(x+w*.20,y-.16,z+.48),.035,'bronze',10)

def timber_shell(b,region,w,d,floors,storey=1.12,balconies=False,window_count=2,facades=None,front_limit=None,flowerboxes=True,front_windows=True):
    bottom=.18;top=bottom+floors*storey
    b.box((0,0,(bottom+top)/2),(w,d,top-bottom),'wall')
    if region=='alpine':masonry(b,w,d,.17,min(.94,storey-.12),4,facades,front_limit)
    for level in range(floors):
        z=bottom+level*storey
        for angle,span,depth in directions(w,d):
            if facades is not None and angle not in facades:continue
            with b.facing(angle):
                for x in (-span/2,span/2):b.box((x,-depth/2-.026,z+storey/2),(.095,.10,storey+.02),'wood')
                for zz in (z+.035,z+storey-.035):
                    b.box((0,-depth/2-.035,zz),(span+.08,.095,.075),'wood')
                    b.box((0,-depth/2-.086,zz+.02),(span+.09,.018,.016),'lightwood')
                if region=='compact':
                    n=max(7,round(span/.16))
                    for k in range(n):
                        xx=-span/2+(k+.5)*span/n
                        if angle==0 and front_limit is not None and abs(xx)>front_limit:continue
                        b.box((xx,-depth/2-.047,z+.15),(span/n-.009,.045,.22),'wood' if k%3 else 'dark')
                # Front ground floor is reserved for the per-family entrance.
                if angle==0 and (level==0 or not front_windows):continue
                count=window_count if angle in (0,math.pi) else max(1,round(span/1.1))
                ww=min(.62,(span-.28)/count-.22)
                for k in range(count):
                    x=(k-(count-1)/2)*(span-.28)/count
                    if angle==0 and front_limit is not None and abs(x)>front_limit:continue
                    if region=='compact':grid_window(b,x,-depth/2-.045,z+.31,ww,.56,6,2)
                    else:
                        spacing=(span-.28)/count
                        clearance=min(spacing-.045,span-(count-1)*spacing-.16) if count>1 else span-.16
                        shutter_window(b,x,-depth/2-.045,z+.31,min(.47,ww-.08),.56,flowers=flowerboxes and level>0 and not balconies,max_span=clearance)
                if balconies and level>0 and angle in (0,math.pi):railing(b,min(span-.18,front_limit*2) if angle==0 and front_limit is not None else span-.18,-depth/2-.25,z+.20,region,region=='alpine')
        if region=='compact' and level>0:eave(b,w,d,z+.07,region)
    return top

def chimney(b,x,y,z):
    b.box((x,y,z+.31),(.28,.29,.62),'stone')
    with b.at((x,y,z)):masonry(b,.27,.28,0,.62,5)
    b.box((x,y,z+.64),(.36,.36,.085),'stone2')
    b.box((x,y,z+.70),(.25,.25,.04),'dark')
    b.box((x,y,z+.76),(.32,.32,.065),'stone')

def awning(b,x,y,z,w):
    n=max(6,round(w/.20))
    for k in range(n):
        xx=x-w/2+(k+.5)*w/n
        b.poly([(xx-w/n/2,y,z),(xx+w/n/2,y,z),(xx+w/n/2,y-.38,z-.22),(xx-w/n/2,y-.38,z-.22)],[(0,1,2,3)],'cream' if k%2 else 'roof')
        b.box((xx,y-.38,z-.265),(w/n-.008,.028,.095),'cream' if k%2 else 'roof')
    for xx in (x-w/2,x+w/2):beam(b,(xx,y,z-.30),(xx,y-.39,z-.22),.025,.025,'dark')

def shopfront(b,region,w,d,level):
    y=-d/2-.06
    if region=='compact':
        door(b,region,-w*.29,y,.17,.53,.99)
        grid_window(b,w*.13,y,.31,w*.54,.71,7,3)
        b.box((w*.13,y-.19,.34),(w*.57,.36,.15),'wood')
        for k in range(5):b.sphere((w*.13-w*.22+k*w*.11,y-.24,.48),(.08,.065,.055),'bronze',8,4)
        with b.at((0,0,0)):noren(b,y-.25,1.16,w*.90,'leaf')
    else:
        door(b,region,w*.30,y,.17,.56,.98)
        grid_window(b,-w*.17,y,.32,w*.48,.69,3,2)
        for zz in (.42,.64):
            for k in range(5):b.sphere((-w*.37+k*w*.10,y-.102,zz),(.075,.038,.052),'bronze',8,4)
        awning(b,-w*.16,y,1.17,w*.58)
    for x in (-w*.44,w*.44):pot(b,x,y-.22,flowers=region=='alpine')

def front_gable(b,region,w,d,z,rise=.42):
    gable_infill(b,w,d,z,rise,True,region=region)
    roof(b,region,w+.22,d+.20,z,rise,'y',rows=3)

def core(region,family,level,mats):
    b=Mesh(f'{region}_{family}_{level}',mats)
    w=2.32 if region=='compact' else 2.38;d=1.65 if region=='compact' else 1.82
    if level==1 and family=='villa':w=2.85 if region=='compact' else 2.60
    if family=='tower':w=2.02;d=1.84
    if family=='hotel':w=2.62;d=1.94
    base(b,w,d);top=timber_shell(b,region,w,d,level,balconies=family=='hotel' or (family=='tower' and region=='compact'),window_count=3 if family=='hotel' else 2,front_windows=not(region=='alpine' and family=='tower' and level>=2))
    rise=.56 if region=='compact' else .71
    gable_infill(b,w,d,top,rise,region=='alpine',region=region)
    roof(b,region,w+.36,d+.40,top+.015,rise,'x' if region=='compact' else 'y')
    y=-d/2-.065
    if family=='shop':shopfront(b,region,w,d,level)
    else:
        door(b,region,0,y,w=.72,h=1.00)
        flank_x=(w/2-.08+.445+.05)/2 if region=='alpine' else w*.33
        for x in (-flank_x,flank_x):
            if region=='compact':grid_window(b,x,y,.45,.50,.62,6,2)
            else:shutter_window(b,x,y,.44,.41,.59,flowers=level==1,max_span=2*min(w/2-.08-abs(x),abs(x)-.445-.05))
        for x in (-w*.43,w*.43):pot(b,x,y-.21,flowers=region=='alpine')
        if region=='compact':noren(b,y-.18,1.22,.85)
        for x in (-.58,.58) if family=='hotel' else (-.59,):lantern(b,x,y-.16,1.03,region)
    if region=='alpine':
        chimney(b,w*.33,d*.17,top+.32)
        if family=='villa' and level>=2:railing(b,w-.20,y-.22,1.50,region,True)
        if family=='tower':
            # Compact central arched bay and individual balconies are unlike chalet suites.
            for j in range(1,level):
                shutter_window(b,0,y+.05,.18+j*1.12+.31,.64,.65,False,True)
                railing(b,1.00,y-.18,.18+j*1.12+.20,region,True)
            for sign in (-1,1):
                for j in range(level*4):b.box((sign*(w/2-.015),y-.02,.28+j*.26),(.20,.13,.18),'stone' if j%2 else 'stone2')
    if family=='hotel':
        with b.at((0,-d/2-.08,0)):front_gable(b,region,1.07,.72,1.19,.38)
        if region=='compact' and level>=2:
            with b.at((0,-d/2+.11,0)):front_gable(b,region,1.65,.62,top+.10,.45)
    if family=='tower' and region=='compact':
        # Side annex and open rooftop lookout, both visible in the source views.
        with b.at((w/2+.21,.04,0)):
            timber_shell(b,region,.57,1.24,max(1,level-1),storey=1.03,window_count=1)
            roof(b,region,.80,1.48,.18+max(1,level-1)*1.03,.26,'x',6,3)
        zz=top+rise+.04
        for xx in (-.38,.38):
            for yy in (-.29,.29):b.box((xx,yy,zz+.26),(.09,.09,.52),'wood')
        for a in (0,math.pi):
            with b.facing(a):railing(b,.82,-.31,zz+.06,region)
        roof(b,region,1.17,1.03,zz+.52,.28,'x',7,3)
    return b.finish(bevel=.006)

def emblem(b,x,y,z,kind='coin',r=.18):
    b.rod((x,y+.02,z),(x,y-.02,z),r*1.13,'wood',24)
    b.rod((x,y-.025,z),(x,y-.04,z),r,'cream',24)
    if kind=='clock':
        for k in range(12):
            a=k*TAU/12;b.rod((x+math.sin(a)*r*.78,y-.052,z+math.cos(a)*r*.78),(x+math.sin(a)*r*.91,y-.052,z+math.cos(a)*r*.91),.007,'dark',5)
        b.rod((x,y-.06,z),(x-r*.45,y-.06,z+r*.30),.010,'dark',6)
        b.rod((x,y-.06,z),(x+r*.13,y-.06,z+r*.65),.009,'dark',6)
    elif kind=='coin':
        for xx,zz in ((-.065,-.04),(.065,-.04),(0,.07)):
            b.rod((x+xx,y-.05,z+zz),(x+xx,y-.085,z+zz),r*.27,'bronze',16)
    else:
        b.box((x,y-.06,z-.015),(.035,.026,r),'indigo');b.sphere((x,y-.06,z+r*.65),(.027,.015,.027),'indigo',8,4)

def clock_tower(b,region,x,y,z,w=.72):
    with b.at((x,y,z)):
        b.box((0,0,.47),(w,w*.80,.94),'wall')
        for xx in (-w/2,w/2):b.box((xx,-w*.4-.02,.47),(.08,.08,.96),'wood')
        emblem(b,0,-w*.4-.065,.53,'clock',w*.33)
        for xx in (-w*.35,w*.35):
            for yy in (-w*.29,w*.29):b.box((xx,yy,1.13),(.07,.07,.38),'wood')
        b.cylinder((0,0,1.11),w*.20,.24,'bronze',16,top=w*.10)
        roof(b,region,w+.28,w*.8+.26,1.33,.34,'x' if region=='compact' else 'y',6,3)

def crates(b,x,y,z=0):
    for dx,dy,dz in ((0,0,0),(.29,.04,0),(.05,.025,.27)):
        b.box((x+dx,y+dy,z+dz+.13),(.25,.28,.25),'lightwood')
        for zz in (.04,.22):b.box((x+dx,y+dy-.15,z+dz+zz),(.27,.025,.026),'wood')
        for xx in (-.09,.09):b.box((x+dx+xx,y+dy-.16,z+dz+.13),(.025,.025,.25),'wood')

def pool(b,x,y,z,w=1.4,d=.60):
    b.box((x,y,z-.04),(w,d,.09),'water')
    for sign in (-1,1):
        for i in range(7):b.box((x-w/2+(i+.5)*w/7,y+sign*(d/2+.05),z),(w/7-.014,.16,.17),'stone2' if i%2 else 'stone')
        b.box((x+sign*(w/2+.06),y,z),(.17,d+.27,.17),'stone')

def summit_roof(b,region,w,d,z,rise=.48,axis=None):
    """Hero roofs keep the full ceramic profile with fewer invisible courses."""
    axis=axis or ('x' if region=='compact' else 'y')
    gable_infill(b,w,d,z,rise,axis=='y',region=region)
    roof(b,region,w+.30,d+.30,z+.015,rise,axis,cols=10,rows=3)
    # Include the ceramic ridge end-cap, not just the theoretical roof plane.
    # Ornaments use this support height rather than an unrelated magic offset.
    return z+.015+rise+.136

def summit_room(b,region,w,d,z,height=.94,balconies=False,axis=None):
    with b.at((0,0,z)):
        top=timber_shell(b,region,w,d,1,height,balconies=False,window_count=2)
        # Ground-floor openings are deliberately authored here: these rooms
        # sit above a roof, so they need windows rather than another entrance.
        for x in (-w*.24,w*.24):
            if region=='compact':grid_window(b,x,-d/2-.05,.34,min(.55,w*.36),height*.55,4,2)
            else:shutter_window(b,x,-d/2-.05,.32,min(.40,w*.32),height*.56,False,max_span=min(w*.48-.045,w*.52-.16))
        if balconies:railing(b,w+.04,-d/2-.23,.22,region,region=='alpine')
        roof_top=summit_roof(b,region,w,d,top,.46,axis)
    return z+roof_top

def ridge_crest(b,x,y,z,axis='x'):
    # One complete ridge fitting: a seated bronze spine with two swept tips.
    # Orient it along the actual roof ridge so overhead views do not expose
    # two disconnected golden fragments across the ceramic courses.
    with b.at((x,y,z),math.pi/2 if axis=='y' else 0):
        beam(b,(-.31,0,-.01),(.31,0,-.01),.075,.09,'bronze')
        for s in (-1,1):
            beam(b,(s*.28,0,.025),(s*.41,0,.18),.070,.075,'bronze')
            beam(b,(s*.41,0,.18),(s*.37,0,.29),.058,.065,'bronze')

def level3_core(region,family,mats):
    """A distinct premium silhouette; never simply a third identical floor."""
    b=Mesh(f'{region}_{family}_3',mats)
    w=2.44 if family!='hotel' else 2.62;d=1.92
    base(b,w,d)
    floors=2 if region=='alpine' and family=='tower' else 3
    top=timber_shell(b,region,w,d,floors,1.14 if floors==2 else 1.06,balconies=False,window_count=2,flowerboxes=False)
    y=-d/2-.065
    if family in ('hotel','tower'):
        for story in range(1,floors):railing(b,w-.14,y-.17,.38+story*1.06,region,region=='alpine' and family=='hotel' and story==1)
    if family=='shop':shopfront(b,region,w,d,3)
    else:
        door(b,region,0,y,w=.78,h=1.06)
        flank_x=(w/2-.08+.475+.05)/2 if region=='alpine' else w*.33
        for x in (-flank_x,flank_x):
            if region=='compact':grid_window(b,x,y,.45,.49,.63,5,2)
            else:shutter_window(b,x,y,.44,.40,.60,max_span=2*min(w/2-.08-abs(x),abs(x)-.475-.05))
        for x in (-w*.43,w*.43):pot(b,x,y-.20,flowers=region=='alpine')
    # Shop lamps mount on the corner posts, outside the cloth / striped canopy.
    for x in (-1.24,1.24) if family=='shop' else (-.63,.63):lantern(b,x,y-.15,1.06,region)
    if region=='compact':
        summit_roof(b,region,w,d,top,.43)
        if family=='tower':
            # The Kyoto mansion becomes a tiered plaster-and-timber keep.
            # Broad lower eaves, a recessed middle tier and a high lookout
            # create three readable silhouettes, not one stretched tenement.
            summit=summit_room(b,region,2.03,1.49,top+.20,.92,True,'y')
            ridge_crest(b,0,0,summit,'y')
            with b.at((0,-d/2-.03,0)):front_gable(b,region,1.26,.77,1.32,.46)
            noren(b,y-.22,1.31,1.04)
        elif family=='villa':
            # A generous cross-gabled family estate, distinct from the keep.
            summit_room(b,region,1.62,1.31,top+.08,.90,True,'y')
            with b.at((-.68,-.86,0)):front_gable(b,region,.78,.54,top+.10,.42)
            noren(b,y-.18,1.27,.92)
        elif family=='shop':
            summit_room(b,region,1.46,1.32,top+.16,1.04,False)
            # A wide shop crest and paired banners mark the merchant guild.
            b.box((0,y-.12,2.15),(1.64,.10,.35),'indigo')
            for x in (-.55,0,.55):emblem(b,x,y-.19,2.15,'coin',.115)
            for x in (-w*.45,w*.45):
                b.box((x,y-.17,1.84),(.21,.045,.80),'indigo')
                b.box((x,y-.20,1.84),(.048,.025,.39),'cream')
        else:
            summit_room(b,region,1.77,1.38,top+.16,1.10,True)
            for x in (-.80,.80):
                with b.at((x,-.67,0)):front_gable(b,region,.70,.65,top+.08,.43)
            with b.at((0,-d/2-.07,0)):front_gable(b,region,1.15,.78,1.25,.42)
            noren(b,y-.22,1.24,.90)
    else:
        summit_roof(b,region,w,d,top,.76)
        if family=='tower':
            # Stone corner quoins and a tall open bellvedere are a real
            # regional mansion crown rather than Kyoto's stacked pavilion.
            with b.at((0,.05,top+.26)):
                timber_shell(b,region,1.58,1.28,1,1.00,window_count=1)
                shutter_window(b,0,-.69,.38,.74,.67,False,True)
                for x in (-.68,.68):
                    for yy in (-.55,.55):b.box((x,yy,1.48),(.12,.12,.59),'wood')
                b.cylinder((0,0,1.47),.28,.37,'bronze',14,top=.15)
                summit_roof(b,region,1.65,1.39,1.84,.71)
            for s in (-1,1):
                for j in range(8):b.box((s*(w/2-.04),y-.02,.34+j*.27),(.22,.15,.19),'stone2' if j%2 else 'stone')
        elif family=='shop':
            # A marketplace clock-and-bell turret over a broad bakery hall.
            clock_tower(b,region,0,.02,top+.38,1.03)
            for x in (-.78,.78):
                with b.at((x,-.60,0)):front_gable(b,region,.67,.54,top+.10,.53)
        elif family=='villa':
            summit_room(b,region,1.48,1.38,top+.04,1.25,True,'x')
            with b.at((.77,-.66,0)):front_gable(b,region,.76,.65,top+.03,.62)
            chimney(b,-.82,.44,top+.35)
            railing(b,w-.12,y-.19,1.54,region,True)
        else:
            summit_room(b,region,1.58,1.44,top+.14,1.06,True)
            for x in (-.83,.83):
                with b.at((x,-.61,0)):front_gable(b,region,.73,.68,top+.10,.61)
            with b.at((0,-d/2-.07,0)):front_gable(b,region,1.19,.80,1.27,.49)
            for x in (-.99,.99):
                b.box((x,.40,top+.72),(.25,.27,.72),'stone')
                b.box((x,.40,top+1.11),(.34,.35,.10),'stone2')
                b.box((x,.40,top+1.18),(.23,.24,.055),'dark')
    return b.finish(bevel=.006)

def thermal_badge(b,x,y,z):
    """Bath + three steam curls is language-independent, fully solid geometry."""
    b.box((x,y,z),(1.04,.12,.66),'indigo')
    for k in range(10):
        a=math.pi+math.pi*k/10;c=math.pi+math.pi*(k+1)/10
        b.rod((x+.34*math.cos(a),y-.08,z-.03+.12*math.sin(a)),(x+.34*math.cos(c),y-.08,z-.03+.12*math.sin(c)),.025,'cream',6)
    for off in (-.23,0,.23):
        for k in range(5):
            zz=z-.01+k*.05;xx=x+off+math.sin(k*1.35)*.025
            zz2=zz+.05;xx2=x+off+math.sin((k+1)*1.35)*.025
            b.rod((xx,y-.08,zz),(xx2,y-.08,zz2),.018,'cream',6)

def thermal_pool(b,x,y,z,w,d,region):
    # The open sky above the water is intentional: roofs no longer hide it.
    b.box((x,y,z-.09),(w+.18,d+.18,.25),'stone')
    b.box((x,y,z+.045),(w,d,.045),'water')
    for s in (-1,1):
        b.box((x,y+s*(d/2+.035),z+.10),(w+.18,.15,.15),'stone2')
        b.box((x+s*(w/2+.035),y,z+.10),(.15,d+.15,.15),'stone2')
    for k in range(5):
        xx=x-w*.38+k*w*.19;yy=y+d*.38
        b.sphere((xx,yy,z+.15),(.19,.13,.14),'stone2' if k%2 else 'stone',7,3)
    # Waterfall spill at the rear and broad concentric ripple arcs.
    b.box((x+w*.28,y+d*.45,z+.30),(.38,.23,.47),'stone')
    b.box((x+w*.28,y+d*.33,z+.29),(.21,.028,.36),'water')
    for radius in (.18,.29):
        for k in range(9):
            a=math.pi+k*math.pi/9;c=math.pi+(k+1)*math.pi/9
            b.rod((x+w*.27+math.cos(a)*radius,y+d*.17+math.sin(a)*radius,z+.074),(x+w*.27+math.cos(c)*radius,y+d*.17+math.sin(c)*radius,z+.074),.009,'cream',5)

def thermal_resort(region,level,mats):
    """An open U-plan bath garden, visible from the actual elevated game camera."""
    if level==3:return thermal_palace(region,mats)
    b=Mesh(f'{region}_onsen_{level}',mats)
    w=6.65;d=2.85;base(b,w,d)
    # A narrow rear hall and short end pavilions leave the whole front centre
    # uncovered. The pool occupies a third of the footprint, at every level.
    with b.at((0,.77,0)):
        top=timber_shell(b,region,6.28,1.15,level if level<3 else 2,.93,window_count=5,flowerboxes=False)
        summit_roof(b,region,6.28,1.15,top,.44,'x')
        door(b,region,0,-.65,.18,.76,.87)
    for s in (-1,1):
        with b.at((s*2.60,-.26,0)):
            side_top=timber_shell(b,region,1.12,1.75,1 if level==1 else 2,.88,window_count=1,flowerboxes=False)
            summit_roof(b,region,1.12,1.75,side_top,.42,'y')
            door(b,region,0,-.93,.18,.57,.81)
            lantern(b,0,-1.02,1.04,region)
    if level==3:
        with b.at((0,.70,0)):
            summit_room(b,region,2.25,1.14,top+.12,1.16,True,'y' if region=='alpine' else 'x')
            if region=='compact':ridge_crest(b,0,0,top+1.98)
        thermal_pool(b,-.84,-.60,.23,1.43,1.16,region)
        thermal_pool(b,.84,-.60,.23,1.43,1.16,region)
        # A low timber footbridge between the two pools frames the courtyard.
        b.box((0,-.60,.31),(.26,1.42,.10),'wood')
        for s in (-1,1):
            for yy in (-1.20,0):b.box((s*.19,yy,.53),(.045,.045,.44),'wood')
            b.box((s*.19,-.60,.74),(.045,1.24,.05),'lightwood')
    else:thermal_pool(b,0,-.60,.23,2.85,1.16,region)
    thermal_badge(b,0,.10,1.04 if level==1 else 1.72)
    # Deck stools, rolled towels, planting and stone lanterns are deliberately
    # kept on the wings so neither the water nor the walking route is hidden.
    for s in (-1,1):
        pot(b,s*1.93,-1.06,flowers=region=='alpine')
        b.cylinder((s*1.93,-.49,.34),.18,.22,'wood',12)
        b.rod((s*1.93-.12,-.49,.48),(s*1.93+.12,-.49,.48),.062,'cream',10)
        b.cylinder((s*1.88,.08,.31),.16,.44,'stone',8)
        b.box((s*1.88,.08,.62),(.29,.29,.22),'glass')
        b.cylinder((s*1.88,.08,.80),.25,.17,'roof',4,top=.07)
    root=b.finish(bevel=.006)
    root['thermalPools']=[[-.84,-.60,.298,1.43,1.16],[.84,-.60,.298,1.43,1.16]] if level==3 else [[0,-.60,.298,2.85,1.16]]
    return root

def level3_large(region,family,mats):
    """The highest tier is a dominant broad keep with subordinate side halls."""
    b=Mesh(f'{region}_{family}_3',mats);w=6.55;d=2.16;base(b,w,d)
    central_width=3.28 if family=='skyscraper' else 3.13
    # Deliberately no continuous high horizontal slab: the centre is a real
    # three/four-storey body, while the lower wings visibly frame its height.
    for s in (-1,1):
        # Inner wing walls are genuinely buried in the main hall, rather than
        # leaving a sliver of undecorated facade visible through a side gap.
        with b.at((s*(central_width/2+.65),-.02,0)):
            t=timber_shell(b,region,1.40,1.91,2,.98,window_count=1,facades=(0,math.pi,math.pi/2 if s>0 else math.pi*1.5),flowerboxes=False)
            summit_roof(b,region,1.40,1.91,t,.64,'y')
            door(b,region,0,-1.02,.18,.64,.94)
    floors=4 if region=='alpine' and family=='finance' else 3
    top=timber_shell(b,region,central_width,2.04,floors,1.24,window_count=3 if region=='compact' else 2,flowerboxes=False)
    y=-1.09;door(b,region,0,y,.18,1.08,1.30)
    for x in (-.77,.77):b.box((x,y-.22,.96),(.16,.16,1.57),'wood')
    with b.at((0,y+.03,0)):front_gable(b,region,1.94,.78,1.75,.56)
    for x in (-1.10,1.10):lantern(b,x,y-.18,1.33,region)
    if region=='compact':
        summit_roof(b,region,central_width,2.04,top,.56,'x')
        if family=='skyscraper':
            summit_room(b,region,2.81,1.72,top+.20,1.31,True)
            crest=summit_room(b,region,2.12,1.42,top+1.81,1.06,True,'y')
            ridge_crest(b,0,0,crest,'y')
        else:
            # A glazed ceremonial exchange hall, with full-height timber
            # bays on every facade and twin projecting roof gables.
            crest=exchange_hall(b,2.69,1.73,top+.28,1.82)
            ridge_crest(b,0,0,crest)
            for x in (-1.30,1.30):
                b.box((x,y-.12,2.12),(.42,.055,1.74),'indigo');emblem(b,x,y-.18,2.34,'coin',.18)
                crates(b,x-.10,y-.15,.06)
        for z in (1.42,2.66):railing(b,central_width-.14,y-.17,z,region)
    else:
        summit_roof(b,region,central_width,2.04,top,.76,'y')
        if family=='skyscraper':
            summit_room(b,region,2.61,1.69,top+.26,1.44,False,'y')
            # The grand hotel ends in a panoramic suite, not the exchange's
            # civic clock face. Large gables and a balcony identify lodging.
            observation_suite(b,2.03,1.40,top+1.92)
            for z in (1.42,2.66):railing(b,central_width-.16,y-.18,z,region,z==1.42)
            for x in (-2.49,2.49):chimney(b,x,.36,2.65)
        else:
            clock_tower(b,region,0,.03,top+.32,2.27)
            for s in (-1,1):
                for j in range(17):b.box((s*(central_width/2-.05),y-.02,.35+j*.28),(.24,.15,.20),'stone2' if j%2 else 'stone')
            for x in (-1.15,1.15):
                b.box((x,y-.11,2.06),(.42,.05,1.72),'indigo');emblem(b,x,y-.16,2.26,'coin',.19)
    return b.finish(bevel=.006)

def exchange_hall(b,w,d,z,height):
    with b.at((0,0,z)):
        b.box((0,0,.18+height/2),(w,d,height),'wall')
        for angle,span,depth in directions(w,d):
            with b.facing(angle):
                for x in (-span/2,span/2):b.box((x,-depth/2-.035,.18+height/2),(.12,.12,height+.10),'wood')
                for zz in (.22,.18+height*.54,.18+height):b.box((0,-depth/2-.065,zz),(span+.10,.12,.10),'wood')
                count=3 if angle in (0,math.pi) else 2
                for k in range(count):
                    xx=(k-(count-1)/2)*(span-.16)/count
                    grid_window(b,xx,-depth/2-.08,.34,(span-.16)/count-.13,height-.29,6,5)
        railing(b,w+.02,-d/2-.21,.22,'compact')
        roof_top=summit_roof(b,'compact',w,d,.18+height,.50,'x')
        for xx in (-.71,.71):
            with b.at((xx,-d/2+.03,0)):front_gable(b,'compact',1.05,.74,.18+height+.03,.65)
    return z+roof_top

def observation_suite(b,w,d,z):
    with b.at((0,0,z)):
        b.box((0,0,.68),(w,d,1.00),'wall')
        for angle,span,depth in directions(w,d):
            with b.facing(angle):
                for x in (-span/2,span/2):b.box((x,-depth/2-.03,.69),(.10,.10,1.06),'wood')
                for zz in (.22,1.16):b.box((0,-depth/2-.03,zz),(span+.09,.09,.09),'wood')
                for x in (-span*.25,span*.25):grid_window(b,x,-depth/2-.06,.36,span*.43,.69,3,2)
        railing(b,w+.04,-d/2-.21,.22,'alpine',False)
        summit_roof(b,'alpine',w,d,1.19,.66,'y')

def thermal_palace(region,mats):
    """High bathhouse behind an uncovered terraced rock-water courtyard."""
    b=Mesh(f'{region}_onsen_3',mats);base(b,6.65,2.85)
    for s in (-1,1):
        with b.at((s*2.60,-.20,0)):
            top=timber_shell(b,region,1.15,1.82,2,1.01,window_count=1,flowerboxes=False)
            summit_roof(b,region,1.15,1.82,top,.53,'y')
            door(b,region,0,-.98,.18,.61,.93)
            lantern(b,0,-1.03,1.12,region)
    # This broad three-storey hall is the primary landmark. Its front face
    # stays behind the pool edge; no eave crosses the bath's exposed centre.
    with b.at((0,.81,0)):
        top=timber_shell(b,region,3.33,1.16,3,1.24,window_count=3,flowerboxes=False)
        summit_roof(b,region,3.33,1.16,top,.54,'x')
        door(b,region,0,-.65,.18,.88,1.12)
        crest=summit_room(b,region,2.54,1.08,top+.24,1.42,False,'x' if region=='compact' else 'y')
        if region=='compact':ridge_crest(b,0,0,crest)
    for s in (-1,1):
        # Short connecting roof galleries explain the U-shaped circulation.
        with b.at((s*1.96,.86,0)):
            b.box((0,0,1.24),(.56,.93,2.12),'wall')
            summit_roof(b,region,.56,.93,2.30,.33,'x')
    thermal_pool(b,-.84,-.61,.23,1.43,1.16,region)
    b.box((.84,-.61,.43),(1.61,1.34,.50),'stone')
    thermal_pool(b,.84,-.61,.73,1.43,1.16,region)
    # A stepped centre bridge links the high bath terrace to the entrance.
    for j in range(5):
        yy=-1.36+j*.28;zz=.22+j*.105
        b.box((0,yy,zz/2+.08),(.32,.30,zz),'wood')
        for s in (-1,1):b.box((s*.22,yy,zz+.28),(.05,.05,.40),'wood')
        if j<4:
            for s in (-1,1):beam(b,(s*.22,yy,zz+.48),(s*.22,yy+.28,zz+.585),.047,.047,'lightwood')
    # Broad rock outcrop and a spill channel establish natural hot-spring water.
    for s in (-1,1):
        for j in range(3):b.sphere((s*1.79,-1.11+j*.43,.33+j*.06),(.20,.23,.24),'stone2' if j%2 else 'stone',7,3)
        pot(b,s*2.00,-1.14,flowers=region=='alpine')
        b.cylinder((s*1.91,.03,.43),.18,.58,'stone',8)
        b.box((s*1.91,.03,.81),(.29,.29,.23),'glass')
        b.cylinder((s*1.91,.03,.99),.25,.17,'roof',4,top=.07)
    b.box((.12,-.76,.54),(.08,.24,.35),'water')
    thermal_badge(b,0,.10,2.19)
    root=b.finish(bevel=.006)
    root['thermalPools']=[[-.84,-.61,.298,1.43,1.16],[.84,-.61,.798,1.43,1.16]]
    return root

def large(region,family,level,mats):
    b=Mesh(f'{region}_{family}_{level}',mats);w=6.85;d=2.25;floor=1.08
    floors=level if family=='skyscraper' else min(2,level)
    base(b,w,d);top=timber_shell(b,region,w,d,floors,floor,balconies=family!='finance',window_count=6,front_limit=1.70)
    gable_infill(b,w,d,top,.52,False,region=region)
    roof(b,region,w+.34,d+.40,top+.02,.55,'x',16,5)
    # Individually shaped projecting end bays read clearly on large parcels.
    for sign in (-1,1):
        xx=sign*2.48
        with b.at((xx,-.36,0)):
            # Its sides and back sit inside the main hall. Hidden windows,
            # shutters, flowers and balcony rails are deliberately not built.
            top2=timber_shell(b,region,1.52,2.05,floors,floor,balconies=family=='skyscraper',window_count=1,facades=(0,))
            front_gable(b,region,1.66,2.15,top2+.04,.52)
            if region=='compact':grid_window(b,0,-1.08,.45,.84,.62,8,2)
            else:shutter_window(b,0,-1.08,.46,.55,.61,True)
    y=-d/2-.10
    # Central entrance pavilion has a real portico, columns and front gable.
    for xx in (-.62,.62):b.box((xx,y-.30,.76),(.12,.12,1.20),'wood')
    door(b,region,0,y-.02,.18,.92,1.12)
    with b.at((0,y-.04,0)):front_gable(b,region,1.53,.91,1.43,.44)
    for xx in (-.83,.83):lantern(b,xx,y-.24,1.10,region)
    if region=='compact':noren(b,y-.36,1.31,1.05)
    else:
        for xx in (-2.70,2.70):chimney(b,xx,.36,top+.28)
    if family=='finance':
        if region=='alpine':
            extra=.60 if level==3 else 0
            if extra:
                b.box((0,.15,top+extra/2+.11),(.81,.65,extra),'wall')
                for xx in (-.405,.405):b.box((xx,-.185,top+extra/2+.11),(.07,.08,extra),'wood')
                grid_window(b,0,-.21,top+.16,.40,.36,3,2)
            clock_tower(b,region,0,.15,top+.11+extra,.81)
        else:
            with b.at((0,.05,top-.12)):
                raised=.66 if level==3 else 0
                timber_shell(b,region,1.65,1.20,1,.79+raised,window_count=2)
                if raised:
                    grid_window(b,0,-.66,.96,.77,.39,6,2)
                    emblem(b,0,-.74,.58,'coin',.18)
                front_gable(b,region,1.86,1.48,.98+raised,.44)
        for xx in (-1.47,1.47):
            b.box((xx,y-.11,.83),(.33,.03,.83),'indigo');emblem(b,xx,y-.15,.90,'coin',.105)
            crates(b,xx-.10,y-.25,.05)
    elif family=='skyscraper':
        if region=='compact':
            with b.at((0,.10,top+.20)):
                timber_shell(b,region,1.10,.94,1,.76,balconies=False,window_count=1)
                roof(b,region,1.44,1.25,.97,.34,'x',8,3)
        else:
            # Stepped plaster centre, a regional distinction from a Japanese pagoda.
            yy=-d/2-.03;points=[(-.78,top-.08),(-.78,top+.19),(-.58,top+.19),(-.58,top+.39),(-.38,top+.39),(-.38,top+.59),(-.18,top+.59),(-.18,top+.76),(.18,top+.76),(.18,top+.59),(.38,top+.59),(.38,top+.39),(.58,top+.39),(.58,top+.19),(.78,top+.19),(.78,top-.08)]
            b.xz_shape(points,(0,yy,0),.14,'wall')
            for a,c in zip(points[1:-1],points[2:]):beam(b,(a[0],yy-.08,a[1]),(c[0],yy-.08,c[1]),.055,.065,'roof')
            grid_window(b,0,yy-.10,top+.22,.24,.31,2,2)
    else:
        pool(b,1.04,y-.44,.17,1.25,.63)
        if level==3:
            # An elevated central bathing hall, rather than a renamed level 2.
            # It adds a new storey silhouette and a high central gable in all
            # three reference directions, while the wings remain two storeys.
            with b.at((0,.04,top-.02)):
                timber_shell(b,region,1.71,1.39,1,.94,window_count=2)
                if region=='compact':grid_window(b,0,-.76,.32,.95,.59,8,2)
                else:shutter_window(b,0,-.76,.33,.64,.58,True,True)
                front_gable(b,region,1.99,1.65,1.13,.49)
        for sign in (-1,1):
            with b.at((sign*.78,y-.54,0)):railing(b,.62,0,.18,region)
        for xx in (-2.94,2.94):pot(b,xx,y-.38,flowers=region=='alpine')
        if region=='compact':
            for xx in (-1.42,1.68):
                b.rod((xx,.84,.18),(xx+.08,.84,1.02),.052,'wood',8)
                for j in range(3):b.sphere((xx+(-1)**j*.18,.83,1.02+j*.23),(.38,.26,.18),'leaf' if j%2 else 'leaf2',8,4)
    return b.finish(bevel=.006)

def public(region,name,mats):
    b=Mesh(f'{region}_{name}',mats);w=2.56;d=1.86;top=1.72
    base(b,w,d);y=-d/2-.075;parts=[]
    if name=='teleport_gate':
        for sign in (-1,1):
            with b.at((sign*.94,0,0)):
                timber_shell(b,region,.66,1.66,1,1.62,window_count=1)
                if region=='compact':grid_window(b,0,-.88,.50,.35,.65,4,3)
                else:shutter_window(b,0,-.88,.53,.27,.50,max_span=.50)
        if region=='compact':
            b.box((0,0,1.81),(2.70,1.85,.17),'wood')
            roof(b,region,3.02,2.14,1.90,.53,'x',14,4)
            noren(b,-.94,1.78,1.02)
        else:
            with b.at((0,-.08,.18)):legacy.arch_opening(b,1.16,1.56,1.42,'stone',.18)
            roof(b,region,3.02,2.14,1.90,.53,'x',14,4)
            with b.at((0,-.11,0)):front_gable(b,region,1.65,1.89,1.84,.47)
            emblem(b,0,-1.10,2.04,'coin',.14)
        for xx in (-.63,.63):lantern(b,xx,-1.0,1.44,region)
    elif name=='legacy_open_platform':
        # Open timber platform, tracks and a small tram match the transit reference.
        for xx in (-1.12,1.12):
            for yy in (-.72,.72):b.box((xx,yy,.97),(.13,.13,1.64),'wood')
        roof(b,region,2.98,2.04,1.82,.48,'x',13,4)
        with b.at((0,-.83,0)):front_gable(b,region,1.20,.68,1.86,.35)
        emblem(b,0,-1.17,2.02,'clock',.19)
        for xx in (-.27,.27):b.box((xx,0,.20),(.035,2.12,.045),'dark')
        b.box((.06,.1,.62),(.83,1.12,.61),'roof');b.box((.06,.1,1.03),(.91,1.20,.10),'wood')
        for xx in (-.17,.28):grid_window(b,xx,-.49,.64,.29,.25,1,1)
        for xx in (-.23,.34):b.rod((xx,-.31,.29),(xx,.39,.29),.12,'dark',12)
        for xx in (-1.02,1.02):lantern(b,xx,-.77,1.48,region)
    elif name=='chance_wheel':
        with b.at((-.35,0,0)):
            timber_shell(b,region,1.55,1.63,2,.91,window_count=1)
            gable_infill(b,1.55,1.63,2.00,.55,True,region=region)
            roof(b,region,1.90,1.95,2.02,.55,'y',9,4)
            grid_window(b,0,-.86,.64,.91,.52,6,3);b.box((0,-1.02,.48),(1.23,.37,.12),'wood')
            if region=='compact':noren(b,-.93,1.40,1.16,'wood')
            for xx in (-.65,.65):lantern(b,xx,-.90,1.18,region)
        wheel=(1.05,-.85,.98)
        for xx in (.77,1.33):beam(b,(xx,-.85,.18),wheel,.08,.08)
        parts.append(('wheel',wheel))
    else:
        floors=2 if name=='builders_guild' or (name=='civic_hall' and region=='compact') else 1
        storey=.91 if floors==2 else 1.52
        top=timber_shell(b,region,w,d,floors,storey,balconies=name=='card_pavilion',window_count=2)
        front_roof=region=='alpine' or name in ('builders_guild','card_pavilion','rush_station','junction_hub')
        gable_infill(b,w,d,top,.54,front_roof,region=region)
        roof(b,region,w+.34,d+.40,top+.02,.54,'y' if front_roof else 'x',12,4)
        if region=='alpine':chimney(b,.80,.28,top+.20)
        if name!='builders_guild':door(b,region,0,y,.18,.71,1.02)
        for xx in (-.83,.83):
            if name!='builders_guild' and not(name=='junction_hub' and xx<0):
                if region=='compact':grid_window(b,xx,y,.45,.45,.59,5,2)
                else:shutter_window(b,xx,y,.46,.36,.56,True,max_span=.68)
            lamp_x=math.copysign(1.25,xx) if region=='alpine' and name=='card_pavilion' else xx
            lantern(b,lamp_x,y-.16,1.17,region)
        if name=='civic_hall':
            clock_tower(b,region,0,.06,top+.25,.74)
            for xx in (-1.08,1.08):
                b.box((xx,y-.16,1.62),(.26,.03,.61),'indigo');emblem(b,xx,y-.19,1.68,'coin',.075)
            with b.at((0,y-.03,0)):front_gable(b,region,1.10,.76,1.39,.32)
        elif name=='vault_bank':
            emblem(b,0,y-.18,1.53,'coin',.26)
            for xx in (-.48,.48):b.box((xx,y-.16,.72),(.16,.22,1.12),'stone2')
            b.box((0,y-.17,1.29),(1.20,.25,.12),'stone2')
        elif name=='builders_guild':
            b.box((0,y-.01,.78),(1.70,.10,1.20),'dark')
            for sign in (-1,1):
                b.box((sign*.87,y-.15,.78),(.40,.14,1.20),'wood')
                beam(b,(sign*.87-.16,y-.23,.23),(sign*.87+.16,y-.23,1.31),.045,.045,'lightwood')
            for z in (.26,.56):
                for k in range(4):b.box((-.50+k*.26,y-.18,z),(.24,.29,.15),'lightwood')
            crates(b,-.97,.95,.04);crates(b,.67,.96,.04)
            b.box((1.07,.12,1.45),(.13,.15,2.54),'wood')
            beam(b,(.89,.12,2.50),(1.73,-.19,2.68),.13,.13,'lightwood')
            beam(b,(1.07,.12,1.95),(1.58,-.14,2.62),.08,.08)
            parts.append(('pendulum',(1.70,-.19,2.65)))
            b.box((0,y-.17,1.43),(.69,.04,.36),'cream')
            for s in (-1,1):beam(b,(-.16*s,y-.20,1.31),(.16*s,y-.20,1.55),.055,.035,'dark')
        elif name=='card_pavilion':
            if region=='compact':noren(b,y-.18,1.37,1.45)
            else:awning(b,0,y,1.35,2.10)
            for k in range(3):
                x=(k-1)*.29;z=top+.08;angle=-(k-1)*.20;co,si=math.cos(angle),math.sin(angle)
                def plane(points):return [(u*co-v*si,u*si+v*co) for u,v in points]
                b.xz_shape(plane([(-.20,-.28),(.20,-.28),(.20,.28),(-.20,.28)]),(x,y-.18,z),.055,'wood')
                b.xz_shape(plane([(-.178,-.256),(.178,-.256),(.178,.256),(-.178,.256)]),(x,y-.213,z),.018,'cream')
                if k==0:
                    heart=[(0,-.12),(-.12,.02),(-.12,.08),(-.075,.125),(-.03,.12),(0,.075),(.03,.12),(.075,.125),(.12,.08),(.12,.02)]
                    b.xz_shape(plane(heart),(x,y-.229,z),.012,'roof')
                elif k==1:b.xz_shape([(0,-.14),(.10,0),(0,.14),(-.10,0)],(x,y-.229,z),.012,'roof')
                else:
                    for u,v in ((0,.075),(-.070,-.005),(.070,-.005)):
                        xx,zz=plane([(u,v)])[0];b.rod((x+xx,y-.229,z+zz),(x+xx,y-.244,z+zz),.070,'dark',12)
                    b.xz_shape(plane([(-.035,-.13),(.035,-.13),(.015,.015),(-.015,.015)]),(x,y-.231,z),.012,'dark')
        elif name=='rush_station':emblem(b,0,y-.14,top+.22,'clock',.24)
        elif name=='junction_hub':
            emblem(b,0,y-.14,top+.25,'info',.22)
            b.box((-.60,y-.16,.84),(.52,.08,.65),'wood')
            b.box((-.60,y-.21,.84),(.43,.025,.54),'cream')
            beam(b,(-.76,y-.23,.68),(-.46,y-.23,1.00),.045,.018,'indigo')
            b.box((1.48,-.20,1.17),(.10,.10,2.19),'wood')
            for i in range(3):
                pts=[(-.25,-.09),(.24,-.09),(.37,0),(.24,.09),(-.25,.09)]
                b.xz_shape(pts,(1.57,-.27,1.94-i*.31),.055,'lightwood')
        for xx in (-1.07,1.07):pot(b,xx,y-.20,flowers=region=='alpine')
    root=b.finish(bevel=.006)
    for kind,pos in parts:
        part_root=bpy.data.objects.new(f'{region}_life_'+('wheel_rotor' if kind=='wheel' else 'crane_pendulum'),None)
        bpy.context.collection.objects.link(part_root);part_root.parent=root;part_root.location=pos;part_root['lifePart']=kind
        p=Mesh(region+'_'+kind,mats)
        if kind=='wheel':
            p.rod((0,.035,0),(0,-.035,0),.54,'wood',32)
            for k in range(12):
                a=k*TAU/12;c=(k+1)*TAU/12
                p.poly([(0,-.042,0),(.47*math.sin(a),-.042,.47*math.cos(a)),(.47*math.sin(c),-.042,.47*math.cos(c))],[(0,2,1)],'indigo' if k%2 else 'cream')
                p.rod((0,-.052,0),(.48*math.sin(a),-.052,.48*math.cos(a)),.016,'bronze',6)
                p.rod((.49*math.sin(a),-.045,.49*math.cos(a)),(.49*math.sin(c),-.045,.49*math.cos(c)),.022,'bronze',8)
            p.rod((0,-.055,0),(0,-.10,0),.09,'bronze',16)
        else:
            p.rod((0,0,0),(0,0,-.63),.015,'dark',8)
            p.box((0,0,-.77),(.35,.30,.26),'lightwood')
            for xx in (-.12,.12):p.box((xx,-.17,-.77),(.028,.035,.28),'wood')
        p.finish(part_root,bevel=.005)
    return root

def windmill(mats):
    b=Mesh('alpine_windmill',mats)
    base(b,4.20,2.26)
    # A circular masonry tower with an attached chalet and a bathing basin.
    b.cylinder((-1.05,0,1.90),.84,3.55,'wall',32,top=.62)
    for row in range(6):
        for i in range(20):
            a=(i+row*.5)*TAU/20
            with b.at((-1.05,0,0),a):b.box((.79,0,.24+row*.18),(.13,.23,.16),'stone2' if (i+row)%4==0 else 'stone')
    door(b,'alpine',-1.05,-.86,.18,.58,1.12)
    for z in (1.72,2.55):
        for a in (0,math.pi/2,math.pi,math.pi*1.5):
            with b.at((-1.05,0,0),a):shutter_window(b,0,-.72,z,.26,.43)
    # Ordered conical shingle courses, narrow seams and raised cap rings.
    for row in range(7):
        z=3.67+row*.16;r=.91-row*.112;rn=max(.07,r-.13)
        for i in range(20):
            a=i*TAU/20+.004;c=(i+1)*TAU/20-.004
            vv=[(-1.05+r*math.cos(a),r*math.sin(a),z),(-1.05+r*math.cos(c),r*math.sin(c),z),(-1.05+rn*math.cos(c),rn*math.sin(c),z+.19),(-1.05+rn*math.cos(a),rn*math.sin(a),z+.19)]
            b.poly(vv,[(0,1,2,3)],'indigo')
            b.rod(vv[0],vv[1],.016,'indigo',6)
    b.cylinder((-1.05,0,4.85),.11,.24,'bronze',12,top=.025)
    with b.at((.99,.12,0)):
        top=timber_shell(b,'alpine',2.03,1.93,2,1.15,balconies=True,window_count=1)
        gable_infill(b,2.03,1.93,top,.66,True,region='alpine')
        roof(b,'alpine',2.42,2.28,top+.02,.66,'y',11,5)
        shutter_window(b,0,-1.04,.54,.59,.70)
        chimney(b,.61,.20,top+.34)
    for xx in (.09,1.98):b.box((xx,-1.15,.83),(.13,.13,1.43),'wood')
    tiles(b,-.07,2.15,-.68,-1.47,1.82,1.46,10,3,True,collars=False)
    b.box((1.04,-1.44,1.43),(2.24,.10,.09),'wood')
    pool(b,1.03,-1.27,.22,1.53,.79)
    for xx in (-1.73,-.41,2.08):pot(b,xx,-1.01,flowers=True)
    root=b.finish(bevel=.006)
    rotor=bpy.data.objects.new('alpine_windmill_sails',None);bpy.context.collection.objects.link(rotor);rotor.parent=root;rotor.location=(-1.05,-.98,3.56);rotor['lifePart']='windmill'
    p=Mesh('alpine_windmill_sails',mats)
    p.rod((0,.10,0),(0,-.16,0),.16,'bronze',16)
    for k in range(4):
        a=math.pi/4+k*math.pi/2;u=Vector((math.cos(a),0,math.sin(a)));v=Vector((-math.sin(a),0,math.cos(a)))
        for s in (-1,1):beam(p,tuple(u*.23+v*s*.20),tuple(u*1.91+v*s*.20),.06,.065,'wood')
        for j in range(5):
            center=u*(.45+j*.345);beam(p,tuple(center-v*.20),tuple(center+v*.20),.042,.045,'lightwood')
        for j in range(4):
            a0=.43+j*.345;a1=a0+.335
            vv=[tuple(u*a0-v*.175+Vector((0,-.025,0))),tuple(u*a1-v*.175+Vector((0,-.025,0))),tuple(u*a1+v*.175+Vector((0,-.025,0))),tuple(u*a0+v*.175+Vector((0,-.025,0)))]
            p.poly(vv,[(0,1,2,3)],'cream')
    p.finish(rotor,bevel=.005)
    rotor.rotation_euler[1]=0;rotor.keyframe_insert('rotation_euler',index=1,frame=1)
    rotor.rotation_euler[1]=TAU;rotor.keyframe_insert('rotation_euler',index=1,frame=241)
    if rotor.animation_data and rotor.animation_data.action:
        rotor.animation_data.action.name='Alpine windmill · continuous timber sails'
    rotor.rotation_euler[1]=0;bpy.context.scene.frame_set(1)
    return root

def _kyoto_micro_overlay_faces(mesh):
    """Recognize only the approved sample's thin ceramic lip/cuff strips.

    Their original builder emits isolated smooth strips of four/six quads
    (10/14 vertices) in the edge material. Physical tile pans, tile ends,
    ridge caps, and beveled architectural members have different topology.
    """
    slots={i for i,m in enumerate(mesh.materials) if m and m.name.split('/')[-1].strip().split('.')[0]=='edge'}
    candidates={p.index:p for p in mesh.polygons if p.material_index in slots and p.use_smooth and len(p.vertices)==4}
    by_vertex={}
    for index,p in candidates.items():
        for v in p.vertices:by_vertex.setdefault(v,set()).add(index)
    pending=set(candidates);remove=set()
    while pending:
        start=pending.pop();component={start};todo=[start]
        while todo:
            for v in candidates[todo.pop()].vertices:
                adjacent=by_vertex[v]&pending
                pending.difference_update(adjacent);component.update(adjacent);todo.extend(adjacent)
        vertices={v for index in component for v in candidates[index].vertices}
        if (len(component),len(vertices)) in ((4,10),(6,14)):
            remove.update(component)
    return remove

def _clean_accepted_roof_overlays(root):
    """Clean the loaded copy only; the approved archived .blend stays intact."""
    import bmesh
    removed=0
    for obj in (root,*root.children_recursive):
        if obj.type!='MESH':continue
        mesh=obj.data;faces=_kyoto_micro_overlay_faces(mesh)
        if not faces:continue
        # BMesh carries the original custom-normal corner layer with retained
        # faces. Do not regenerate or re-encode it: that would unnecessarily
        # quantize the architectural normals in the approved sample again.
        bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.faces[index] for index in faces],context='FACES')
        bm.to_mesh(mesh);bm.free();mesh.update()
        removed+=len(faces)
    root['roofMicroOverlayFacesRemoved']=removed
    return removed

def accepted_villa():
    path=ROOT/'art/blender-quality-study/kyoto-villa2/kyoto-villa2.blend'
    with bpy.data.libraries.load(str(path),link=False) as (source,dest):
        dest.objects=[n for n in source.objects if n.startswith('Kyoto_Machiya_Villa_2')]
    for obj in dest.objects:
        if obj:bpy.context.collection.objects.link(obj)
    root=next(obj for obj in dest.objects if obj and obj.parent is None)
    _clean_accepted_roof_overlays(root)
    root['sampleGeometryPreserved']=False
    root['sampleStructurePreserved']=True
    root['sampleCleanup']='Roof micro-overlay strips only; preserved ceramic shells and architectural corner normals'
    root['sampleSource']='art/blender-quality-study/kyoto-villa2/kyoto-villa2.blend'
    return root

def build(region,asset):
    if region not in ('compact','alpine'):raise ValueError(region)
    if asset.startswith(region+'_'):asset=asset[len(region)+1:]
    if region=='compact' and asset=='villa_2':root=accepted_villa()
    else:
        mats=materials(region)
        if asset in ('windmill','alpine_windmill'):root=windmill(mats)
        elif asset.rsplit('_',1)[-1].isdigit():
            family,level=asset.rsplit('_',1);level=int(level)
            if family=='onsen':root=thermal_resort(region,level,mats)
            elif level==3:root=level3_core(region,family,mats) if family in ('villa','shop','hotel','tower') else level3_large(region,family,mats)
            else:root=core(region,family,level,mats) if family in ('villa','shop','hotel','tower') else large(region,family,level,mats)
        else:root=public(region,asset,mats)
    root.name=f'{region}_{asset}'
    root['region']=region;root['sourceType']='blender_authored';root['front']='Blender -Y / glTF +Z';root['origin']='ground centre'
    root['referencePolicy']='Existing front / right / back reference views, no new AI generation'
    root['qualityStandard']='Kyoto approved solid architecture: clean tile courses, deep windows, real bevels'
    root['assetRole']='runtime authored regional architecture'
    return root
