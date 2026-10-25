"""New York Art Deco, reconstructed from the existing individual three views.

Red brick, limestone piers, patinated copper, gold fan crests and warm glazing.
All four elevations are built; colour is assigned to real architectural parts.
"""
import importlib.util, math
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('city_primitives',ROOT/'art/build_regional_city.py')
kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
class Mesh(kit.Mesh):
    """Do not bevel a sub-pixel window bar into ten times as many triangles."""
    def box(self,p,size,material,rotate=0):
        self._fine=min(size)<getattr(self,'bevel_min',.05)
        super().box(p,size,material,rotate)
        self._fine=False
    def poly(self,vertices,faces,material,smooth=False,bevel=False):
        super().poly(vertices,faces,material,smooth,bevel and not getattr(self,'_fine',False))

PALETTE={'wall':'AC624A','brick_light':'B87355','mortar':'91513E','stone':'D5BE9C',
 'trim':'E9D4AF','roof':'427D70','roof_edge':'649589','wood':'294B46','wood_light':'C89B48',
 'accent':'326B60','recess':'283F3C','glass':'F1BE6D','metal':'394D48','leaf':'4D7851',
 'leaf_light':'6F955E','flower':'D59E64','water':'5EA5AD','soil':'524431'}

def materials():
    result={}
    for key,hexcode in PALETTE.items():
        rgb=[kit.linear(int(hexcode[i:i+2],16)/255) for i in (0,2,4)]
        m=bpy.data.materials.new('expansion/'+key);m.use_nodes=True;m.diffuse_color=(*rgb,1)
        p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*rgb,1)
        p.inputs['Roughness'].default_value=.72 if key in ('wall','brick_light','stone') else .48
        p.inputs['Metallic'].default_value=.35 if key in ('wood_light','roof','roof_edge','metal') else 0
        result[key]=m
    return result

def slab(b,w,d,z,h=.12):
    b.box((0,0,z),(w,d,h),'stone');b.box((0,0,z+h*.55),(w+.06,d+.06,.05),'trim')

def base(b,w,d):
    slab(b,w+.20,d+.22,.09,.18)
    for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(-math.pi/2,d,w)):
        with b.facing(angle):
            n=max(3,round(span/.34))
            for i in range(n):b.box((-span/2+(i+.5)*span/n,-depth/2-.035,.25),(span/n-.018,.09,.22),'stone' if i%3 else 'trim')

def brickwork(b,span,y,z,h):
    # Shallow, selective relief: mortar courses remain visible at phone scale.
    for row in range(max(1,round(h/.17))):
        zz=z+(row+.5)*h/max(1,round(h/.17))
        b.box((0,y-.005,zz),(span,.012,.012),'mortar')
        n=max(3,round(span/.40))
        for col in range(n):
            x=-span/2+(col+.35+.5*(row%2))*span/n
            if x<span/2-.06:b.box((x,y-.014,zz+.06),(.011,.015,.12),'mortar')

def window(b,x,y,z,w=.50,h=.83,arch=False,fan=False):
    # Deep reveal, distinct glass panel, double frame, stone head and sill.
    if arch:
        b.arch(x,y-.025,z,w+.15,h+.12,'stone',.10)
        b.arch(x,y-.085,z+.04,w+.045,h+.045,'wood',.045)
        b.arch(x,y-.115,z+.08,w-.06,h-.07,'glass',.022)
        if h>1.5:
            # Tall winter-garden glazing is a bank of narrow panes, not one
            # enlarged domestic window. Keep bars in front of the glass plane.
            columns=max(3,round(w/.22));spring=h-min(w/2,h*.42)
            for i in range(1,columns):
                dx=-w/2+i*w/columns
                top=spring+min(w/2,h*.42)*math.sqrt(max(0,1-(dx/(w/2))**2))-.055
                b.box((x+dx,y-.162,z+.07+(top-.07)/2),(.036,.055,top-.07),'wood')
            rows=max(3,round(spring/.43))
            for i in range(1,rows+1):b.box((x,y-.166,z+.08+i*(spring-.08)/rows),(w-.055,.056,.033),'wood')
            for i in range(-2,3):
                dx=i*w*.14
                b.rod((x,y-.17,z+spring),(x+dx,y-.17,z+spring+min(w/2,h*.42)*math.sqrt(max(0,1-(dx/(w/2))**2))-.04),.017,'wood',6)
        else:
            for dx in (-w*.27,w*.27):b.box((x+dx,y-.15,z+h*.46),(.04,.06,h*.74),'wood')
    else:
        b.box((x,y-.018,z+h/2),(w+.11,.08,h+.13),'recess')
        b.box((x,y-.072,z+h/2),(w-.055,.024,h-.045),'glass')
        for side in (-1,1):b.box((x+side*w/2,y-.095,z+h/2),(.05,.07,h+.06),'wood')
        for zz in (z,z+h):b.box((x,y-.099,zz),(w+.05,.074,.047),'wood')
        b.xz_shape([(-w/2-.10,0),(w/2+.10,0),(w/2+.13,.13),(-w/2-.13,.13)],(x,y-.035,z+h+.045),.14,'trim')
        b.xz_shape([(-.05,-.02),(.05,-.02),(.065,.16),(-.065,.16)],(x,y-.115,z+h+.04),.075,'stone')
    b.box((x,y-.114,z+h*.45),(w-.04,.045,.035),'wood')
    b.box((x,y-.115,z+h*.50),(.028,.045,h-.08),'wood')
    b.box((x,y-.073,z-.065),(w+.20,.18,.09),'trim')
    if fan:crest(b,x,y-.11,z+h+.18,w*.7,.19)

def crest(b,x,y,z,w,h,material='wood_light'):
    for i in range(-2,3):
        xx=x+i*w*.18;hh=h*(1-abs(i)*.17)
        b.xz_shape([(-w*.055,0),(w*.055,0),(w*.045,hh*.8),(0,hh),(-w*.045,hh*.8)],(xx,y,z),.035,material)
        if i:b.rod((x,y-.025,z),(xx,y-.025,z+hh*.75),.012,material,6)

def pier(b,x,y,z,h,r=.12):
    b.cylinder((x,y,z+h/2),r,h,'stone',12)
    for zz in (z+.10,z+h-.08):b.cylinder((x,y,zz),r*1.14,.12,'trim',12)
    for k in range(1,max(2,round(h/.42))):
        zz=z+k*h/max(2,round(h/.42));b.cylinder((x,y,zz),r*1.012,.014,'trim',12)

