"""Build two original public-building kits from the archived imagegen concept boards.

Blender 5.2 --background --factory-startup --python art/build_map_specials.py
MAP_SPECIALS_KIT=compact|expansion and MAP_SPECIALS_RENDER=0 can narrow rebuilds.
Concepts/prompts: art/map-specials/. Coordinates match the classic kit: Z-up,
front -Y, bottom-centred; exported glTF is Y-up and front +Z. No classic asset
is edited. All forms, card suits, rail stock and decorative trim are real mesh.
"""
from pathlib import Path
import os

# Reuse the established coordinate convention and beveled mesh authoring helpers.
source = Path(__file__).with_name('build_specials.py')
exec(compile(source.read_text(encoding='utf8').split('FACTORIES=')[0], str(source), 'exec'))
PREVIEW = ROOT / 'art' / 'map-specials' / 'renders'
PREVIEW.mkdir(parents=True, exist_ok=True)
M = {
    'ivory': material('Map porcelain cream', 'FFF1D2', .34),
    'cream': material('Map cornice warm cream', 'F7DAA4', .4),
    'stone': material('Map sand plinth', 'DAC293', .53),
    'gold': material('Map satin brass', 'DDA83C', .3, .38),
    'gold_dark': material('Map recessed brass', 'A87732', .38, .25),
    'mint': material('Map teal enamel roof', '357E86', .3, .08),
    'mint_light': material('Map pistachio walls', '90CDB7', .35),
    'petrol': material('Map deep blue glazing', '20485C', .25, .18),
    'navy': material('Map navy steel', '294B63', .35, .15),
    'purple': material('Map berry lacquer', '984B83', .33),
    'purple_light': material('Map lavender enamel', 'BC90C2', .35),
    'orange': material('Map coral enamel', 'E48A76', .34),
    'yellow': material('Map crane golden yellow', 'F0BB42', .35, .1),
    'steel': material('Map grey steel', '71808D', .28, .55),
    'dark': material('Map dark recess', '27343C', .42),
    'concrete': material('Map concrete', 'C2C6BD', .58),
    'brick': material('Map brick', 'C88E68', .48),
    'red': material('Map cherry card and rail', 'C95C65', .32),
    'leaf': material('Map topiary jade', '44775C', .5),
    'leaf_light': material('Map topiary spring', '80A36B', .46),
    'soil': material('Map planter earth', '816347', .6),
    'glow': material('Map warm lantern glass', 'FFE6AB', .25, 0, .6),
    'cyan': material('Map luminous portal cyan', '70E5DF', .25, .04, .9),
    'water': material('Map glazed turquoise glass', '63BFC8', .24, .2),
    'wood': material('Map honey dock planks', 'B98B5B', .5),
}
MATS = list(M.values()); IDX = {k: MATS.index(v) for k,v in M.items()}

def ring_band(b,p,r,width,depth,mat,n=48):
    b.torus(p,r,width,mat,axis='Y',n=n,m=8)
    if depth > width*2:
        x,y,z=p
        b.torus((x,y+depth*.5,z),r,width,mat,axis='Y',n=n,m=8)

def rounded_box(b,p,s,mat,r=.025):
    x,y,z=p;w,d,h=s;r=min(r,w*.2,d*.2);bev=min(r,h*.28)
    rings=[];n=24
    for zz,inset in [(-h/2,bev),(-h/2+bev*.3,bev*.28),(-h/2+bev,0),(h/2-bev,0),(h/2-bev*.3,bev*.28),(h/2,bev)]:
        ring=[]
        for k in range(4):
            cx=(w*.5-r)*(1 if k in [0,3] else -1);cy=(d*.5-r)*(1 if k in [0,1] else -1)
            for j in range(6):
                a=k*math.pi*.5+j*math.pi/10
                ring.append((x+cx+(r-inset)*math.cos(a),y+cy+(r-inset)*math.sin(a),z+zz))
        rings.append(ring)
    vs=sum(rings,[])
    b.poly(vs,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(5) for i in range(n)],mat,True)
    b.poly(rings[0],[tuple(range(n-1,-1,-1))],mat)
    b.poly(rings[-1],[tuple(range(n))],mat)

def arch(b,x,y,z,w,h,depth,mat,steps=20):
    radius=w*.5; rise=min(radius,h);spring=h-rise
    raw=[(-radius,0),(radius,0)]+[(radius*math.cos(i*math.pi/steps),spring+rise*math.sin(i*math.pi/steps)) for i in range(steps+1)]
    pts=[]
    for point in raw:
        if not pts or math.dist(point,pts[-1])>1e-7:pts.append(point)
    if math.dist(pts[0],pts[-1])<1e-7:pts.pop()
    b.xz_shape(pts,(x,y,z),depth,mat)

def arch_window(b,x,y,z,w=.13,h=.29):
    arch(b,x,y,z,w+.032,h+.026,.028,'cream')
    arch(b,x,y-.020,z+.011,w,h,.022,'petrol')
    b.rod((x,y-.036,z+.015),(x,y-.036,z+h-.016),.006,'gold',6)
    b.rod((x-w*.45,y-.036,z+h*.54),(x+w*.45,y-.036,z+h*.54),.005,'gold',6)

def clock_face(b,x,y,z,r=.092):
    b.front_disc((x,y,z),r,.026,'gold',40)
    b.front_disc((x,y-.018,z),r*.86,.013,'ivory',40)
    for i in range(12):
        a=i*math.tau/12
        b.rod((x+math.sin(a)*r*.69,y-.03,z+math.cos(a)*r*.69),(x+math.sin(a)*r*.77,y-.03,z+math.cos(a)*r*.77),.0034,'navy',6)
    b.rod((x,y-.034,z),(x+r*.38,y-.034,z+r*.24),.005,'navy',8)
    b.rod((x,y-.034,z),(x-r*.19,y-.034,z+r*.53),.004,'navy',8)
    b.sphere((x,y-.036,z),(.008,.005,.008),'gold',10,6)