def crown(b,w,d,z,height=.52,central=True):
    b.box((0,0,z),(w+.10,d+.08,.13),'trim')
    # Four sided low parapet with metal seams and a shallow inset roof tray.
    b.box((0,0,z+.10),(w-.14,d-.12,.045),'recess')
    for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(-math.pi/2,d,w)):
        with b.facing(angle):
            b.box((0,-depth/2,z+.16),(span,.14,.24),'roof')
            b.box((0,-depth/2-.016,z+.28),(span+.03,.17,.045),'roof_edge')
            for i in range(max(3,round(span/.35))):
                xx=-span/2+(i+.5)*span/max(3,round(span/.35))
                b.box((xx,-depth/2-.078,z+.16),(.018,.015,.20),'roof_edge')
    if central:
        # One stepped outline: overlapping coplanar boxes would flicker here.
        pts=[(-w*.30,0),(w*.30,0),(w*.30,height*.20),(w*.23,height*.20),
             (w*.23,height*.42),(w*.16,height*.42),(w*.16,height*.68),
             (w*.09,height*.68),(w*.09,height),(-w*.09,height),
             (-w*.09,height*.68),(-w*.16,height*.68),(-w*.16,height*.42),
             (-w*.23,height*.42),(-w*.23,height*.20),(-w*.30,height*.20)]
        b.xz_shape(pts,(0,-d/2-.045,z+.14),.23,'roof',True)
        for i in range(-2,3):
            hh=height*(.88-abs(i)*.19)
            b.box((i*w*.066,-d/2-.182,z+.20+hh/2),(.06,.045,hh),'wood_light')
        b.box((0,-d/2-.165,z+.22),(.075,.045,height*1.01),'wood_light')
    for x in (-w/2,w/2):
        for y in (-d/2,d/2):b.cylinder((x,y,z+.17),.125,.23,'roof',12,top=.095)

def door(b,x,y,z=.29,w=.60,h=1.10,double=False):
    b.box((x,y-.03,z+h/2),(w+.19,.12,h+.13),'stone')
    b.box((x,y-.10,z+h/2),(w+.04,.06,h+.025),'recess')
    n=2 if double else 1
    for i in range(n):
        xx=x+(i-(n-1)/2)*w/n;ww=w/n-.035
        b.box((xx,y-.142,z+h/2),(ww,.045,h),'wood')
        b.box((xx,y-.172,z+h*.71),(ww-.10,.016,h*.43),'glass')
        b.box((xx,y-.18,z+h*.21),(ww-.11,.018,h*.22),'accent')
        b.rod((xx+ww*.30,y-.21,z+h*.37),(xx+ww*.30,y-.21,z+h*.53),.019,'wood_light',8)
    for i in range(3):b.box((x,y-.12-i*.09,z-.07-i*.055),(w+.30+i*.13,.30,.10),'stone')

def lantern(b,x,y,z):
    b.box((x,y-.035,z),(.075,.07,.24),'metal');b.rod((x,y,z+.12),(x,y-.20,z+.12),.018,'metal')
    b.box((x,y-.20,z),(.095,.095,.22),'glass')
    for zz in (z-.125,z+.125):b.box((x,y-.20,zz),(.145,.14,.045),'wood_light')
    for xx in (-.05,.05):b.box((x+xx,y-.253,z),(.013,.014,.23),'wood_light')

def planter(b,x,y,z=.20,r=.11):
    b.cylinder((x,y,z+r*.65),r*.80,r*1.25,'stone',10,top=r)
    b.cylinder((x,y,z+r*1.3),r*1.1,.04,'trim',10)
    b.cylinder((x,y,z+r*1.45),r*.85,.035,'soil',10)
    b.rod((x,y,z+r),(x,y,z+r*3.8),.022,'wood',6)
    # Tiered individual leaves avoid a noisy triangulated green blob.
    for layer in range(4):
        rr=r*(1.15-layer*.20);zz=z+r*(1.75+layer*.52)
        for i in range(6):
            a=(i+layer*.5)*math.tau/6;cx=x+math.cos(a)*rr*.55;cy=y+math.sin(a)*rr*.55
            b.sphere((cx,cy,zz),(rr*.56,rr*.56,r*.32),'leaf' if i%3 else 'leaf_light',6,3)

def canopy(b,y,z,w,depth=.38,bulbs=True):
    # Three real rounded bands, plus a copper top with fine radial seams.
    for zz,hh,mat in ((z,.15,'accent'),(z-.085,.035,'wood_light'),(z+.085,.035,'wood_light')):
        b.box((0,y-depth*.40,zz),(w-.28,depth,hh),mat)
        for x in (-(w-.28)/2,(w-.28)/2):b.cylinder((x,y-depth*.40,zz),depth/2,hh,mat,16)
    if bulbs:
        for i in range(9):b.sphere((-w*.44+i*w*.11,y-depth*.91,z-.105),(.035,.03,.022),'glass',8,4)
    for x in (-w*.34,w*.34):b.box((x,y-depth*.92,z),(.045,.022,.16),'wood_light')

def stripe_awning(b,y,z,w):
    n=12
    for i in range(n):
        xx=-w/2+(i+.5)*w/n;mat='trim' if i%2 else 'accent'
        b.poly([(xx-w/n/2,y,z),(xx+w/n/2,y,z),(xx+w/n/2,y-.42,z-.27),(xx-w/n/2,y-.42,z-.27)],[(3,2,1,0)],mat)
        b.box((xx,y-.425,z-.30),(w/n-.004,.035,.08),mat)
    for x in (-w*.43,w*.43):b.rod((x,y,z-.36),(x,y-.40,z-.28),.023,'metal')

def escape(b,w,d,floors,storey):
    # Rear fire escape follows the rear view; front remains uncluttered.
    for f in range(1,floors):
        zz=.30+f*storey
        b.box((0,d/2+.19,zz),(w*.65,.36,.055),'metal')
        for i in range(9):b.rod((-w*.30+i*w*.075,d/2+.35,zz),(-w*.30+i*w*.075,d/2+.35,zz+.36),.013,'metal',6)
        b.rod((-w*.33,d/2+.35,zz+.37),(w*.33,d/2+.35,zz+.37),.023,'metal')
        sign=1 if f%2 else -1
        for dx in (-.08,.08):b.rod((sign*.45+dx,d/2+.20,zz),(sign*-.45+dx,d/2+.20,zz-storey+.07),.018,'metal')
        for i in range(9):
            xx=sign*(.45-i*.9/8);b.rod((xx-.10,d/2+.20,zz-i*(storey-.07)/8),(xx+.10,d/2+.20,zz-i*(storey-.07)/8),.015,'metal',6)

def shell(b,w,d,floors,storey=1.45,ground=.30,front=True,faces=None):
    top=ground+floors*storey;b.box((0,0,(ground+top)/2),(w,d,top-ground),'wall')
    for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(-math.pi/2,d,w)):
        if faces is not None and angle not in faces:continue
        with b.facing(angle):
            brickwork(b,span,-depth/2,ground,top-ground)
            for f in range(floors):
                zz=ground+f*storey
                b.box((0,-depth/2-.025,zz),(span+.06,.09,.085),'stone')
                if angle!=0 or front:
                    count=3 if span>2.9 else 2
                    for i in range(count):
                        xx=(i-(count-1)/2)*span/(count+.25)
                        window(b,xx,-depth/2,zz+.25,min(.58,span/(count+1)*.70),storey-.47)
            for side in (-1,1):pier(b,side*(span/2-.08),-depth/2-.04,ground,top-ground,.115)
    return top

def core(family,level,mats):
    if level==3:return landmark_core(family,mats)
    b=Mesh(f'expansion_{family}_{level}',mats)
    w=3.05 if family!='tower' else 2.50;d=2.45;storey=1.42
    base(b,w,d);top=shell(b,w,d,level,storey,front=False)
    y=-d/2
    for f in range(level):
        zz=.30+f*storey
        for x in (-w*.30,w*.30):window(b,x,y,zz+.25,.50,storey-.47)
        if f:window(b,0,y,zz+.25,.49,storey-.47)
    door(b,0,y,w=.55,h=1.08,double=family=='hotel')
    if family=='shop':
        for x in (-w*.30,w*.30):
            b.box((x,y-.10,.94),(.76,.19,1.16),'accent')
            b.box((x,y-.21,1.04),(.64,.035,.85),'glass')
            b.box((x,y-.24,.47),(.66,.036,.20),'wood')
            for xx in (x-.34,x+.34):b.box((xx,y-.25,.99),(.045,.06,1.10),'wood_light')
        canopy(b,y,1.67,w+.08,.19,False);stripe_awning(b,y-.03,1.57,w+.22)
        crown(b,w,d,top,.52)
    elif family=='hotel':
        canopy(b,y,1.56,w+.08,.46)
        crown(b,w,d,top,.68)
        for x in (-.57,.57):lantern(b,x,y,1.0)
    elif family=='tower':
        for x in (-.38,.38):
            b.box((x,y-.10,(top+.30)/2),(.15,.16,top-.30),'stone')
            b.box((x,y-.195,(top+.30)/2),(.035,.03,top-.18),'wood_light')
        canopy(b,y,1.57,1.08,.28)
        crown(b,w,d,top,.94)
        b.box((0,y-.13,top+.50),(.065,.035,.90),'wood_light')
    else:
        crown(b,w,d,top,.52)
        b.box((-.85,.70,top+.37),(.37,.40,.55),'wall')
        b.box((-.85,.70,top+.66),(.46,.49,.10),'roof')
        b.cylinder((-.85,.70,top+.82),.12,.25,'metal',12)
    for x in (-.52,.52):planter(b,x,y-.24,r=.105)
    escape(b,w,d,level,storey)
    return b.finish(bevel=.015)

def terrace_rail(b,w,d,z):
    """Readable roof garden balustrade, with open gaps instead of a solid box."""
    for angle,span,depth in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(-math.pi/2,d,w)):
        with b.facing(angle):
            b.box((0,-depth/2,z+.23),(span+.04,.10,.09),'roof_edge')
            for i in range(7):b.box((-span/2+i*span/6,-depth/2,z+.11),(.065,.075,.24),'roof')

def pinnacle(b,w,d,z,h=.90):
    """Setback copper lantern with a broad gold fan visible from the board."""
    for j in range(3):
        ww=w*(1-j*.21);dd=d*(1-j*.20)
        b.box((0,0,z+.13+j*.20),(ww,dd,.25),'roof')
        b.box((0,0,z+.27+j*.20),(ww+.035,dd+.035,.045),'roof_edge')
    for x in (-.23,0,.23):
        hh=h*(1-abs(x)*1.15)
        b.box((x,-d*.24,z+.50+hh/2),(.085,.075,hh),'wood_light')
    b.xz_shape([(-w*.16,0),(w*.16,0),(w*.10,h*.36),(0,h*.50),(-w*.10,h*.36)],(0,-d*.23,z+.67),.11,'wood_light')

def landmark_core(family,mats):
    """L3 is a new rooftop silhouette, not another repeated storey."""
    b=Mesh(f'expansion_{family}_3',mats);b.bevel_min=.07
    w=3.05;d=2.45;y=-d/2
    base(b,w,d)
    floors=3 if family=='tower' else 2;storey=1.22 if family=='tower' else 1.88
    top=shell(b,w,d,floors,storey,front=False)
    for f in range(floors):
        # The ground-floor shopfront below owns these bays. A full-height
        # domestic window here would leave its head poking above the awning.
        if family=='shop' and f==0:continue
        for x in (-w*.31,0,w*.31):
            if f or x:window(b,x,y,.55+f*storey,.52,storey-.43,fan=f==floors-1)
    door(b,0,y,w=.63,h=1.08,double=family!='villa')
    crown(b,w,d,top,.35,False)
    if family=='villa':
        # A recessed penthouse and a real open roof garden replace the flat box.
        with b.at((0,.19,0)):
            pent=shell(b,1.96,1.65,1,.91,top+.18)
            copper_roof(b,2.17,1.88,pent+.04,.54)
            crest(b,0,-.98,pent+.10,.83,.48)
        terrace_rail(b,w-.08,d-.08,top+.30)
        for x in (-1.22,1.22):planter(b,x,-.88,top+.15,.16)
        canopy(b,y,1.50,1.32,.30,False)
    elif family=='shop':
        # Monumental market clerestory, framed by two golden corner pylons.
        with b.at((0,.11,0)):
            b.box((0,0,top+.72),(1.76,1.89,1.20),'stone')
            window(b,0,-.945,top+.18,1.40,1.09,True)
            barrel(b,1.87,2.00,top+1.32,.43,True)
        for x in (-1.20,1.20):
            with b.at((x,0,0)):
                b.box((0,0,top+.34),(.54,1.91,.44),'wall')
                copper_roof(b,.69,2.02,top+.57,.37)
        for x in (-.93,.93):
            b.box((x,y-.10,.98),(.83,.16,1.22),'accent')
            b.box((x,y-.21,1.03),(.71,.035,1.04),'glass')
            for dx in (-.36,.36):b.box((x+dx,y-.24,1.03),(.045,.06,1.10),'wood_light')
        canopy(b,y,1.74,w+.09,.31);stripe_awning(b,y-.03,1.60,w+.18)
        crest(b,0,y-.12,top+.18,1.38,.73)
    elif family=='hotel':
        # The upper floor splits into an observation salon and two roof terraces.
        with b.at((0,.06,0)):
            pent=shell(b,1.48,1.91,1,1.17,top+.15)
            copper_roof(b,1.70,2.10,pent+.04,.64)
            crest(b,0,-1.10,pent+.02,.92,.51)
        for x in (-1.22,1.22):
            with b.at((x,0,0)):
                b.box((0,0,top+.42),(.55,1.93,.49),'wall')
                window(b,0,-.965,top+.22,.30,.36)
                copper_roof(b,.73,2.13,top+.69,.43)
        canopy(b,y,1.64,w+.07,.49)
        for x in (-.69,.69):lantern(b,x,y,1.0)
        for x in (-1.32,1.32):
            b.box((x,y-.09,1.55),(.16,.15,2.50),'stone')
            b.box((x,y-.18,1.55),(.043,.04,2.55),'wood_light')
    else:
        # Stone shoulders carry a three-stage copper crown with a gold fan spire.
        for x in (-.47,.47):
            b.box((x,y-.10,(top+.30)/2),(.19,.18,top-.20),'stone')
            b.box((x,y-.205,(top+.30)/2),(.055,.04,top-.10),'wood_light')
        with b.at((0,.05,0)):
            b.box((0,0,top+.43),(1.80,1.70,.62),'wall')
            for x in (-.48,.48):window(b,x,-.85,top+.25,.43,.45)
            pinnacle(b,2.00,1.89,top+.75,.89)
        canopy(b,y,1.62,1.51,.35)
    for x in (-.56,.56):planter(b,x,y-.22,r=.11)
    escape(b,w,d,floors,storey)
    return b.finish(bevel=.014)