def curved_hip(b,p,w,d,h,mat='mint'):
    x,y,z=p; rings=[]
    # Rounded rectangular hip roof with a gentle outward sweep to the eaves.
    for j in range(9):
        t=j/8; sc=1-.68*math.sin(t*math.pi*.5)
        zz=z+h*(1-math.cos(t*math.pi*.5))
        rr=[]
        for i in range(32):
            a=i*math.tau/32
            xx=math.copysign(abs(math.cos(a))**.5,math.cos(a))*w*.5*sc
            yy=math.copysign(abs(math.sin(a))**.5,math.sin(a))*d*.5*sc
            rr.append((x+xx,y+yy,zz))
        rings.append(rr)
    b.poly(sum(rings,[]),[(j*32+i,j*32+(i+1)%32,(j+1)*32+(i+1)%32,(j+1)*32+i) for j in range(8) for i in range(32)],mat,True)
    b.box((x,y,z-.017),(w,d,.032),'cream')
    for i in [0,4,8,12,16,20,24,28]:
        for j in range(8):
            b.rod(rings[j][i],rings[j+1][i],.005,'mint_light',6)
    b.box((x,y,z+h+.006),(w*.34,d*.34,.027),'gold')

def barrel_roof(b,p,w,d,h,mat='mint',bands=False):
    x,y,z=p; n=24; vs=[]
    for yy in [-d/2,d/2]:
        for i in range(n+1):
            a=i*math.pi/n
            vs.append((x+w*.5*math.cos(a),y+yy,z+h*math.sin(a)))
    b.poly(vs,[(i,i+1,n+2+i,n+1+i) for i in range(n)],mat,True)
    for yy in [-d/2,d/2]:
        for i in range(n):
            a=i*math.pi/n;aa=(i+1)*math.pi/n
            b.rod((x+w*.5*math.cos(a),y+yy,z+h*math.sin(a)),(x+w*.5*math.cos(aa),y+yy,z+h*math.sin(aa)),.027,'ivory',8)
    if bands:
        for i in range(1,8):
            a=i*math.pi/8
            b.rod((x+w*.5*math.cos(a),y-d/2,z+h*math.sin(a)+.005),(x+w*.5*math.cos(a),y+d/2,z+h*math.sin(a)+.005),.009,'gold',6)
        for yy in [-d*.2,d*.2]:
            for i in range(n):
                a=i*math.pi/n;aa=(i+1)*math.pi/n
                b.rod((x+w*.5*math.cos(a),y+yy,z+h*math.sin(a)+.004),(x+w*.5*math.cos(aa),y+yy,z+h*math.sin(aa)+.004),.007,'mint_light',6)

def dome_custom(b,p,r,h,mat='mint',ribs=True):
    x,y,z=p; n=40; nr=12;vs=[]
    for j in range(nr+1):
        a=j*math.pi*.5/nr
        for i in range(n):
            t=i*math.tau/n
            vs.append((x+r*math.cos(a)*math.cos(t),y+r*math.cos(a)*math.sin(t),z+h*math.sin(a)))
    b.poly(vs,[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(nr) for i in range(n)],mat,True)
    b.cylinder((x,y,z-.01),r*1.025,.037,'gold',40)
    if ribs:
        for i in range(8):
            a=i*math.tau/8
            for j in range(8):
                t=j*math.pi/16;tt=(j+1)*math.pi/16
                b.rod((x+(r+.004)*math.cos(t)*math.cos(a),y+(r+.004)*math.cos(t)*math.sin(a),z+h*math.sin(t)),(x+(r+.004)*math.cos(tt)*math.cos(a),y+(r+.004)*math.cos(tt)*math.sin(a),z+h*math.sin(tt)),.008,'gold',6)

def bollard(b,x,y,z=.1):
    b.cylinder((x,y,z+.07),.026,.14,'navy',14)
    b.cylinder((x,y,z+.13),.034,.022,'gold',14)
    b.sphere((x,y,z+.145),(.032,.032,.019),'navy',14,8)

def topiary(b,x,y,z=.08,cone=False):
    b.cylinder((x,y,z+.028),.055,.056,'cream',18,r2=.063)
    b.cylinder((x,y,z+.061),.061,.014,'gold',18)
    if cone:
        b.cylinder((x,y,z+.17),.056,.22,'leaf',18,r2=.01)
        b.sphere((x,y,z+.245),(.024,.024,.06),'leaf_light',14,8)
    else:
        b.sphere((x,y,z+.135),(.065,.058,.075),'leaf',16,10)
        for a in range(5):
            ang=a*math.tau/5;b.sphere((x+.04*math.cos(ang),y+.034*math.sin(ang),z+.168),(.03,.03,.033),'leaf_light',12,7)

def flag(b,x,y,z,mat='mint_light'):
    b.rod((x,y,z),(x,y,z+.22),.009,'gold',8)
    b.sphere((x,y,z+.23),(.018,.018,.018),'gold',12,7)
    b.poly([(x,y,z+.21),(x+.12,y+.015,z+.185),(x+.12,y-.005,z+.1),(x,y,z+.12)],[(0,1,2,3)],mat)

def base(b,dock=False):
    rounded_box(b,(0,0,.037),(1.02,1.02,.074),'ivory',.06)
    rounded_box(b,(0,0,.078),(.955,.955,.015),'stone',.042)
    if dock:
        for i in range(11):b.box((0,-.435+i*.084,.091),(.89,.076,.024),'wood')