def barrel(b,w,d,z,h,glass=False):
    # Ribbed barrel vault running across the facade, not a spherical approximation.
    n=16;verts=[]
    for x in (-w/2,w/2):
        for i in range(n+1):
            a=i*math.pi/n;verts.append((x,-math.cos(a)*d/2,z+math.sin(a)*h))
    b.poly(verts,[(i,i+1,i+n+2,i+n+1) for i in range(n)],'water' if glass else 'roof',True)
    for k in range(7):
        xx=-w/2+k*w/6
        for i in range(n):
            a=i*math.pi/n;c=(i+1)*math.pi/n
            b.rod((xx,-math.cos(a)*d/2,z+math.sin(a)*h+.012),(xx,-math.cos(c)*d/2,z+math.sin(c)*h+.012),.023,'wood_light' if glass else 'roof_edge',6)
    for i in range(1,4):
        a=i*math.pi/4;b.rod((-w/2,-math.cos(a)*d/2,z+math.sin(a)*h+.02),(w/2,-math.cos(a)*d/2,z+math.sin(a)*h+.02),.020,'roof_edge',6)

def tower_mass(b,x,y,w,d,floors,ground=.30,step=True,faces=None):
    with b.at((x,y,0)):
        top=shell(b,w,d,floors,1.15,ground,faces=faces)
        crown(b,w,d,top,.30,False)
        if step:
            for j in range(3):
                ww=w*(.74-j*.19);dd=d*(.78-j*.19)
                b.box((0,0,top+.30+j*.20),(ww,dd,.23),'roof')
                b.box((0,0,top+.425+j*.20),(ww+.035,dd+.035,.025),'roof_edge')
        return top

def large(family,level,mats):
    if family=='onsen':return thermal_resort(level,mats)
    b=Mesh(f'expansion_{family}_{level}',mats);w=6.9;d=2.45;y=-d/2
    b.bevel_min=.11
    base(b,w,d)
    if family=='skyscraper':
        # Five adjoining masses follow the stepped silhouette of the three-view.
        heights={1:(2,2,2),2:(2,5,3),3:(3,4,6)}[level]
        for x,width,floors,dd in ((-2.63,1.22,heights[0],2.25),(2.63,1.22,heights[0],2.25),(-1.43,1.10,heights[1],2.40),(1.43,1.10,heights[1],2.40),(0,1.85 if level==3 else 1.65,heights[2],2.55)):
            faces=(0,math.pi,math.pi/2) if x>2 else (0,math.pi,-math.pi/2) if x< -2 else (0,math.pi)
            top=tower_mass(b,x,0,width,dd,floors,step=not(level==3 and x==0),faces=faces)
            with b.at((x,0,0)):
                # The one upper storey above the adjoining wing is visible.
                if abs(x)<2 and floors>min(heights):
                    for angle in (math.pi/2,-math.pi/2):
                        with b.facing(angle):
                            for f in range(min(heights),floors):
                                for xx in (-dd*.23,dd*.23):window(b,xx,-width/2,.55+f*1.15,.45,.68)
                            b.box((0,-width/2-.03,top-.03),(dd+.06,.08,.08),'stone')
                for xx in (-width*.30,width*.30):
                    b.box((xx,-dd/2-.115,(top+.30)/2),(.075,.08,top-.20),'wood_light')
                if level!=3 or x!=0:crest(b,0,-dd/2-.17,top+.35,width*.6,.55)
        for x in (-.57,.57):b.box((x,y-.20,1.55),(.13,.18,2.5),'stone')
        door(b,0,y-.10,w=.85,h=1.50,double=True);canopy(b,y-.15,1.95,1.85,.48)
        if level==3:
            # The L2 twin towers become a single commanding central landmark.
            # Two lateral gold-edged setbacks reinforce the diagonal silhouette.
            with b.at((0,0,0)):pinnacle(b,1.91,2.55,7.43,1.00)
            for x in (-1.43,1.43):
                with b.at((x,0,0)):
                    for dx in (-.28,.28):b.box((dx,-1.29,2.93),(.09,.08,4.75),'wood_light')
                    crest(b,0,-1.31,5.07,.81,.86)
            for x in (-2.64,2.64):
                with b.at((x,0,0)):copper_roof(b,1.35,2.38,4.06,.60)
    elif family=='finance':
        floors=4 if level==3 else level;body=.30+floors*1.15
        top=shell(b,4.25,d,floors,1.15,front=False,faces=(0,math.pi));barrel(b,4.25,d+.10,body+.07,.57)
        for x in (-2.65,2.65):
            side_top=tower_mass(b,x,0,1.26,d,1 if level==1 else (5 if level==3 else level+1),step=level!=3,faces=(0,math.pi,math.pi/2 if x>0 else -math.pi/2))
            # The wings outgrow the central hall at L2/3. Their emblem must
            # follow the wing parapet, never the hall height through a window.
            # L3 already has its own crown crest below.
            if level<3:
                with b.at((x,0,0)):crest(b,0,y-.13,side_top+(.30 if level==1 else .12),.69,.72 if level==1 else .60)
        for x in (-1.45,1.45):
            for f in range(floors):window(b,x,y,.55+f*1.15,.55,.72)
        window(b,0,y,.74,1.24,max(.70,body-.90),True)
        for x in (-.86,.86):b.box((x,y-.18,body/2+.20),(.21,.20,body+.10),'stone')
        crest(b,0,y-.14,body+.37,1.25,.83)
        door(b,0,y-.16,w=.85,h=1.23,double=True);canopy(b,y-.18,1.75,1.60,.37)
        for x in (-.66,.66):lantern(b,x,y-.13,1.04)
        if level==1:clock(b,0,y-.31,body+.06,.38,coin=True)
        if level==3:
            for x in (-2.65,2.65):
                b.rod((x,0,6.87),(x,0,7.63),.047,'wood_light',8)
                crest(b,x,y-.14,6.12,.69,.90)
                with b.at((x,0,0)):pinnacle(b,1.19,2.26,6.20,.95)
            # Broad copper rotunda and the oversized clock distinguish the
            # exchange from residential towers even in the overhead camera.
            b.cylinder((0,0,body+.61),.88,.28,'stone',24)
            kit.dome(b,0,0,body+.75,.92,.76,'roof')
            b.cylinder((0,0,body+1.52),.17,.24,'wood_light',12,top=.08)
            clock(b,0,y-.36,body+.14,.58)
            for x in (-1.00,1.00):crest(b,x,y-.20,body+.07,.56,.83)
    else:
        # Public bath: a glazed copper-ribbed winter garden between two piers.
        floors=1 if level==1 else 2;body=.30+floors*1.12
        shell(b,4.25,d,floors,1.12,front=False,faces=(0,math.pi))
        for f in range(floors):
            for x in (-1.48,-.73,0,.73,1.48):window(b,x,y,.54+f*1.12,.54,.79,True)
        barrel(b,4.30,d+.12,body+.06,.62,level>1)
        for x in (-2.68,2.68):
            tower_mass(b,x,0,1.25,d,1 if level==1 else 3,faces=(0,math.pi,math.pi/2 if x>0 else -math.pi/2))
            with b.at((x,0,0)):
                b.box((0,y-.14,(body+.30)/2),(.10,.06,body-.10),'wood_light')
        if level==1:
            kit.dome(b,0,0,body+.61,.48,.34)
            crest(b,0,y-.14,body+.18,.72,.45)
        elif level==3:
            # Third view is a central glazed rotunda, not a taller copy of level 2.
            with b.at((0,-.12,0)):
                shell(b,1.75,2.48,3,1.15,front=False,faces=(0,math.pi))
                window(b,0,-1.24,.55,1.26,3.09,True)
                for x in (-.83,.83):b.box((x,-1.37,2.03),(.21,.20,3.49),'stone')
                kit.dome(b,0,0,3.91,1.02,1.39,'water')
                for i in range(12):
                    a=i*math.tau/12
                    for j in range(8):
                        t=j*math.pi/16;tt=(j+1)*math.pi/16
                        b.rod((1.04*math.cos(t)*math.cos(a),1.04*math.cos(t)*math.sin(a),3.91+1.40*math.sin(t)),(1.04*math.cos(tt)*math.cos(a),1.04*math.cos(tt)*math.sin(a),3.91+1.40*math.sin(tt)),.028,'wood_light',6)
        # Shallow stepped pool physically held inside a bevelled stone surround.
        with b.at((0,-d/2-.26,0)):
            b.box((0,0,.28),(3.95,.80,.32),'stone')
            b.box((0,0,.45),(4.04,.86,.08),'trim')
            b.box((0,0,.50),(3.72,.60,.025),'water')
            for x in (-1.28,0,1.28):b.box((x,-.44,.29),(.025,.022,.23),'trim')
        for x in (-2.00,2.00):planter(b,x,y-.34,r=.16)
    for x in (-3.10,3.10):planter(b,x,y-.18,r=.14)
    return b.finish(bevel=.014)

def thermal_pool(b,x,y,w,d,z=.40):
    """A sunken bath with a visible water plane, not a blue facade stripe."""
    with b.at((x,y,0)):
        b.box((0,0,z-.16),(w,d,.28),'stone')
        b.box((0,0,z-.005),(w-.20,d-.20,.035),'water')
        for side in (-1,1):
            b.box((side*(w/2-.07),0,z+.025),(.14,d,.10),'trim')
            b.box((0,side*(d/2-.07),z+.025),(w,.14,.10),'trim')
        # Submerged seats, a copper spout and two stainless pool-entry rails.
        b.box((0,d*.25,z+.005),(w-.37,.17,.06),'stone')
        b.rod((w*.26,d*.39,z+.07),(w*.26,d*.39,z+.35),.032,'wood_light',8)
        b.rod((w*.26,d*.39,z+.35),(w*.26,d*.23,z+.35),.032,'wood_light',8)
        for xx in (-.12,.12):
            b.rod((xx,-d*.45,z+.04),(xx,-d*.45,z+.29),.026,'metal',8)
            b.rod((xx,-d*.45,z+.29),(xx,-d*.18,z+.29),.026,'metal',8)
            b.rod((xx,-d*.18,z+.29),(xx,-d*.18,z-.03),.026,'metal',8)
        # A broad smooth ripple makes the warm-water surface legible on a phone.
        for i in range(16):
            a=i*math.tau/16;c=(i+1)*math.tau/16
            b.rod((math.cos(a)*w*.19,math.sin(a)*d*.19,z+.020),(math.cos(c)*w*.19,math.sin(c)*d*.19,z+.020),.010,'trim',6)

def steam_crest(b,x,y,z,w=1.0):
    # Three rising curls above a shallow bowl are the public-bath emblem.
    for i in range(12):
        a=math.pi+i*math.pi/12;c=math.pi+(i+1)*math.pi/12
        b.rod((x+math.cos(a)*w*.45,y,z+math.sin(a)*w*.12),(x+math.cos(c)*w*.45,y,z+math.sin(c)*w*.12),.030,'wood_light',8)
    for k in (-1,0,1):
        for i in range(6):
            zz=i*.075;next_z=(i+1)*.075
            b.rod((x+k*w*.24+math.sin(i*.9)*.048,y,z+.08+zz),(x+k*w*.24+math.sin((i+1)*.9)*.048,y,z+.08+next_z),.025,'wood_light',8)