def civic(kit):
    b=Builder(kit+'_civic_hall');base(b)
    if kit=='compact':
        b.box((0,.035,.34),(.73,.58,.49),'orange')
        for z in [.18,.25,.32,.39,.46,.53]:
            b.box((0,-.264,z),(.73,.01,.009),'cream')
            for x in [-.37,.37]:b.box((x,.035,z),(.009,.58,.009),'cream')
        curved_hip(b,(0,.035,.61),.84,.67,.24)
        b.box((0,.08,.933),(.225,.245,.265),'orange')
        for z in [.812,1.057]:b.box((0,.08,z),(.28,.29,.034),'ivory')
        curved_hip(b,(0,.08,1.082),.30,.32,.17)
        clock_face(b,0,-.062,.965,.093)
        for x in [-.26,.26]:
            b.front_disc((x,-.279,.385),.082,.026,'cream',30)
            b.front_disc((x,-.298,.385),.063,.021,'petrol',30)
            b.rod((x-.062,-.314,.385),(x+.062,-.314,.385),.006,'gold',6)
            b.rod((x,-.314,.326),(x,-.314,.444),.006,'gold',6)
        arch(b,0,-.32,.17,.24,.31,.05,'cream');arch(b,0,-.354,.18,.18,.27,.026,'petrol')
        for x in [-.16,.16]:b.column(x,-.355,.13,.42,.033)
        arch(b,0,-.342,.52,.39,.18,.13,'ivory')
        for xx in [-.068,0,.068]:
            b.torus((xx,-.418,.596),.044,.012,'mint',start=.2,end=math.pi+.3,n=12,m=6)
        b.stairs(0,-.36,.135,.31,4)
        for x in [-.42,.42]:topiary(b,x,-.30);bollard(b,x,-.43)
        flag(b,.23,.12,.86,'navy')
    else:
        for x in [-.29,.29]:
            b.box((x,.09,.35),(.30,.57,.52),'ivory')
            curved_hip(b,(x,.09,.63),.37,.64,.20)
            for xx in [x-.082,x+.082]:arch_window(b,xx,-.213,.29,.065,.23)
            b.box((x,-.25,.22),(.32,.095,.039),'cream')
            side=1 if x>0 else -1
            for yy in [-.07,.13,.30]:
                pane=Builder('hall_side_window');arch_window(pane,0,0,0,.103,.30)
                b.merge(pane,Matrix.Translation(Vector((side*.445,yy,.21))) @ Matrix.Rotation(side*math.pi/2,4,'Z'))
            for z in [.20,.51]:b.box((side*.444,.09,z),(.014,.57,.018),'cream')
        b.box((0,.065,.67),(.235,.30,1.14),'orange')
        for z in [.27,.66,1.01,1.21]:b.box((0,.065,z),(.298,.35,.048),'ivory')
        for x in [-.105,.105]:b.box((x,-.103,.837),(.027,.023,.69),'cream')
        clock_face(b,0,-.127,1.10,.106)
        arch_window(b,0,-.109,.72,.086,.22)
        curved_hip(b,(0,.065,1.265),.31,.35,.18)
        flag(b,0,.065,1.46)
        for x in [-.21,0,.21]:
            arch(b,x,-.284,.12,.19,.30,.12,'cream')
            arch(b,x,-.35,.13,.135,.245,.035,'petrol')
        for x in [-.32,-.105,.105,.32]:b.column(x,-.37,.12,.30,.02)
        b.box((0,-.34,.43),(.76,.15,.037),'ivory');b.stairs(0,-.36,.123,.52,4)
        for x in [-.43,.43]:topiary(b,x,-.32,cone=True);b.lamp(x,-.44)
    return b,[]

def vault_door(b,x,y,z,r):
    b.front_disc((x,y,z),r,.075,'gold_dark',48)
    b.front_disc((x,y-.047,z),r*.91,.026,'gold',48)
    b.torus((x,y-.067,z),r*.80,.011,'cream',n=40,m=8)
    b.front_disc((x,y-.072,z),r*.48,.018,'gold_dark',32)
    b.torus((x,y-.09,z),r*.32,.009,'gold',n=32,m=6)
    for i in range(8):
        a=i*math.tau/8
        b.sphere((x+r*.83*math.cos(a),y-.079,z+r*.83*math.sin(a)),(.011,.006,.011),'cream',10,6)
        b.rod((x,y-.098,z),(x+r*.33*math.cos(a),y-.098,z+r*.33*math.sin(a)),.007,'gold',6)
    b.front_disc((x,y-.103,z),r*.11,.018,'gold',20)
    for dz in [-r*.56,r*.56]:b.box((x+r*.92,y-.012,z+dz),(.047,.085,.073),'gold')

def bank(kit):
    b=Builder(kit+'_vault_bank');base(b)
    if kit=='compact':
        b.box((0,.07,.435),(.70,.63,.64),'mint_light')
        for z in [.17,.72]:b.box((0,.07,z),(.77,.69,.046),'ivory')
        curved_hip(b,(0,.07,.77),.78,.72,.22,'mint_light')
        dome_custom(b,(0,.09,.92),.245,.205)
        for x in [-.30,.30]:b.column(x,-.28,.145,.56,.033)
        arch(b,0,-.295,.17,.52,.52,.067,'ivory')
        vault_door(b,0,-.349,.40,.21)
        b.stairs(0,-.358,.127,.44,4)
        b.front_disc((0,-.28,.96),.095,.03,'gold',30)
        b.xz_shape([(-.047,-.03),(.047,-.03),(0,.061)],(0,-.303,.96),.015,'cream')
        for x in [-.41,.41]:topiary(b,x,-.26);b.lamp(x,-.42)
        for side in [-1,1]:
            for yy in [.06,.27]:
                w=Builder('sidewindow');arch_window(w,0,0,0,.105,.35)
                b.merge(w,Matrix.Translation(Vector((side*.361,yy,.28))) @ Matrix.Rotation(side*math.pi/2,4,'Z'))
    else:
        b.cylinder((0,.075,.14),.411,.11,'cream',48)
        b.cylinder((0,.075,.49),.335,.61,'water',40)
        b.cylinder((0,.075,.81),.362,.071,'gold',40)
        dome_custom(b,(0,.075,.856),.346,.30,'water')
        for a in [.34,.68,1.0]:b.torus((0,.075,.856+.30*math.sin(a)),.346*math.cos(a)+.002,.005,'mint',axis='Z',n=56,m=6)
        for i in range(12):
            a=i*math.tau/12
            x=.338*math.cos(a);y=.075+.338*math.sin(a)
            b.rod((x,y,.19),(x,y,.836),.013,'gold',8)
        for z in [.28,.45,.62]:b.torus((0,.075,z),.338,.007,'mint',axis='Z',n=48,m=6)
        for z,r in [(1.18,.125),(1.215,.11),(1.24,.095)]:b.cylinder((0,.075,z),r,.032,'gold',32)
        b.front_disc((0,.075,1.354),.095,.037,'gold',36)
        b.torus((0,.052,1.354),.074,.006,'cream',n=32,m=6)
        b.star((0,.041,1.354),.047,'cream',.012)
        vault_door(b,0,-.289,.405,.245)
        for x in [-.36,.36]:b.stairs(x,-.29,.156,.17,5);topiary(b,x,.30,cone=True);b.lamp(x,-.43)
    return b,[]

def truss(b,a,c,width,mat='yellow',segments=6):
    a=Vector(a);c=Vector(c);v=c-a; normal=Vector((-v.z,0,v.x)).normalized()*width*.5
    for s in [-1,1]:b.rod(a+normal*s,c+normal*s,.018,mat,8)
    for j in range(segments):
        p=a+v*j/segments; q=a+v*(j+1)/segments
        b.rod(p+normal*((j%2)*2-1),q+normal*(((j+1)%2)*2-1),.012,mat,6)

def crate(b,p,size=.14,mat='orange'):
    x,y,z=p;b.box(p,(size,size,size),mat)
    for dx in [-.34,.34]:b.box((x+dx*size,y-size*.51,z),(.013,.015,size*.88),'cream')
    for yy in [-.34,.34]:b.box((x,y+yy*size,z+size*.51),(size*.90,.012,.012),'gold')

def crane(kit):
    b=Builder(kit+'_builders_guild');base(b,kit=='compact')
    if kit=='compact':
        for x in [-.24,.24]:
            for y in [-.13,.20]:
                b.box((x,y,.18),(.15,.16,.16),'navy')
                b.rod((x,y,.23),(x*.52,y*.70,.59),.045,'yellow',10)
        b.box((0,.04,.59),(.46,.43,.077),'yellow')
        b.cylinder((0,.04,.664),.165,.09,'gold_dark',24)
        rounded_box(b,(-.15,.005,.80),(.32,.30,.27),'navy',.025)
        for x in [-.23,-.09]:
            b.box((x,-.153,.822),(.116,.023,.178),'gold')
            b.box((x,-.169,.822),(.091,.016,.149),'petrol')
        rounded_box(b,(-.15,.005,.95),(.35,.34,.034),'yellow',.02)
        b.box((-.318,.005,.82),(.017,.19,.17),'gold');b.box((-.330,.005,.82),(.015,.163,.14),'petrol')
        b.box((-.12,-.19,.655),(.42,.10,.036),'navy')
        for x in [-.31,-.13,.065]:b.rod((x,-.234,.68),(x,-.234,.78),.006,'gold',6)
        b.rod((-.31,-.234,.78),(.065,-.234,.78),.007,'gold',6)
        for x in [-.305,.0]:b.box((x,.005,.80),(.017,.28,.23),'gold')
        for yy in [-.08,.14]:truss(b,(-.04,yy,.72),(.32,yy,1.34),.15,segments=6)
        for z in [.88,1.08,1.30]:b.rod((.08+(z-.88)*.43,-.08,z),(.08+(z-.88)*.43,.14,z),.016,'yellow',8)
        for yy in [-.12,.18]:b.rod((-.19,yy,.94),(.32,yy,1.36),.007,'dark',6)
        pivot=(.32,-.01,1.335);length=.29
        for p,mat in [((-.32,.31,.18),'mint'),((.32,.31,.18),'orange')]:crate(b,p,.16,mat)
        for x in [-.41,.41]:bollard(b,x,-.37)
    else:
        b.box((-.055,.09,.31),(.62,.56,.40),'brick')
        b.box((-.055,.09,.54),(.72,.63,.06),'concrete')
        b.door(-.10,-.213,.275,.13,.25)
        for x in [-.26,.15]:b.window(x,-.20,.33,.09,.13)
        for x in [-.19,-.05]:
            for y in [.01,.15]:b.rod((x,y,.56),(x,y,1.29),.018,'yellow',8)
        for j in range(5):
            z=.57+j*.14
            for yy in [.01,.15]:
                b.rod((-.19,yy,z),(-.05,yy,z+.14),.012,'yellow',6)
                b.rod((-.05,yy,z),(-.19,yy,z+.14),.012,'yellow',6)
        b.box((-.12,.08,1.32),(.28,.26,.064),'yellow')
        for yy in [-.015,.16]:truss(b,(-.39,yy,1.39),(.44,yy,1.39),.13,segments=9)
        b.box((-.22,-.045,1.243),(.22,.24,.23),'yellow')
        b.box((-.22,-.174,1.253),(.16,.018,.157),'petrol')
        b.box((-.344,-.045,1.245),(.018,.18,.16),'petrol')
        for x in [-.40,-.34]:b.box((x,.08,1.39),(.049,.26,.24),'concrete')
        b.rod((-.11,.08,1.43),(-.11,.08,1.595),.016,'yellow',8)
        for x in [-.37,.40]:b.rod((-.11,.08,1.59),(x,.08,1.45),.007,'gold_dark',6)
        pivot=(.345,.06,1.355);length=.27
        for y in [-.08,.14,.35]:
            for x in [.30,.43]:b.rod((x,y,.1),(x,y,.70),.009,'steel',6)
            b.rod((.30,y,.51),(.43,y,.35),.008,'steel',6)
        for z in [.29,.48,.68]:b.box((.367,.135,z),(.16,.46,.018),'concrete')
        crate(b,(-.32,-.37,.174),.17,'concrete');crate(b,(.31,-.37,.155),.12,'yellow')
    part=Builder('life_'+kit+'_crane_pendulum')
    x,y,z=pivot
    part.rod(pivot,(x,y,z-length),.006,'dark',8)
    part.box((x,y,z-.105),(.060,.059,.075),'yellow')
    part.sphere((x,y,z-length-.073),(.082,.082,.087),'steel' if kit=='expansion' else 'navy',24,14)
    part.torus((x,y,z-length-.03),.034,.007,'gold',n=24,m=6)
    return b,[(part,pivot,'pendulum')]

def cards(b,p,scale=1):
    x,y,z=p
    for i,which in [(-1,'spade'),(0,'heart'),(1,'diamond')]:
        card=Builder('playing_card')
        card.box((0,0,0),(.237,.044,.40),'gold')
        card.box((0,-.026,0),(.220,.018,.383),'ivory')
        if which=='diamond':
            card.xz_shape([(0,.08),(.048,0),(0,-.08),(-.048,0)],(0,-.044,0),.012,'red')
            card.xz_shape([(0,.022),(.013,0),(0,-.022),(-.013,0)],(-.080,-.044,.138),.012,'red')
        else:
            card_symbol(card,which,(0,-.044,0),.067)
            card_symbol(card,which,(-.080,-.044,.138),.018)
        b.merge(card,Matrix.Translation(Vector((x+i*.183*scale,y+abs(i)*.023,z-abs(i)*.031))) @ Matrix.Rotation(i*math.radians(18),4,'Y') @ Matrix.Scale(scale,4))