def thermal_resort(level,mats):
    if level==3:return thermal_palace(mats)
    b=Mesh(f'expansion_onsen_{level}',mats);b.bevel_min=.11
    w=6.9;d=2.90;base(b,w,d)
    # Baths occupy the entire exposed front courtyard. The hotel wing is kept
    # narrow and behind them, so it cannot hide the water in the game camera.
    rear_y=.80;hall_d=1.18;hall_w=4.05;floors=1 if level<3 else 2
    with b.at((0,rear_y,0)):
        top=shell(b,hall_w,hall_d,floors,1.05,front=False,faces=(0,math.pi))
        for x in (-1.49,-.77,.77,1.49):window(b,x,-hall_d/2,.55,.50,.73,True)
        if level==3:
            for x in (-1.50,1.50):window(b,x,-hall_d/2,1.61,.64,.78,True,True)
        door(b,0,-hall_d/2,w=.53,h=.92)
        barrel(b,hall_w+.04,hall_d+.11,top+.07,.42,level>1)
        steam_crest(b,0,-hall_d/2-.19,top+.04,.91)
    side_floors={1:1,2:2,3:3}[level]
    for x in (-2.68,2.68):
        with b.at((x,.31,0)):
            tower_top=tower_mass(b,0,0,1.25,1.96,side_floors,step=level>1,faces=(0,math.pi,math.pi/2 if x>0 else -math.pi/2))
            if level==1:copper_roof(b,1.42,2.11,tower_top+.31,.45)
            if level==3:
                b.cylinder((0,0,tower_top+.85),.36,.22,'stone',16)
                kit.dome(b,0,0,tower_top+.96,.47,.53,'roof')
                b.cylinder((0,0,tower_top+1.51),.07,.18,'wood_light',10)
    if level==3:
        # Tall glass rotunda at the rear leaves both bathing terraces open.
        with b.at((0,.80,0)):
            b.box((0,0,2.66),(1.45,1.26,.66),'stone')
            window(b,0,-.63,1.50,1.07,1.42,True)
            kit.dome(b,0,0,3.04,.89,1.09,'water')
            for i in range(10):
                a=i*math.tau/10
                for j in range(7):
                    t=j*math.pi/14;tt=(j+1)*math.pi/14
                    b.rod((.91*math.cos(t)*math.cos(a),.91*math.cos(t)*math.sin(a),3.04+1.11*math.sin(t)),(.91*math.cos(tt)*math.cos(a),.91*math.cos(tt)*math.sin(a),3.04+1.11*math.sin(tt)),.025,'wood_light',6)
            b.cylinder((0,0,4.19),.13,.19,'wood_light',12,top=.07)
        for x in (-1.96,1.96):planter(b,x,.02,.25,.15)
    if level==1:thermal_pool(b,0,-.60,3.96,1.60,.44)
    else:
        for x in (-1.05,1.05):thermal_pool(b,x,-.60,1.92,1.60,.44 if level==2 else .52)
        if level==3:
            # Terraced bath deck, bronze towel benches and stone water cascade.
            for x in (-1.87,1.87):b.box((x,-.18,.60),(.23,.65,.17),'wood_light')
            b.box((0,-.30,.58),(.23,.26,.75),'stone')
            b.box((0,-.46,.67),(.13,.035,.42),'water')
    for x in (-3.05,3.05):planter(b,x,-.94,.22,.15)
    root=b.finish(bevel=.014)
    root['thermalPools']=([[0,-.60,.44,3.76,1.40]] if level==1 else [[x,-.60,.44 if level==2 else .52,1.72,1.40] for x in (-1.05,1.05)])
    return root

def thermal_palace(mats):
    """L3 urban spa: a glazed bath palace between open elevated spring decks."""
    b=Mesh('expansion_onsen_3',mats);b.bevel_min=.11
    base(b,6.9,2.90)
    with b.at((0,.80,0)):
        hall=shell(b,4.05,1.18,3,1.05,front=False,faces=(0,math.pi))
        for f in range(3):
            for x in (-1.50,1.50):window(b,x,-.59,.54+f*1.05,.62,.76,True,f==2)
        barrel(b,4.09,1.31,hall+.07,.43,True)
        # A full-height arch of glazing and broad stone piers hold the tall dome.
        b.box((0,0,2.73),(1.92,1.35,4.84),'stone')
        for angle in (0,math.pi):
            with b.facing(angle):
                window(b,0,-.675,.56,1.49,4.30,True)
                for x in (-.89,.89):b.box((x,-.76,2.78),(.22,.20,4.86),'trim')
                b.box((0,-.76,5.11),(2.13,.20,.16),'wood_light')
        door(b,0,-.675,w=.70,h=1.05,double=True)
        steam_crest(b,0,-.88,4.58,1.17)
        # Elliptical copper-ribbed glass dome: shallow in depth to keep the
        # pools uncovered while its broad arch remains a real building crown.
        rx=1.13;ry=.73;h=1.44;z=5.17;n=20;rings=10;verts=[]
        for j in range(rings+1):
            t=j*math.pi/(2*rings)
            for i in range(n):
                a=i*math.tau/n;verts.append((rx*math.cos(t)*math.cos(a),ry*math.cos(t)*math.sin(a),z+h*math.sin(t)))
        b.poly(verts,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)],'water',True)
        for i in range(12):
            a=i*math.tau/12
            for j in range(8):
                t=j*math.pi/16;tt=(j+1)*math.pi/16
                b.rod(((rx+.012)*math.cos(t)*math.cos(a),(ry+.012)*math.cos(t)*math.sin(a),z+(h+.012)*math.sin(t)),((rx+.012)*math.cos(tt)*math.cos(a),(ry+.012)*math.cos(tt)*math.sin(a),z+(h+.012)*math.sin(tt)),.029,'wood_light',6)
        b.cylinder((0,0,6.64),.12,.14,'wood_light',12,top=.08)
    for x in (-2.68,2.68):
        with b.at((x,.31,0)):
            tower_mass(b,0,0,1.25,1.96,2,step=False,faces=(0,math.pi,math.pi/2 if x>0 else -math.pi/2))
            thermal_pool(b,0,0,1.07,1.73,2.99)
            # The side-pavilion roof is now a visibly usable hot-spring terrace.
            for yy in (-.79,.79):
                for xx in (-.54,.54):b.box((xx,yy,3.23),(.065,.065,.39),'wood_light')
                b.box((0,yy,3.44),(1.14,.075,.055),'wood_light')
        sign=-1 if x<0 else 1
        b.box((sign*2.03,-.12,1.73),(.18,.27,2.49),'stone')
        b.box((sign*2.03,-.265,1.72),(.125,.035,2.40),'water')
        for zz in (.54,1.34,2.14,2.94):
            b.cylinder((sign*2.03,-.17,zz),.18,.10,'trim',12)
            b.cylinder((sign*2.03,-.17,zz+.055),.14,.015,'water',12)
    for x in (-1.05,1.05):thermal_pool(b,x,-.60,1.92,1.60,.52)
    for x in (-3.05,3.05):planter(b,x,-.94,.22,.15)
    root=b.finish(bevel=.014)
    root['thermalPools']=[[x,-.60,.52,1.72,1.40] for x in (-1.05,1.05)]+[[x,.31,2.99,.87,1.53] for x in (-2.68,2.68)]
    return root