def card_house(kit):
    b=Builder(kit+'_card_pavilion');base(b)
    if kit=='compact':
        b.cylinder((0,.03,.17),.365,.16,'purple',32)
        b.cylinder((0,.03,.397),.337,.30,'petrol',32)
        for i in range(10):
            a=i*math.tau/10
            b.rod((.339*math.cos(a),.03+.339*math.sin(a),.23),(.339*math.cos(a),.03+.339*math.sin(a),.56),.019,'gold',8)
        b.cylinder((0,.03,.564),.392,.060,'purple',40)
        barrel_roof(b,(0,.035,.61),.72,.52,.20,'purple_light')
        cards(b,(0,.05,1.025))
        for i in range(9):
            x=-.36+i*.09
            b.box((x,-.314,.617),(.089,.175,.054),'ivory' if i%2==0 else 'purple_light')
            b.sphere((x,-.4,.605),(.044,.035,.045),'ivory' if i%2==0 else 'purple_light',12,8)
        b.box((0,-.328,.789),(.48,.053,.13),'gold')
        b.box((0,-.361,.789),(.45,.024,.108),'navy')
        for x in [-.17,-.085,0,.085,.17]:b.sphere((x,-.382,.807),(.014,.010,.014),'glow',10,6)
        card_symbol(b,'heart',(0,-.397,.754),.027)
        for x in [-.19,.19]:
            b.box((x,-.265,.345),(.1,.09,.18),'purple')
            b.box((x,-.318,.38),(.08,.021,.085),'water')
            for xx in [-.023,.023]:b.sphere((x+xx,-.33,.30),(.01,.007,.01),'gold',10,6)
        b.door(0,-.319,.362,.115,.25)
        for x in [-.43,.43]:topiary(b,x,-.32)
    else:
        b.box((0,.11,.39),(.69,.57,.60),'ivory')
        arch(b,0,-.207,.13,.42,.48,.08,'gold')
        arch(b,0,-.254,.14,.35,.43,.025,'dark')
        for side in [-1,1]:
            vs=[];rows=9;cols=8
            for j in range(rows):
                t=j/(rows-1);z=.15+t*.39
                inner=.095+.037*math.sin(t*math.pi);outer=.175
                for k in range(cols):
                    u=k/(cols-1);xx=side*(inner+(outer-inner)*u)
                    vs.append((xx,-.292-.012*math.sin(u*math.pi*6),z))
            fs=[(j*cols+k,j*cols+k+1,(j+1)*cols+k+1,(j+1)*cols+k) for j in range(rows-1) for k in range(cols-1)]
            if side<0:fs=[tuple(reversed(f)) for f in fs]
            b.poly(vs,fs,'red',True)
            b.rod((side*.12,-.306,.35),(side*.174,-.306,.35),.009,'gold',8)
            for yy in [.05,.25]:
                pane=Builder('theatre_side_window');arch_window(pane,0,0,0,.105,.30)
                b.merge(pane,Matrix.Translation(Vector((side*.352,yy,.24))) @ Matrix.Rotation(side*math.pi/2,4,'Z'))
            b.box((side*.354,.11,.67),(.02,.57,.039),'purple')
        for x in [-.34,.34]:
            b.cylinder((x,-.15,.43),.093,.65,'orange',24)
            for z in [.14,.69]:b.cylinder((x,-.15,z),.101,.034,'gold',24)
            dome_custom(b,(x,-.15,.735),.096,.065,'purple')
            arch_window(b,x,-.247,.32,.065,.25)
        for i in range(4):
            arch(b,0,.02+i*.04,.57+i*.055,.63-i*.09,.30-i*.025,.11,'purple' if i%2==0 else 'gold')
        cards(b,(0,.12,1.10),1.05)
        b.box((0,-.315,.665),(.67,.18,.080),'gold')
        b.box((0,-.414,.665),(.62,.024,.063),'orange')
        for i in range(9):b.sphere((-.27+i*.0675,-.433,.665),(.018,.010,.018),'glow',12,7)
        b.stairs(0,-.37,.15,.40,4)
        for i in range(4):b.box((0,-.37-i*.035,.167-i*.012),(.30,.068,.01),'red')
        for x in [-.43,.43]:topiary(b,x,-.32,cone=True)
    return b,[]

def wheel(kit):
    b=Builder(kit+'_chance_wheel');base(b)
    cy=.085; cz=.905; radius=.40
    if kit=='compact':
        for x in [-.30,.30]:b.rod((x,.10,.15),(x*.60,.15,.91),.037,'navy',10)
        b.box((0,-.245,.245),(.48,.33,.30),'mint_light')
        b.box((0,-.42,.283),(.35,.023,.13),'petrol')
        for x in [-.22,.22]:b.column(x,-.41,.12,.32,.018)
        barrel_roof(b,(0,-.23,.44),.55,.36,.13,'ivory')
        for i in range(7):
            x=-.235+i*.0783;b.sphere((x,-.42,.447),(.039,.025,.035),'orange' if i%2 else 'mint_light',12,7)
        b.star((0,-.438,.193),.044,'gold')
        for x in [-.43,.43]:bollard(b,x,-.36);b.lamp(x,.31)
    else:
        b.cylinder((0,.075,.20),.30,.23,'water',32)
        for i in range(12):
            a=i*math.tau/12;b.rod((.30*math.cos(a),.075+.30*math.sin(a),.11),(.30*math.cos(a),.075+.30*math.sin(a),.34),.012,'gold',6)
        dome_custom(b,(0,.075,.35),.318,.13)
        for x in [-.38,.38]:
            b.cylinder((x,-.025,.23),.096,.28,'ivory',24)
            dome_custom(b,(x,-.025,.39),.108,.075)
            arch_window(b,x,-.126,.17,.051,.19)
            b.sphere((x,-.025,.494),(.024,.024,.03),'gold',12,8)
        b.stairs(0,-.3,.13,.28,4)
        orbit=Builder('orbital_rim');orbit.torus((0,0,0),.448,.013,'gold',axis='Z',n=64,m=8)
        transform=Matrix.Translation(Vector((0,.03,.91))) @ Matrix.Rotation(math.radians(30),4,'Y') @ Matrix.Rotation(math.radians(22),4,'X')
        b.merge(orbit,transform)
        for v in [Vector((.448,0,0)),Vector((-.448,0,0))]:b.sphere(transform@v,(.041,.041,.041),'gold',16,9)
        for x in [-.43,.43]:topiary(b,x,-.34,cone=True)
    rotor=Builder('life_'+kit+'_wheel_rotor')
    rotor.front_disc((0,cy,cz),radius,.074,'gold_dark',56)
    rotor.torus((0,cy-.049,cz),radius-.012,.022,'gold',n=64,m=8)
    palette=['orange','ivory','mint_light','mint','ivory','orange','mint_light','ivory','mint','orange','ivory','mint_light'] if kit=='compact' else ['navy','purple_light','navy','purple_light','ivory','navy','purple_light','navy','purple_light','ivory','navy','purple_light']
    for i,mat in enumerate(palette):
        a=i*math.tau/12; aa=(i+1)*math.tau/12
        pts=[(0,0)]+[(.363*math.cos(a+(aa-a)*j/5),.363*math.sin(a+(aa-a)*j/5)) for j in range(6)]
        rotor.xz_shape(pts,(0,cy-.051,cz),.018,mat)
        rotor.rod((0,cy-.07,cz),(.369*math.cos(a),cy-.07,cz+.369*math.sin(a)),.004,'gold',6)
        if kit=='expansion':rotor.star((.27*math.cos((a+aa)/2),cy-.074,cz+.27*math.sin((a+aa)/2)),.025,'gold',.011)
    for i in range(24):
        a=i*math.tau/24;rotor.sphere((.383*math.cos(a),cy-.075,cz+.383*math.sin(a)),(.009,.008,.009),'glow',10,6)
    rotor.front_disc((0,cy-.085,cz),.073,.036,'gold',30)
    if kit=='expansion':rotor.star((0,cy-.11,cz),.125,'gold',.024,n=8)
    b.star((0,cy-.087,1.335),.087,'gold',.035)
    b.rod((0,cy-.103,1.30),(0,cy-.103,1.225),.012,'gold',8)
    return b,[(rotor,(0,cy,cz),'wheel')]

def portal(kit):
    b=Builder(kit+'_teleport_gate');base(b)
    if kit=='compact':
        # A raised mooring dock over a turquoise harbour basin, not a bare slab.
        rounded_box(b,(0,0,.095),(.90,.89,.033),'water',.065)
        for j in range(8):b.box((.13,-.415+j*.111,.127),(.62,.100,.025),'wood')
        for j in range(5):b.box((-.30,-.09+j*.10,.129),(.22,.093,.026),'wood')
        x=-.285;y=.06
        b.cylinder((x,y,.19),.158,.19,'cream',32,r2=.14)
        for j in range(5):b.cylinder((x,y,.30+j*.136),.133-j*.008,.137,'ivory' if j%2==0 else 'mint',32,r2=.125-j*.008)
        for z in [.98,1.16]:b.cylinder((x,y,z),.148,.043,'navy',32)
        b.cylinder((x,y,1.073),.103,.16,'glow',24)
        for i in range(8):
            a=i*math.tau/8;b.rod((x+.109*math.cos(a),y+.109*math.sin(a),.99),(x+.109*math.cos(a),y+.109*math.sin(a),1.16),.006,'gold',6)
        dome_custom(b,(x,y,1.19),.15,.13,'orange')
        b.sphere((x,y,1.355),(.028,.028,.035),'red',14,8)
        arch_window(b,x,y-.136,.42,.066,.16)
        arch_window(b,x,y-.107,.74,.061,.135)
        arch(b,x,-.102,.13,.139,.235,.042,'ivory')
        arch(b,x,-.129,.145,.101,.19,.027,'petrol')
        b.rod((x,-.15,.16),(x,-.15,.30),.005,'gold',6)
        b.sphere((x+.028,-.155,.215),(.008,.007,.008),'gold',10,6)
        b.stairs(x,-.15,.15,.17,3)
        # Lighthouse gallery has actual railing and visible lamp framing.
        for i in range(12):
            a=i*math.tau/12;b.rod((x+.143*math.cos(a),y+.143*math.sin(a),.99),(x+.143*math.cos(a),y+.143*math.sin(a),1.048),.0045,'navy',6)
        b.torus((x,y,1.047),.143,.008,'navy',axis='Z',n=36,m=6)
        cx=.12;cz=.64
        b.torus((cx,.13,cz),.31,.062,'navy',n=56,m=10)
        b.torus((cx,.168,cz),.34,.029,'ivory',n=56,m=8)
        b.torus((cx,.108,cz),.26,.026,'cyan',n=48,m=8)
        b.torus((cx,.09,cz),.282,.017,'gold',n=48,m=8)
        for i in range(12):
            a=i*math.tau/12;b.sphere((cx+.31*math.cos(a),.065,cz+.31*math.sin(a)),(.018,.009,.018),'gold',12,7)
            b.rod((cx+.289*math.cos(a),.069,cz+.289*math.sin(a)),(cx+.345*math.cos(a),.073,cz+.345*math.sin(a)),.004,'cream',6)
        for side in [-1,1]:
            xx=cx+side*.23
            rounded_box(b,(xx,.13,.26),(.14,.20,.27),'navy',.025)
            b.box((xx,.018,.28),(.075,.019,.16),'gold')
        for xx in [-.07,.39]:
            bollard(b,xx,-.37,.13)
            b.lamp(xx,.31,.14)
        # Slack rope keeps the forward landing open, with a second side mooring.
        for i in range(12):
            t=i/12;tt=(i+1)/12
            b.rod((-.07+.46*t,-.37,.275-.038*math.sin(t*math.pi)),(-.07+.46*tt,-.37,.275-.038*math.sin(tt*math.pi)),.008,'cream',6)
        bollard(b,.39,-.10,.13)
        for i in range(8):
            t=i/8;tt=(i+1)/8;b.rod((.39,-.37+.27*t,.275-.027*math.sin(t*math.pi)),(.39,-.37+.27*tt,.275-.027*math.sin(tt*math.pi)),.008,'cream',6)
        # Low-poly rocks define the tide line without expensive sphere clusters.
        for xx,yy,rr in [(-.42,-.30,.052),(-.38,-.39,.057),(-.23,-.42,.050),(-.44,-.13,.050),(-.11,.40,.043)]:
            b.cylinder((xx,yy,.13),rr,.060,'concrete',7,r2=rr*.63)
        for xx,yy in [(-.36,-.44),(-.43,-.22),(-.25,-.37)]:b.torus((xx,yy,.115),.032,.004,'ivory',axis='Z',n=16,m=4,start=.3,end=2.5)
    else:
        cx=0;cz=.82;cy=.12
        b.torus((cx,cy,cz),.365,.070,'ivory',n=64,m=12)
        b.torus((cx,cy-.065,cz),.351,.014,'gold',n=64,m=8)
        b.torus((cx,cy-.025,cz),.292,.023,'cyan',n=56,m=8)
        for side in [-1,1]:
            b.xz_shape([(side*.20,.0),(side*.43,0),(side*.42,.62),(side*.31,.89),(side*.25,.71),(side*.32,.47)],(0,.12,.16),.24,'mint')
            b.box((side*.36,.12,.15),(.21,.31,.11),'gold')
            b.cylinder((side*.34,-.29,.255),.083,.28,'water',24)
            for i in range(8):
                a=i*math.tau/8;b.rod((side*.34+.084*math.cos(a),-.29+.084*math.sin(a),.12),(side*.34+.084*math.cos(a),-.29+.084*math.sin(a),.40),.006,'gold',6)
            dome_custom(b,(side*.34,-.29,.405),.091,.07)
            b.lamp(side*.43,-.40)
        for i in range(8):
            a=i*math.tau/8
            if math.sin(a)<-.7:continue
            p=(.365*math.cos(a),cy-.026,cz+.365*math.sin(a))
            part=Builder('portal_key');part.box((0,0,0),(.085,.17,.112),'gold')
            b.merge(part,Matrix.Translation(Vector(p)) @ Matrix.Rotation(math.pi*.5-a,4,'Y'))
        # Walkable arched bridge enters the open ring; never fill the portal disc.
        for i in range(14):
            yy=-.41+i*.039;zz=.115+.25*math.sin((i/13)*math.pi*.5)
            b.box((0,yy,zz),(.25,.044,.028),'ivory')
            if i:
                prevy=-.41+(i-1)*.039;prevz=.115+.25*math.sin(((i-1)/13)*math.pi*.5)
                for xx in [-.13,.13]:b.rod((xx,prevy,prevz+.043),(xx,yy,zz+.043),.010,'gold',6)
    return b,[]