def clock(b,x,y,z,r=.30,coin=False,information=False):
    # Existing semantic emblem, enlarged to match this kit's source units.
    with b.at((x,y,z)):
        b.rod((0,.04,0),(0,-.05,0),r*1.1,'wood_light',24)
        b.rod((0,-.05,0),(0,-.07,0),r,'trim' if not coin else 'accent',24)
        if information:
            b.box((0,-.09,-r*.1),(.055,.025,r),'accent');b.sphere((0,-.10,r*.65),(.045,.018,.045),'accent',8,4)
        elif coin:crest(b,0,-.10,-r*.45,r*1.3,r*.90)
        else:
            for i in range(12):
                a=i*math.tau/12;b.rod((r*.76*math.sin(a),-.10,r*.76*math.cos(a)),(r*.92*math.sin(a),-.10,r*.92*math.cos(a)),.014,'metal',6)
            b.rod((0,-.12,0),(-r*.52,-.12,r*.2),.022,'metal');b.rod((0,-.12,0),(r*.15,-.12,r*.65),.017,'metal')

def copper_roof(b,w,d,z,h=.58):
    # A clean four-sided copper roof with individual standing seams.
    lower=[(-w/2,-d/2,z),(w/2,-d/2,z),(w/2,d/2,z),(-w/2,d/2,z)]
    upper=[(-w*.24,-d*.21,z+h),(w*.24,-d*.21,z+h),(w*.24,d*.21,z+h),(-w*.24,d*.21,z+h)]
    b.poly(lower+upper,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]+[(4,5,6,7)],'roof')
    for i in range(4):
        a=lower[i];c=lower[(i+1)%4];aa=upper[i];cc=upper[(i+1)%4]
        for j in range(7):
            t=j/6;start=tuple(a[k]*(1-t)+c[k]*t+( .02 if k==2 else 0) for k in range(3));end=tuple(aa[k]*(1-t)+cc[k]*t+(.02 if k==2 else 0) for k in range(3))
            b.rod(start,end,.018,'roof_edge',6)
    b.box((0,0,z-.035),(w+.04,d+.04,.10),'trim');b.box((0,0,z+h+.03),(w*.50,d*.44,.07),'roof_edge')

def public(name,mats):
    b=Mesh('expansion_'+name,mats);w=2.72;d=2.10;y=-d/2;wheel=None;pendulum=None
    base(b,3.05,2.55)
    if name=='teleport_gate':
        for x in (-1.19,1.19):
            with b.at((x,0,0)):
                shell(b,.76,1.67,1,2.52,front=False)
                window(b,0,-.835,.64,.40,1.85,True)
                copper_roof(b,.92,1.82,2.93,.57)
                b.cylinder((0,0,3.61),.12,.25,'wood_light',12,top=.10)
        with b.at((0,0,.25)):kit.arch_opening(b,1.57,2.32,1.34,'stone',.16)
        b.box((0,0,2.69),(1.70,1.60,.24),'roof')
        crown(b,1.60,1.58,2.80,.62)
        b.xz_shape([(-.12,0),(.12,0),(.12,.47),(0,.62),(-.12,.47)],(0,-.88,2.98),.08,'water')
        for x in (-.17,.17):b.rod((x,-.94,2.94),(x,-.94,3.47),.025,'wood_light')
    else:
        tall=name in ('builders_guild','chance_wheel','junction_hub')
        h=2.58 if tall else 2.02
        top=shell(b,w,d,1,h-.30,front=False)
        if name in ('builders_guild','chance_wheel','junction_hub'):
            copper_roof(b,w+.16,d+.16,top+.05,.49)
            b.box((0,-.12,top+.05),(1.03,1.88,.96),'wall')
            crown(b,1.06,1.94,top+.52,.49)
            window(b,0,y-.025,2.20,.45,1.01,True)
            for x in (-.41,.41):b.box((x,y-.09,2.66),(.13,.15,1.57),'stone')
        else:copper_roof(b,w+.16,d+.16,top+.05,.62)
        # The map office uses the left bay for its board and the right bay
        # for an offset entrance, so neither bay receives a generic window.
        if name!='junction_hub':
            for x in (-1.00,1.00):window(b,x,y,.60,.40,1.05,True)
        if name=='civic_hall':
            for x in (-.53,.53):b.box((x,y-.10,1.38),(.19,.18,2.10),'stone')
            door(b,0,y,w=.73,h=1.22,double=True);window(b,0,y-.03,1.40,.65,.52,True)
            b.box((0,-.73,2.22),(1.05,.74,.89),'wall');clock(b,0,-1.16,2.32,.36)
            crest(b,0,-1.19,2.78,.60,.46)
            for x in (-.39,.39):
                for yy in (-1.02,-.30):b.box((x,yy,3.25),(.16,.16,.72),'stone')
            b.cylinder((0,-.66,3.25),.23,.39,'wood_light',16,top=.11)
            b.sphere((0,-.66,3.00),(.045,.045,.055),'metal',8,4)
            b.box((0,-.66,3.65),(1.02,.99,.15),'trim');kit.dome(b,0,-.66,3.75,.53,.32)
            for x in (-.71,.71):lantern(b,x,y,1.18)
        elif name=='vault_bank':
            door(b,0,y,w=.73,h=1.17,double=True)
            for x in (-.59,.59):b.box((x,y-.13,1.43),(.25,.22,2.22),'stone')
            canopy(b,y,1.68,1.24,.30,False);clock(b,0,y-.16,2.28,.42,coin=True)
            for x in (-1.0,1.0):
                for dx in (-.13,0,.13):b.box((x+dx,y-.18,1.17),(.025,.04,1.07),'metal')
                for zz in (.63,1.68):b.box((x,y-.18,zz),(.40,.04,.045),'wood_light')
        elif name=='builders_guild':
            # Open workshop bay, stocked left lean-to, right hoist, crossed hammers.
            b.box((0,y-.10,1.07),(1.43,.15,1.51),'recess')
            for x in (-.72,.72):b.box((x,y-.23,1.10),(.16,.18,1.62),'wood')
            b.box((0,y-.23,1.87),(1.59,.18,.15),'wood')
            for zz in (.55,.90,1.25):
                b.box((-.23,y-.22,zz),(.71,.27,.07),'wood_light')
                for xx in (-.41,-.16,.05):b.box((xx,y-.24,zz+.11),(.18,.17,.12),'wood')
            b.box((0,y-.15,2.10),(.86,.11,.58),'stone')
            for sign in (-1,1):
                b.rod((sign*.23,y-.23,1.93),(sign*-.19,y-.23,2.27),.034,'wood_light')
                b.box((sign*-.19,y-.25,2.27),(.22,.07,.11),'wood_light',sign*.6)
            for x in (-1.74,-1.17):b.box((x,.0,.91),(.10,1.62,1.31),'wood')
            b.poly([(-1.87,-.91,1.53),(-1.03,-.91,1.93),(-1.03,.90,1.93),(-1.87,.90,1.53)],[(0,1,2,3)],'roof')
            for zz in (.45,.77,1.09):
                b.box((-1.48,-.42,zz),(.60,.91,.08),'wood_light')
                for i in range(3):b.box((-1.65+i*.18,-.47,zz+.12),(.14,.65,.16),'wood')
            b.box((1.13,.64,2.95),(.43,.44,1.09),'wall');b.box((1.13,.64,3.51),(.53,.56,.14),'stone')
            b.box((1.30,-.32,2.28),(.15,.18,1.15),'wood');b.box((1.55,-.32,2.82),(.83,.20,.18),'wood')
            b.rod((1.30,-.32,2.19),(1.92,-.32,2.81),.065,'wood_light');pendulum=(1.94,-.32,2.78)
        elif name in ('card_pavilion','chance_wheel'):
            b.box((0,y-.12,1.12),(1.48,.14,1.52),'recess')
            b.box((0,y-.24,.61),(1.51,.23,.55),'wood');b.box((0,y-.30,.92),(1.61,.33,.12),'wood_light')
            for x in (-.71,.71):b.box((x,y-.24,1.37),(.11,.17,1.06),'accent')
            if name=='card_pavilion':
                stripe_awning(b,y-.04,1.94,1.83)
                for zz in (1.12,1.39,1.67):
                    b.box((0,y-.17,zz),(1.33,.19,.045),'wood_light')
                    for x in (-.45,0,.45):
                        for i in range(3):b.box((x,y-.28,zz+.024+i*.028),(.24,.13,.02),'trim')
                for i in range(3):
                    with b.at(((i-1)*.57,y-.14,2.49)):
                        b.box((0,0,0),(.53,.10,.73),'wood_light');b.box((0,-.065,0),(.46,.04,.65),'trim')
                        if i==0:
                            b.xz_shape([(0,-.19),(-.18,.04),(-.14,.17),(-.05,.18),(0,.09),(.05,.18),(.14,.17),(.18,.04)],(0,-.10,0),.025,'flower')
                        elif i==1:b.xz_shape([(0,-.21),(-.17,0),(0,.21),(.17,0)],(0,-.10,0),.025,'flower')
                        else:
                            for xx,zz in ((-.09,.015),(.09,.015),(0,.14)):b.rod((xx,-.09,zz),(xx,-.13,zz),.105,'metal',12)
                            b.xz_shape([(-.07,-.20),(.07,-.20),(0,.04)],(0,-.10,0),.03,'metal')
            else:
                canopy(b,y,1.95,1.87,.51)
                kit.dome(b,0,y-.18,2.07,.91,.29)
                wheel=(1.25,-1.40,1.19)
                for x in (.96,1.54):b.rod((x,-1.31,.25),(1.25,-1.31,1.25),.055,'stone')
                b.xz_shape([(-.10,.15),(.10,.15),(0,-.12)],(1.25,-1.56,1.91),.07,'wood_light')
            for x in (-.90,.90):lantern(b,x,y,1.35)
        elif name=='rush_station':
            door(b,0,y,w=.85,h=1.25,double=True)
            canopy(b,y,1.86,2.46,.61,False);clock(b,0,y-.13,2.50,.31)
            for x in (-1.02,1.02):
                pier(b,x,y-.47,.27,1.44,.075);b.sphere((x,y-.53,1.58),(.13,.12,.14),'glass',12,6)
            b.box((0,y-.10,2.94),(.99,.10,.22),'wood_light')
            for sign in (-1,1):
                for i in range(3):b.box((sign*(.21+i*.14),y-.18,2.95-i*.05),(.23,.035,.055),'wood_light')
            b.box((0,1.22,.54),(1.47,.36,.09),'wood');b.box((0,1.36,.81),(1.47,.07,.26),'wood_light')
        elif name=='junction_hub':
            # Actual regional view is a map office with a right-side door.
            door(b,.87,y,w=.48,h=1.14)
            b.box((-.37,y-.13,1.18),(1.39,.17,1.11),'wood_light')
            b.box((-.37,y-.24,1.18),(1.25,.035,.97),'leaf_light')
            b.poly([(-.97,y-.27,.75),(-.80,y-.27,.75),(.22,y-.27,1.56),(.22,y-.27,1.67)],[(0,1,2,3)],'water')
            for a,c in (((-.93,.91),(.16,1.47)),((-.94,1.51),(.17,.86)),((-.66,1.60),(-.21,.76))):
                b.rod((a[0],y-.29,a[1]),(c[0],y-.29,c[1]),.035,'trim',6)
            clock(b,-.37,y-.31,1.18,.10,coin=True);canopy(b,y,1.87,1.61,.28,False)
            b.box((1.54,-.10,1.47),(.09,.09,2.14),'metal')
            for i in range(3):b.xz_shape([(-.25,-.105),(.30,-.105),(.43,0),(.30,.105),(-.25,.105)],(1.56,-.16,2.30-i*.30),.065,'roof' if i%2 else 'wood_light')
        if name not in ('builders_guild','chance_wheel'):
            for x in (-1.18,1.18):planter(b,x,y-.24,r=.11)
    root=b.finish(bevel=.014)
    if wheel:
        empty=bpy.data.objects.new('expansion_life_wheel_rotor',None);bpy.context.collection.objects.link(empty);empty.parent=root;empty.location=wheel;empty['lifePart']='wheel'
        part=Mesh('expansion_wheel',mats);part.rod((0,.04,0),(0,-.06,0),.57,'wood_light',32)
        for i in range(12):
            a=i*math.tau/12;c=(i+1)*math.tau/12
            part.poly([(0,-.09,0),(.51*math.sin(a),-.09,.51*math.cos(a)),(.51*math.sin(c),-.09,.51*math.cos(c))],[(0,2,1)],('accent','flower','wood_light')[i%3])
            part.rod((0,-.11,0),(.52*math.sin(a),-.11,.52*math.cos(a)),.014,'wood_light',6)
        part.rod((0,-.12,0),(0,-.20,0),.09,'metal',16);part.finish(empty,bevel=.008)
    if pendulum:
        empty=bpy.data.objects.new('expansion_life_crane_pendulum',None);bpy.context.collection.objects.link(empty);empty.parent=root;empty.location=pendulum;empty['lifePart']='pendulum'
        part=Mesh('expansion_crane_load',mats);part.rod((0,0,0),(0,0,-.76),.017,'metal');part.box((0,0,-.91),(.38,.35,.31),'wood_light')
        for x in (-.13,.13):part.box((x,-.185,-.91),(.035,.035,.36),'wood')
        part.finish(empty,bevel=.012)
    return root

def build(region,asset):
    if region!='expansion':raise ValueError(region)
    mats=materials()
    if asset in ('civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub'):return public(asset,mats)
    family,level=asset.rsplit('_',1);level=int(level)
    return large(family,level,mats) if family in ('skyscraper','finance','onsen') else core(family,level,mats)