def train_stock(b,kit):
    if kit=='compact':
        b.box((0,.005,.25),(.33,.65,.12),'red')
        b.rod((0,-.28,.41),(0,.08,.41),.154,'orange',32)
        b.front_disc((0,-.303,.41),.149,.045,'cream',32)
        b.front_disc((0,-.334,.41),.108,.013,'gold',32)
        b.front_disc((0,-.349,.41),.046,.022,'glow',24)
        for yy in [-.22,-.04,.18]:
            for xx in [-.17,.17]:
                w=Builder('train_wheel');w.front_disc((0,0,0),.071,.032,'red',20);w.front_disc((0,-.023,0),.044,.015,'gold',20)
                b.merge(w,Matrix.Translation(Vector((xx,yy,.225))) @ Matrix.Rotation(math.pi/2 if xx>0 else -math.pi/2,4,'Z'))
        b.box((0,.20,.49),(.32,.26,.35),'red')
        for xx in [-.167,.167]:b.box((xx,.20,.54),(.014,.17,.16),'petrol')
        b.box((0,.059,.545),(.24,.017,.17),'petrol')
        curved_hip(b,(0,.20,.69),.39,.31,.055,'orange')
        b.cylinder((0,-.16,.61),.039,.15,'navy',20,r2=.048)
        b.cylinder((0,-.16,.70),.062,.035,'gold',24)
        b.xz_shape([(-.18,0),(.18,0),(.12,.09),(-.12,.09)],(0,-.40,.15),.07,'orange')
    else:
        # Curved tapered nose uses a continuous oval-section loft, not a box.
        ys=[-.43,-.39,-.32,-.22,-.09,.08,.28,.40]
        widths=[.035,.105,.15,.178,.185,.185,.182,.17]
        heights=[.06,.10,.15,.20,.23,.23,.23,.22]
        n=28;vs=[]
        for y,w,h in zip(ys,widths,heights):
            for i in range(n):
                a=i*math.tau/n;vs.append((w*math.cos(a),y,.31+h*math.sin(a)))
        faces=[]
        for j in range(len(ys)-1):
            for i in range(n):faces.append(((j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i))
        faces.extend([tuple(range(n)),tuple(range((len(ys)-1)*n,len(ys)*n))[::-1]])
        b.poly(vs,faces,'orange',True)
        def surface(y,a,lift=.005):
            for j in range(len(ys)-1):
                if ys[j]<=y<=ys[j+1]:
                    t=(y-ys[j])/(ys[j+1]-ys[j]);w=widths[j]*(1-t)+widths[j+1]*t;h=heights[j]*(1-t)+heights[j+1]*t
                    return ((w+lift)*math.cos(a),y,.31+(h+lift)*math.sin(a))
            raise ValueError(y)
        def glass_panel(y1,y2,a1,a2,mat='petrol',lift=.005):
            verts=[surface(y1+(y2-y1)*j/5,a1+(a2-a1)*i/8,lift) for j in range(6) for i in range(9)]
            fs=[((j+1)*9+i,(j+1)*9+i+1,j*9+i+1,j*9+i) for j in range(5) for i in range(8)]
            b.poly(verts,fs,mat,True)
        # One continuous wrapped windshield follows the same nose loft exactly.
        glass_panel(-.30,-.08,.85,math.pi-.85)
        for yy in [.04,.20]:
            glass_panel(yy,yy+.115,.25,.72)
            glass_panel(yy,yy+.115,math.pi-.72,math.pi-.25)
        # Narrow inset headlights share the loft surface, so neither can sink
        # into the body or float away from the curved nose in an oblique view.
        for a1,a2 in [(.38,.79),(math.pi-.79,math.pi-.38)]:
            glass_panel(-.397,-.338,a1,a2,'gold',.008)
            glass_panel(-.389,-.346,a1+.09,a2-.09,'glow',.011)
        for j in range(18):
            a=j*math.pi/18;aa=(j+1)*math.pi/18
            b.rod((.139*math.cos(a),-.335-.096*math.sin(a),.253+.012*math.sin(a)),(.139*math.cos(aa),-.335-.096*math.sin(aa),.253+.012*math.sin(aa)),.016,'navy',8)
        for side in [-1,1]:
            b.rod((side*.10,-.33,.263),(side*.18,.37,.263),.014,'ivory',8)
        b.box((0,.04,.19),(.29,.65,.074),'navy')

def station(kit):
    b=Builder(kit+'_rush_station');base(b)
    for y in [-.42,-.32,-.22,-.12,-.02,.08,.18,.28,.38]:b.box((0,y,.103),(.47,.032,.020),'wood')
    for x in [-.143,.143]:b.box((x,-.01,.12),(.024,.91,.026),'steel')
    train_stock(b,kit)
    if kit=='compact':
        for x in [-.36,.36]:
            for y in [-.12,.34]:b.column(x,y,.12,.63,.029)
        barrel_roof(b,(0,.12,.79),.80,.60,.26,'mint_light',True)
        b.box((0,-.209,.795),(.50,.051,.08),'navy')
        for x in [-.19,-.095,0,.095,.19]:b.box((x,-.241,.798),(.046,.011,.029),'gold')
        clock_face(b,0,-.21,1.003,.073)
        for x in [-.43,.43]:b.lamp(x,-.39)
        b.box((-.34,.02,.22),(.095,.31,.06),'wood')
    else:
        for x in [-.34,.34]:
            b.box((x,.18,.37),(.13,.51,.53),'ivory')
            for yy in [.03,.22,.38]:
                w=Builder('station_side');arch_window(w,0,0,0,.11,.31)
                b.merge(w,Matrix.Translation(Vector((x+math.copysign(.073,x),yy,.22))) @ Matrix.Rotation(math.copysign(math.pi/2,x),4,'Z'))
        barrel_roof(b,(0,.13,.70),.83,.66,.30,'water',True)
        b.box((.40,-.18,.70),(.135,.18,1.17),'ivory')
        for z in [.14,1.17]:b.box((.40,-.18,z),(.17,.21,.047),'gold')
        b.box((.40,-.279,.68),(.030,.018,.66),'cyan')
        clock_face(b,.40,-.29,1.12,.086)
        dome_custom(b,(.40,-.18,1.225),.088,.095)
        b.sphere((.40,-.18,1.36),(.024,.024,.03),'gold',14,8)
        for x in [-.43,.43]:topiary(b,x,-.39,cone=True)
    return b,[]

FACTORIES=[civic,bank,crane,card_house,wheel,portal,station]

def finish(builder,parts):
    root=builder.finalize();root['asset_family']='map-specials';root['version']='concept-following-v1'
    for part,pivot,kind in parts:
        part.v=[tuple(Vector(v)-Vector(pivot)) for v in part.v]
        moving=part.finalize();moving.parent=root;moving.location=pivot
        moving['lifePart']=kind;moving['lifeAxis']='Z'
    return root

def export_kit(kit,roots):
    bpy.ops.object.select_all(action='DESELECT')
    manifest={'version':'concept-following-v1','source':'art/build_map_specials.py','concept':'art/map-specials/'+kit+'-concept.png','coordinates':{'blender_up':'Z','blender_front':'-Y','gltf_up':'Y','gltf_front':'+Z'},'assets':{},'parts':{}}
    total=0
    bpy.context.view_layer.update()
    for root in roots:
        verts=[];triangles=0;root.select_set(True)
        for ob in root.children_recursive:
            ob.select_set(True)
            if ob.type=='MESH':
                verts.extend(root.matrix_world.inverted()@ob.matrix_world@v.co for v in ob.data.vertices)
                ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
            if ob.get('lifePart'):manifest['parts'][ob.name]={'type':ob['lifePart'],'axis':'Z','pivot_blender':list(ob.location),'swing_radians':.13 if ob['lifePart']=='pendulum' else None}
        mins=[min(v[a] for v in verts) for a in range(3)];maxs=[max(v[a] for v in verts) for a in range(3)]
        dims=[round(maxs[i]-mins[i],5) for i in range(3)]
        assert dims[0]<=1.055 and dims[1]<=1.055,(root.name,dims)
        assert mins[2]>=-.001 and maxs[2]<=1.75,(root.name,mins,maxs)
        manifest['assets'][root.name]={'dimensions':dims,'bounds_min':mins,'bounds_max':maxs,'triangles':triangles,'root_translation':[0,0,0]};total+=triangles
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kit+'-specials.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    manifest['total_triangles']=total;manifest['glb_bytes']=(OUT/(kit+'-specials.glb')).stat().st_size
    (OUT/(kit+'-specials-manifest.json')).write_text(json.dumps(manifest,indent=2),encoding='utf8')
    print('MAP_KIT_EXPORTED',kit,json.dumps({'triangles':total,'bytes':manifest['glb_bytes']}),flush=True)

def studio(kit,roots):
    scene=bpy.context.scene;world=bpy.data.worlds.new(kit+' warm studio');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.79,.76,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
    groundmat=material(kit+' studio backdrop','E6DECD',.8)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.007));bpy.context.object.data.materials.append(groundmat)
    for name,loc,energy,size,col in [('Key',(-4,-5,8),950,5,(1,.93,.82)),('Fill',(5,-2,6),650,4,(.80,.91,1)),('Rim',(0,5,8),1050,4,(1,.97,.88))]:
        d=bpy.data.lights.new(kit+name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=col
        ob=bpy.data.objects.new(kit+name,d);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,.5))-ob.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new(kit+' camera');cam=bpy.data.objects.new(kit+' camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO'
    scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=True;scene.cycles.max_bounces=5
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.05
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    # First render individually at the exact same inspection angle as the concepts.
    for root in roots:
        for ob in root.children_recursive:ob.hide_render=True
    d.ortho_scale=1.95;cam.location=(2.7,-4.5,2.9);cam.rotation_euler=(Vector((0,0,.73))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=680;scene.render.resolution_y=740
    render=os.environ.get('MAP_SPECIALS_RENDER','1')!='0'
    render_names=set(filter(None,os.environ.get('MAP_SPECIALS_RENDER_NAMES','').split(',')))
    for root in roots:
        for ob in root.children_recursive:ob.hide_render=False
        if render and (not render_names or root.name in render_names):
            scene.render.filepath=str(PREVIEW/(root.name+'.png'));bpy.ops.render.render(write_still=True)
        for ob in root.children_recursive:ob.hide_render=True
    for i,root in enumerate(roots):
        row=0 if i<4 else 1;col=i if i<4 else i-4
        root.location=((col-(1.5 if row==0 else 1))*1.65,1.22 if row==0 else -1.2,0)
        for ob in root.children_recursive:ob.hide_render=False
    d.ortho_scale=7.2;cam.location=(1.1,-9.4,9.0);cam.rotation_euler=(Vector((0,0,.45))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=1800;scene.render.resolution_y=1280
    scene.render.filepath=str(PREVIEW/(kit+'-specials-contact-sheet.png'))
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kit+'-specials.blend')))
    if render:bpy.ops.render.render(write_still=True)
    print('MAP_KIT_COMPLETE',kit,flush=True)

for kit in ['compact','expansion']:
    if os.environ.get('MAP_SPECIALS_KIT') and os.environ['MAP_SPECIALS_KIT']!=kit:continue
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    roots=[]
    for factory in FACTORIES:
        builder,parts=factory(kit);roots.append(finish(builder,parts));print('MAP_ASSET_BUILT',roots[-1].name,flush=True)
    export_kit(kit,roots);studio(kit,roots)
