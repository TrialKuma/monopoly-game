"""Authored French and Mediterranean architecture, based on the existing references.

No generated mesh is imported.  All elevations have physical window reveals,
closed ceramic/slate roofs, masonry joints, softened edges and useful silhouettes.
The public build(region, asset) entry returns a ground-centred Blender-Z-up root.
The production runner owns normalisation, local AO, export and provenance.
"""
from __future__ import annotations
import importlib.util
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('western_mesh_base',ROOT/'art/build_regional_city.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
PI=math.pi


class Mesh(base.Mesh):
    """Keep real silhouette bevels; tiny inset muntins do not need 44 triangles."""
    def box(self,p,size,material,rotate=0):
        x,y,z=p;a,b,c=(s/2 for s in size);co,si=math.cos(rotate),math.sin(rotate)
        corners=[(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]
        self.poly([(x+u*co-v*si,y+u*si+v*co,z+w) for u,v,w in corners],
                  [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],material,
                  bevel=min(size)>=.055 and max(size)>=.15)

    def sphere(self,p,size,material,sides=8,rings=4):
        x,y,z=p;sx,sy,sz=size
        v=[(x,y,z+sz)]+[(x+sx*math.sin(j*PI/rings)*math.cos(i*math.tau/sides),
             y+sy*math.sin(j*PI/rings)*math.sin(i*math.tau/sides),z+sz*math.cos(j*PI/rings))
             for j in range(1,rings) for i in range(sides)]+[(x,y,z-sz)]
        f=[(0,1+i,1+(i+1)%sides) for i in range(sides)]
        for j in range(rings-2):
            for i in range(sides):f.append((1+j*sides+i,1+(j+1)*sides+i,1+(j+1)*sides+(i+1)%sides,1+j*sides+(i+1)%sides))
        last=1+(rings-2)*sides
        f += [(len(v)-1,last+(i+1)%sides,last+i) for i in range(sides)]
        self.poly(v,f,material,True)

    def arch(self,x,y,z,width,height,material,depth=.018):
        # Glazing and reveal layers are enclosed by the actual stone frame;
        # hidden bevel strips on these filled silhouettes serve no visual role.
        r=width/2;rise=min(r,height*.42);spring=height-rise
        points=[(-r,0),(r,0),(r,spring)]+[(r*math.cos(i*PI/8),spring+rise*math.sin(i*PI/8)) for i in range(1,9)]
        self.xz_shape(points,(x,y,z),depth,material,False)


def materials(region):
    palette=dict(base.PALETTES[region])
    palette.update({'wall':'EEE0C5' if region=='classic' else 'F2E4C8',
                    'stone':'C4B499' if region=='classic' else 'D6BF95',
                    'trim':'F3E4C7','roof':'44556B' if region=='classic' else '277D91',
                    'roof_edge':'5A6A7D' if region=='classic' else '438F9D',
                    'wood':'3F574A' if region=='classic' else '885E37',
                    'wood_light':'B98C50','accent':'546E61' if region=='classic' else '2D6D98',
                    'recess':'283C3E','glass':'E8BC73','metal':'36433E',
                    'leaf':'4B7445','flower':'D98486','water':'60B2BC',
                    'gold':'BD9242','terracotta':'B86B3F','petal':'F0E9C8','leaf_light':'829B52'})
    result={}
    for key,code in palette.items():
        rgb=tuple(base.linear(int(code[i:i+2],16)/255) for i in (0,2,4))
        m=bpy.data.materials.new(f'{region}/{key}');m.diffuse_color=(*rgb,1);m.use_nodes=True
        sh=m.node_tree.nodes.get('Principled BSDF');sh.inputs['Base Color'].default_value=(*rgb,1)
        sh.inputs['Roughness'].default_value=.78 if key in ('wall','stone','trim') else .43 if key in ('roof','roof_edge','glass') else .60
        sh.inputs['Metallic'].default_value=.35 if key=='gold' else .20 if key=='metal' else 0
        if key=='glass':sh.inputs['Emission Color'].default_value=(*rgb,1);sh.inputs['Emission Strength'].default_value=.025
        result[key]=m
    return result


def ring(b,x,y,z,r,thickness,material='gold',segments=24):
    """Ring facing forward; actual hole, no stacked disks pretending to be a rim."""
    cross=4 if thickness<.018 else 6;vv=[]
    for i in range(segments):
        a=i*math.tau/segments
        for j in range(cross):
            t=j*math.tau/cross;rr=r+thickness*math.cos(t)
            vv.append((x+rr*math.cos(a),y+thickness*math.sin(t),z+rr*math.sin(a)))
    ff=[(i*cross+j,((i+1)%segments)*cross+j,((i+1)%segments)*cross+(j+1)%cross,i*cross+(j+1)%cross) for i in range(segments) for j in range(cross)]
    b.poly(vv,ff,material,True)


def arch_ring(b,x,y,z,w,h,t=.055,depth=.07,material='stone',joints=True):
    r=w/2;spring=h-r
    for side in (-1,1):
        b.box((x+side*(r+t/2),y,z+spring/2),(t,depth,spring),material)
    count=9 if joints else 8
    for i in range(count):
        gap=.011 if joints else 0;a=i*PI/count+gap;c=(i+1)*PI/count-gap
        pts=[(r*math.cos(a),spring+r*math.sin(a)),((r+t)*math.cos(a),spring+(r+t)*math.sin(a)),
             ((r+t)*math.cos(c),spring+(r+t)*math.sin(c)),(r*math.cos(c),spring+r*math.sin(c))]
        b.xz_shape(pts,(x,y,z),depth,material,False)


def pane(b,x,y,z,w,h,arched=True,shutters=False,flowers=False,bars=False):
    # Three distinct depths: dark reveal, recessed glazing, raised clean frame.
    if arched:
        b.arch(x,y-.018,z-.025,w+.12,h+.08,'recess',.055)
        b.arch(x,y-.056,z,w,h,'glass',.025)
        arch_ring(b,x,y-.064,z,w,h,.055,.075,'stone')
        arch_ring(b,x,y-.087,z+.008,w-.038,h-.026,.019,.037,'wood',False)
    else:
        b.box((x,y-.017,z+h/2),(w+.13,.055,h+.14),'recess')
        b.box((x,y-.052,z+h/2),(w,.022,h),'glass')
        for xx in (x-w/2-.034,x+w/2+.034):b.box((xx,y-.071,z+h/2),(.055,.075,h+.10),'trim')
        for zz in (z-.03,z+h+.03):b.box((x,y-.071,zz),(w+.16,.075,.055),'trim')
    b.box((x,y-.088,z+h*.46),(.025,.036,h*.90),'wood')
    for ratio in (.34,.68):b.box((x,y-.089,z+h*ratio),(w-.025,.037,.024),'wood')
    b.box((x,y-.075,z-.058),(w+.19,.16,.065),'trim')
    b.box((x,y-.075,z-.095),(w+.10,.11,.028),'stone')
    if not arched:
        # French sculpted lintel, intentionally shallow enough to read at mobile scale.
        b.xz_shape([(-w*.62,0),(0,.065),(w*.62,0),(w*.62,-.035),(-w*.62,-.035)],(x,y-.071,z+h+.07),.09,'trim')
        b.xz_shape([(-.045,-.038),(.045,-.038),(.055,.057),(-.055,.057)],(x,y-.125,z+h+.055),.025,'stone')
    if shutters:
        sw=w*.31
        for sign in (-1,1):
            xx=x+sign*(w/2+sw/2+.10)
            b.box((xx,y-.034,z+h*.49),(sw,.054,h+.035),'accent')
            for k in range(7):b.box((xx,y-.066,z+.06+k*(h-.10)/7),(sw-.025,.023,.020),'accent')
            for zz in (z+.075,z+h-.07):b.box((xx,y-.081,zz),(sw+.014,.018,.027),'wood' if b.name.startswith('classic') else 'roof_edge')
            for dx in (-sw*.35,sw*.35):b.box((xx+dx,y-.070,z+h*.5),(.017,.022,h+.028),'accent')
    if bars:
        for dx in (-w*.30,0,w*.30):b.rod((x+dx,y-.125,z+.025),(x+dx,y-.125,z+h*.80),.012,'metal')
        for zz in (z+.08,z+h*.67):b.rod((x-w*.42,y-.127,zz),(x+w*.42,y-.127,zz),.012,'metal')
    if flowers:flower_box(b,x,y-.16,z-.025,w*.85)


def door(b,x,y,z=.16,w=.51,h=.83,region='classic',double=False):
    b.arch(x,y-.014,z,w+.14,h+.10,'recess',.06)
    b.arch(x,y-.055,z+.015,w,h,'wood' if region=='classic' else 'accent',.035)
    arch_ring(b,x,y-.068,z,w,h,.075,.13,'trim')
    top=h-w/2
    b.arch(x,y-.085,z+top-.065,w-.075,w*.5+.026,'glass',.021)
    for k in (-1,0,1):
        end=(x+k*w*.35,y-.114,z+h-.035 if k==0 else z+top+.04)
        b.rod((x,y-.112,z+top-.04),end,.017,'wood' if region=='classic' else 'accent')
    for dx in (-w*.24,w*.24):
        b.box((x+dx,y-.083,z+top*.45),(w*.38,.029,top*.66),'accent' if region=='classic' else 'wood')
        b.box((x+dx,y-.103,z+top*.45),(w*.29,.017,top*.55),'wood' if region=='classic' else 'accent')
    b.box((x,y-.109,z+top*.46),(.028,.025,top*.89),'wood' if region=='classic' else 'accent')
    for dx in (-w*.09,w*.09) if double else (w*.30,):
        b.sphere((x+dx,y-.14,z+h*.39),(.025,.018,.025),'gold',10,5)
        if region=='harbor':ring(b,x+dx,y-.15,z+h*.35,.039,.008,'gold',14)
    for step in range(2):
        b.box((x,y-.13-step*.065,z-.045-step*.05),(w+.23+step*.13,.24+step*.13,.07),'trim')


def leaf(b,p,angle,size=.10,material='leaf'):
    x,y,z=p;dx=math.cos(angle)*size;dy=math.sin(angle)*size
    nx=-math.sin(angle)*size*.37;ny=math.cos(angle)*size*.37
    vv=[(x,y,z),(x+dx*.55+nx,y+dy*.55+ny,z+size*.33),(x+dx,y+dy,z+size*.45),
        (x+dx*.55-nx,y+dy*.55-ny,z+size*.33),(x+dx*.48,y+dy*.48,z+size*.54)]
    b.poly(vv,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],material,True)


def blossom(b,x,y,z,s=.025):
    for k in range(5):
        a=k*math.tau/5;b.sphere((x+math.cos(a)*s*.8,y+math.sin(a)*s*.8,z),(s*.7,s*.7,s*.45),'petal' if k%2 else 'flower',5,2)
    b.sphere((x,y,z+s*.25),(s*.38,s*.38,s*.36),'gold',5,2)


def plant(b,x,y,z=.14,s=.15,tall=False):
    b.cylinder((x,y,z+s*.50),s*.68,s,'terracotta',16,top=s*.87)
    b.cylinder((x,y,z+s*1.03),s*.93,s*.17,'trim' if tall else 'terracotta',16)
    b.cylinder((x,y,z+s*1.12),s*.77,.013,'recess',16)
    if tall:
        for k in range(4):b.sphere((x,y,z+s*(1.5+k*.65)),(s*(1.0-k*.15),s*(1.0-k*.15),s*.72),'leaf' if k%2 else 'leaf_light',10,5)
    else:
        for k in range(11):
            a=k*2.399;leaf(b,(x+math.cos(a)*s*.22,y+math.sin(a)*s*.22,z+s*(1.15+(k%3)*.16)),a,s*.95,'leaf' if k%3 else 'leaf_light')
        for k in range(3):
            a=k*math.tau/3;blossom(b,x+math.cos(a)*s*.48,y+math.sin(a)*s*.48,z+s*1.91,s*.20)


def flower_box(b,x,y,z,w):
    b.box((x,y,z),(w,.13,.10),'terracotta');b.box((x,y-.016,z+.05),(w+.035,.15,.027),'trim')
    count=min(6,max(3,round(w/.14)))
    for k in range(count):
        xx=x-w*.42+k*w*.84/(count-1)
        leaf(b,(xx,y,z+.06),-PI*.5,.11,'leaf');leaf(b,(xx,y,z+.06),PI*.35,.085,'leaf_light')
        blossom(b,xx,y-.025,z+.13,.023)


def iron(b,x,y,z,w,flowers=False,depth=.26):
    b.box((x,y-depth/2,z),(w+.10,depth,.065),'trim')
    for zz,r in ((z+.065,.013),(z+.28,.018)):
        b.rod((x-w/2,y-depth,zz),(x+w/2,y-depth,zz),r,'metal',8)
    count=max(4,round(w/.10))
    for k in range(count+1):
        xx=x-w/2+k*w/count;b.rod((xx,y-depth,z+.055),(xx,y-depth,z+.28),.011,'metal',6)
        if k<count and k%2==0:
            # Small forged curls: continuous open loops rather than random blobs.
            ring(b,xx+w/count/2,y-depth,z+.17,min(.032,w/count*.29),.006,'metal',8)
    for sign in (-1,1):
        xx=x+sign*w/2;b.rod((xx,y-depth,z+.28),(xx,y,z+.28),.014,'metal',8)
        b.box((xx,y-depth*.45,z-.065),(.07,.14,.11),'stone')
    if flowers:flower_box(b,x,y-depth-.015,z+.23,w*.71)


def lantern(b,x,y,z):
    b.box((x,y-.015,z+.09),(.055,.05,.19),'metal')
    b.rod((x,y-.03,z+.16),(x,y-.15,z+.22),.015,'metal')
    b.box((x,y-.15,z),(.11,.10,.16),'glass')
    for dx in (-.055,.055):
        for dy in (-.05,.05):b.rod((x+dx,y-.15+dy,z-.085),(x+dx*.80,y-.15+dy*.80,z+.085),.010,'metal')
    b.cylinder((x,y-.15,z+.11),.10,.06,'metal',8,top=.035)
    b.cylinder((x,y-.15,z-.10),.065,.035,'gold',8)


def masonry(b,w,d,z,h):
    for angle,span,depth in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
        with b.facing(angle):
            for row in range(2):
                n=max(4,round(span/.26));cell=span/n
                for i in range(n):b.box((-span/2+(i+.5)*cell,-depth/2-.016,z+(row+.5)*h/2),(cell-.012,.06,h/2-.012),'stone')


def foundation(b,w,d):
    b.box((0,0,.07),(w+.15,d+.16,.14),'stone')
    b.box((0,0,.145),(w+.18,d+.18,.045),'trim')


def cornice(b,w,d,z,classic=True):
    for dz,ext,th in ((-.09,.045,.07),(-.025,.11,.065),(.027,.17,.042)):
        b.box((0,0,z+dz),(w+ext,d+ext,th),'trim' if dz!=-.09 else 'stone')
    for angle,span,depth in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
        with b.facing(angle):
            n=max(5,round(span/.20))
            for i in range(n):b.box((-span*.45+i*span*.90/(n-1),-depth/2-.038,z-.126),(.065,.11,.082),'trim' if classic else 'wood')


def roof_tile(b,a,c,aa,cc,row,rows,col,cols,curved):
    # Clip a fixed-width tile against the *entire* trapezoidal roof face. The
    # old two-endpoint test discarded a tile whenever its upper end narrowed
    # to a point, leaving stair-step holes beside every hip. Its curved profile
    # also shrank with the clipped end and twisted whole tile columns.
    t0=row/rows;t1=min(1,(row+1.08)/rows)
    direction=(c-a).normalized();width=(c-a).length;cell=width/cols
    left_delta=(aa-a).dot(direction);right_delta=(cc-c).dot(direction)
    fall=(aa-a)-direction*left_delta;normal=direction.cross(fall).normalized()
    if normal.z<0:normal=-normal
    x0=col*cell+.0015;x1=(col+1)*cell-.0015
    def clip(points,distance):
        result=[]
        for p,q in zip(points,points[1:]+points[:1]):
            dp,dq=distance(p),distance(q)
            if dp>=-1e-9:result.append(p)
            if (dp<0)!=(dq<0):
                f=dp/(dp-dq);result.append((p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f))
        return result
    vv=[];top=[];lookup={};edges={};segments=4 if curved else 1
    def vertex(point):
        # Merge the coincident intersections produced at a strip/hip corner
        # before Blender's float32 storage turns a near-zero edge into a point.
        key=tuple(round(v,7) for v in point)
        if key not in lookup:
            x,t=point;frac=(x-col*cell)/cell
            bulge=math.sin(frac*PI)*min(.032,cell*.22) if curved else 0
            p=a+direction*x+fall*t+normal*(.012+bulge+.008*(1-(t-t0)/(t1-t0)))
            lookup[key]=len(vv);vv.append(tuple(p))
        return lookup[key]
    for k in range(segments):
        lo=x0+(x1-x0)*k/segments;hi=x0+(x1-x0)*(k+1)/segments
        polygon=[(lo,t0),(hi,t0),(hi,t1),(lo,t1)]
        polygon=clip(polygon,lambda p:p[0]-left_delta*p[1])
        polygon=clip(polygon,lambda p:width+right_delta*p[1]-p[0])
        if len(polygon)<3:continue
        face=list(dict.fromkeys(vertex(p) for p in polygon))
        if len(face)<3:continue
        cross=(Vector(vv[face[1]])-Vector(vv[face[0]])).cross(Vector(vv[face[2]])-Vector(vv[face[0]]))
        if cross.length<1e-10:continue
        if cross.dot(normal)<0:face.reverse()
        top.append(tuple(face))
        for u,v in zip(face,face[1:]+face[:1]):
            key=tuple(sorted((u,v)));edges[key]=None if key in edges else (u,v)
    if not top:return
    count=len(vv);vv += [tuple(Vector(p)-normal*.009) for p in vv]
    sides=[(u,v,v+count,u+count) for edge in edges.values() if edge for u,v in [edge] if (Vector(vv[u])-Vector(vv[v])).length>1e-6]
    sides += [tuple(v+count for v in reversed(face)) for face in top]
    b.poly(vv,top,'roof',curved);b.poly(vv,sides,'roof',False)


def seated_ridge(b,start,end,width=.050,height=.016):
    """A low ceramic saddle, rather than a thin round pole over the roof."""
    start,end=Vector(start),Vector(end);axis=(end-start).normalized()
    across=axis.cross(Vector((0,0,1))).normalized();up=across.cross(axis).normalized()
    if up.z<0:up=-up
    steps=8;profile=[(-width+2*width*i/steps,height*math.sin(PI*i/steps)) for i in range(steps+1)]
    profile += [(width,-.009),(-width,-.009)]
    n=len(profile);vv=[tuple(p+across*x+up*z) for p in (start,end) for x,z in profile]
    b.poly(vv,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'roof',True)
    b.poly(vv,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))],'roof',False)


def hip(b,w,d,z,h,region='classic',dormers=0):
    classic=region=='classic';topw=w*.54 if classic else max(.06,w-d)*.5;topd=d*.46 if classic else .045
    low=[Vector((sx*w/2,sy*d/2,z)) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    high=[Vector((sx*topw/2,sy*topd/2,z+h)) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    vv=[tuple(p) for p in low+high];b.poly(vv,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],'roof')
    for side in range(4):
        a,c=low[side],low[(side+1)%4];aa,cc=high[side],high[(side+1)%4]
        cols=max(4,round((c-a).length/getattr(b,'roof_pitch',.19)));rows=max(4,round(h/.115)) if classic else 5
        for row in range(rows):
            for col in range(cols):roof_tile(b,a,c,aa,cc,row,rows,col,cols,not classic)
        seated_ridge(b,a+Vector((0,0,.030)),aa+Vector((0,0,.030)),.037 if classic else .055,.012 if classic else .018)
    if classic:
        b.box((0,0,z+h+.015),(topw+.025,topd+.025,.035),'roof_edge')
        for k in range(max(3,round(topw/.15))):
            xx=-topw/2+(k+.5)*topw/max(3,round(topw/.15));b.rod((xx,-topd/2,z+h+.04),(xx,topd/2,z+h+.04),.012,'roof')
    else:
        seated_ridge(b,(-topw/2,0,z+h+.032),(topw/2,0,z+h+.032),.061,.021)
    b.box((0,0,z-.027),(w+.04,d+.04,.06),'trim' if classic else 'wood_light')
    if dormers:
        for side_index,angle in enumerate((0,PI)):
            with b.facing(angle):
                count=dormers[side_index] if isinstance(dormers,tuple) else dormers
                for i in range(count):
                    xx=(i-(count-1)/2)*w/(count+1)
                    dormer(b,xx,-d*.39,z+.12,.39,.54)


def dormer(b,x,y,z,w=.38,h=.52):
    b.arch(x,y+.08,z-.045,w+.18,h+.14,'wall',.30)
    pane(b,x,y-.077,z,w,h,True,False)
    arch_ring(b,x,y-.085,z-.016,w+.14,h+.09,.035,.13,'trim',False)
    # Curved cap follows the solid arched dormer rather than leaving an open arch.
    arch_ring(b,x,y+.07,z-.02,w+.18,h+.14,.029,.34,'roof',False)


def gable(b,w,d,z,h,region='harbor'):
    """Two closed roof prisms and an intact solid gable; no folded n-gon shell."""
    b.xz_shape([(-w/2+.07,0),(w/2-.07,0),(0,h-.04)],(0,0,z),d-.12,'wall',False)
    for side in (-1,1):
        a=Vector((side*w/2,-d/2,z));c=Vector((side*w/2,d/2,z));aa=Vector((0,-d/2,z+h));cc=Vector((0,d/2,z+h))
        top=[tuple(a),tuple(c),tuple(cc),tuple(aa)];vv=top+[(x,y,zz-.05) for x,y,zz in top]
        ff=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
        if side<0:ff=[tuple(reversed(f)) for f in ff]
        b.poly(vv,ff,'roof')
        cols=max(6,round(d/.18));rows=5
        for row in range(rows):
            for col in range(cols):roof_tile(b,a,c,aa,cc,row,rows,col,cols,True)
        # The rake belongs below the ceramic deck; its radius used to cross the
        # roof plane and expose intermittent timber dots through the tile edge.
        rake_drop=.050/math.cos(math.atan2(h,w/2))+.018
        for yy in (-d/2-.02,d/2+.02):b.rod((side*w/2,yy,z-rake_drop),(0,yy,z+h-rake_drop),.047,'wood_light',8)
        b.rod((side*w/2,-d/2,z-.068),(side*w/2,d/2,z-.068),.044,'wood',8)
    seated_ridge(b,(0,-d/2,z+h+.032),(0,d/2,z+h+.032),.061,.021)


def chimney(b,x,y,z,region='classic',h=.50):
    b.box((x,y,z+h/2),(.20,.23,h),'wall')
    for k in range(3):b.box((x,y-.12,z+.07+k*.12),(.205,.023,.012),'stone')
    b.box((x,y,z+h-.03),(.26,.29,.07),'trim')
    for xx in (-.054,.054):
        b.cylinder((x+xx,y,z+h+.065),.042,.16,'terracotta',12)
        b.cylinder((x+xx,y,z+h+.15),.048,.027,'terracotta',12)
        b.cylinder((x+xx,y,z+h+.165),.031,.008,'recess',12)


def dome(b,x,y,z,r,h,region='classic',glass=False):
    sides=32;rings=12;vv=[]
    def point(latitude,longitude,lift=0):
        normal=Vector((math.cos(latitude)*math.cos(longitude)/r,math.cos(latitude)*math.sin(longitude)/r,math.sin(latitude)/h)).normalized()
        return Vector((x+r*math.cos(latitude)*math.cos(longitude),y+r*math.cos(latitude)*math.sin(longitude),z+h*math.sin(latitude)))+normal*lift
    for j in range(rings):
        a=j*PI/(2*rings)
        for i in range(sides):
            vv.append(tuple(point(a,i*math.tau/sides)))
    vv.append((x,y,z+h));apex=len(vv)-1
    faces=[(j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i) for j in range(rings-1) for i in range(sides)]
    faces += [((rings-1)*sides+i,(rings-1)*sides+(i+1)%sides,apex) for i in range(sides)]
    b.poly(vv,faces,'water' if glass else 'roof',True)
    b.cylinder((x,y,z-.02),r*1.045,.075,'trim',32)
    # The old ribs were five separately capped chords cutting through the
    # curved shell. These continuous strips share the shell's latitude rings,
    # so they remain seated instead of appearing as broken black stitch marks.
    for i in range(8):
        a=i*math.tau/8;v=[];half=.015 if glass else .012
        for j in range(rings):
            latitude=j*PI/(2*rings)
            da=half/max(r*math.cos(latitude),.08)
            for k in range(5):
                f=k/4;v.append(tuple(point(latitude,a+(2*f-1)*da,.003+(.012 if glass else .007)*math.sin(PI*f))))
        f=[(j*5+k,j*5+k+1,(j+1)*5+k+1,(j+1)*5+k) for j in range(rings-1) for k in range(4)]
        b.poly(v,f,'gold' if glass else 'roof',True)
    # Horizontal hoops are structural glazing bars. Opaque ceramic domes need
    # only the broad meridians; tiny floating hoops created flickering scars.
    for j in ((6,) if getattr(b,'compact_dome',False) else (3,6,9)) if glass else ():
        a=j*PI/(2*rings);v=[]
        for i in range(sides):
            u=i*math.tau/sides
            for k in range(5):
                f=k/4;v.append(tuple(point(a+(2*f-1)*.012/max(h,.15),u,.004+.012*math.sin(PI*f))))
        f=[(i*5+k,((i+1)%sides)*5+k,((i+1)%sides)*5+k+1,i*5+k+1) for i in range(sides) for k in range(4)]
        b.poly(v,f,'gold',True)
    b.cylinder((x,y,z+h+.05),.026,.12,'gold',12,top=.012)
    b.sphere((x,y,z+h+.12),(.045,.045,.055),'gold',12,6)


def rounded_tower(b,x,y,z,r,h,floors,region='classic',roof=True,facings=(0,PI/2,PI,PI*1.5),window_height=None,window_width=.32,window_offset=.19,skip_windows=()):
    b.cylinder((x,y,z+h/2),r,h,'wall',32)
    for j in range(floors):
        bottom=z+j*h/floors
        b.cylinder((x,y,bottom+.03),r+.045,.065,'trim',32)
        for a in facings:
            if (j,a) in skip_windows:continue
            with b.at((x,y,0),a):pane(b,0,-r-.008,bottom+window_offset,window_width,min(.60,h/floors-.28) if window_height is None else window_height,True,False)
    b.cylinder((x,y,z+h-.025),r+.055,.09,'trim',32)
    if roof:dome(b,x,y,z+h+.04,r+.10,.47 if region=='classic' else .32,region)


def shell(b,w,d,floors,region,front='normal',balconies=False,columns=2,offset=0,sparse=False,hidden=(),omit_front=(),storey=1.0,compact_windows=False,omit_by_facing=None):
    h=floors*storey;top=.17+h
    foundation(b,w,d);b.box((0,0,.17+h/2),(w,d,h),'wall');masonry(b,w,d,.16,.23)
    for a,span,dep in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
        if a in hidden:continue
        with b.facing(a):
            for side in (-1,1):
                if getattr(b,'clean_facade',False):
                    # A shallow continuous corner return keeps the silhouette
                    # clean; stacked projecting blocks competed with the windows.
                    b.box((side*(span/2-.04),-dep/2-.006,.17+h/2),(.105,.045,h),'trim')
                else:
                    for j in range(max(4,round(h/getattr(b,'quoin_pitch',.22)))):
                        hh=h/max(4,round(h/getattr(b,'quoin_pitch',.22)));b.box((side*(span/2-.035),-dep/2-.022,.17+(j+.5)*hh),(.14,.085,hh-.014),'stone' if j%2 else 'trim')
            for floor in range(floors):
                z=.17+floor*storey
                if floor>0:b.box((0,-dep/2-.035,z-.025),(span+.13,.12,.07),'trim')
                if a==0 and floor==0 and front in ('shop','arcade','blank','offdoor','door'):continue
                if compact_windows and span<.9 and a==PI and floor==0:continue
                count=columns if a in (0,PI) else max(1,round(span/1.05))
                step=span/(count+.40)
                for k in range(count):
                    if a==0 and k in omit_front:continue
                    if omit_by_facing and k in omit_by_facing.get(a,()):continue
                    xx=(k-(count-1)/2)*step
                    window_w=.33 if count>2 else .41
                    if compact_windows:window_w=min(window_w,span*.42)
                    pane(b,xx,-dep/2,z+.18,window_w,.60*storey,region=='harbor',floor>0 and (not sparse or a==0) and not compact_windows,flowers=(floor>0 and (a==0 or a==PI and floor==floors-1) and not balconies and not sparse))
                    if balconies and floor>0 and (a==0 or not sparse and a==PI):iron(b,xx,-dep/2,z+.105,.53,a==0 and (floor==1 or not sparse))
            # A real rear entry distinguishes back from front with no plain wall.
            if a==PI:door(b,0 if compact_windows and span<.9 else span*.27,-dep/2,.16,.30 if compact_windows and span<.9 else .32,.66,region)
    cornice(b,w,d,top+.035,region=='classic')
    return top


def awning(b,x,y,z,w,color='accent',striped=True,depth=.41):
    n=max(6,round(w/.18));bw=w/n
    for i in range(n):
        xx=x-w/2+(i+.5)*bw;mat=color if not striped or i%2==0 else 'trim'
        verts=[(xx-bw/2,y,z),(xx+bw/2,y,z),(xx+bw/2,y-depth,z-.14),(xx-bw/2,y-depth,z-.14)]
        # Closed canvas thickness; no invisible back faces when seen from below.
        b.poly(verts+[(a,c,h-.015) for a,c,h in verts],[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat)
        points=[(-bw/2,.025),(bw/2,.025),(bw/2,-.035)]+[(bw/2*math.cos(k*PI/8),-.035-bw*.30*math.sin(k*PI/8)) for k in range(1,9)]
        b.xz_shape(points,(xx,y-depth-.009,z-.15),.024,mat)
    for sign in (-1,1):b.rod((x+sign*w*.44,y,z-.30),(x+sign*w*.44,y-depth,z-.15),.018,'metal')


def shopfront(b,w,d,region,level=1):
    y=-d/2-.02
    if region=='harbor' and level!=2:
        for xx in (-w*.30,w*.30):
            pane(b,xx,y,.40,w*.23,.68,True,False)
            crate(b,xx,y-.25,.16,w*.27)
            for i in range(4):b.sphere((xx-w*.09+i*w*.06,y-.30,.16+w*.27+.045),(.055,.045,.050),'terracotta' if i%2 else 'gold',8,3)
        door(b,0,y,.17,.43,.86,region,True);awning(b,0,y-.07,1.20,w+.03,'accent',True)
        for xx in (-w*.46,w*.46):lantern(b,xx,y,1.01);plant(b,xx,y-.29,.14,.15)
        return
    b.box((0,y,.66),(w-.10,.10,1.0),'accent')
    for xx in (-w*.29,w*.29):
        b.box((xx,y-.065,.64),(w*.31,.036,.69),'recess')
        b.box((xx,y-.088,.68),(w*.28,.025,.53),'glass')
        for z in (.39,.57,.78):
            b.box((xx,y-.113,z),(w*.29,.04,.021),'wood_light')
            for k in range(4):b.sphere((xx-w*.10+k*w*.067,y-.14,z+.045),(.045,.034,.032),'terracotta' if region=='classic' else 'gold',8,4)
        b.box((xx,y-.12,.24),(w*.32,.065,.13),'wood')
        b.box((xx,y-.157,.24),(w*.26,.018,.085),'accent')
    for xx in (-w*.45,-w*.12,w*.12,w*.45):
        b.box((xx,y-.12,.64),(.060,.08,.99),'accent');b.box((xx,y-.15,.18),(.095,.11,.10),'wood')
    door(b,0,y-.08,.17,.40,.78,region,True)
    b.box((0,y-.09,1.19),(w-.02,.11,.13),'accent')
    for xx in (-w*.38,w*.38):b.box((xx,y-.151,1.19),(.09,.014,.065),'gold')
    b.box((0,y-.151,1.19),(w*.60,.012,.012),'gold')
    awning(b,0,y-.10,1.13,w+.05,'accent',region=='harbor')
    lantern(b,-w*.48,y,1.00);lantern(b,w*.48,y,1.00)
    for xx in (-w*.42,w*.42):plant(b,xx,y-.30,.14,.14)


def arcade(b,w,y,z,count=3,h=.92,depth=.38):
    bay=w/count
    for i in range(count):
        xx=(i-(count-1)/2)*bay
        r=(bay-.16)/2;spring=h-r
        for k in range(10):
            a=k*PI/10;c=(k+1)*PI/10
            pts=[(r*math.cos(a),spring+r*math.sin(a)),((r+.08)*math.cos(a),spring+(r+.08)*math.sin(a)),
                 ((r+.08)*math.cos(c),spring+(r+.08)*math.sin(c)),(r*math.cos(c),spring+r*math.sin(c))]
            b.xz_shape(pts,(xx,y,z),depth,'trim',False)
    for i in range(count+1):
        x=-w/2+i*bay;spring=h-(bay-.16)/2
        b.box((x,y,z+spring/2),(.16,depth,spring),'trim')
        b.box((x,y,z+.055),(.22,depth+.04,.11),'stone')
        b.box((x,y,z+spring),(.23,depth+.05,.065),'trim')


def pergola(b,x,y,z,w,d,leg_bottom=None):
    bottom=z if leg_bottom is None else leg_bottom;leg_top=z+.66
    for xx in (-w*.44,w*.44):
        for yy in (-d*.43,d*.43):
            b.box((x+xx,y+yy,(bottom+leg_top)/2),(.075,.075,leg_top-bottom),'wood');b.box((x+xx,y+yy,z+.66),(.13,.13,.065),'wood_light')
    for yy in (-d*.43,d*.43):b.box((x,y+yy,z+.65),(w+.15,.08,.10),'wood')
    for i in range(7):b.box((x-w*.53+i*w*1.06/6,y,z+.73),(.054,d+.18,.07),'wood_light')
    for k in range(8):leaf(b,(x-w*.4+k*w*.8/7,y+d*.42,z+.78),-PI*.3,.15)


def roof_lantern(b,x,y,z,w,d,h,region,clock=False):
    """A legible elevated pavilion; four real openings and a complete roof."""
    with b.at((x,y,0)):
        b.box((0,0,z+.045),(w+.12,d+.12,.09),'trim')
        b.box((0,0,z+h*.50),(w,d,h),'wall')
        for a,span,depth in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
            with b.facing(a):
                pane(b,0,-depth/2-.012,z+.12,min(.44,span*.60),h-.20,True,False)
        if clock:
            base.clock_face(b,0,-d/2-.06,z+h*.56,min(w,h)*.24)
        hip(b,w+.17,d+.17,z+h+.03,.44 if region=='classic' else .31,region,0)


def chateau_spire(b,x,y,z,r,h):
    b.cylinder((x,y,z+h/2),r,h,'roof',24,top=.035)
    for i in range(10):
        a=i*math.tau/10
        b.rod((x+r*math.cos(a),y+r*math.sin(a),z+.015),
              (x+.035*math.cos(a),y+.035*math.sin(a),z+h),.010,'roof_edge',6)
    b.cylinder((x,y,z+h+.045),.025,.15,'gold',8)


def prestige_core(region,family,mats):
    """L3 changes the skyline, not just the count of identical storeys."""
    b=Mesh(f'{region}_{family}_3',mats);b.compact_dome=True;b.clean_facade=region=='harbor'
    w=2.50;d=1.70;y=-d/2
    storey=1.16;lift=3*(storey-1)
    turret_front=region=='classic' and family in ('villa','tower')
    top=shell(b,w,d,3,region,'shop' if family=='shop' else 'door',False,3,sparse=True,storey=storey,omit_front=(0,2) if turret_front else ())
    if family=='shop':shopfront(b,w,d,region,3)
    else:
        door(b,0,y,.16,.52,.88,region,True)
        if not turret_front:
            for xx in (-.74,.74):pane(b,xx,y,.37,.37,.63,region=='harbor',False)
        for xx in (-.40,.40):lantern(b,xx,y,.94)
    if region=='classic':
        if family=='villa':
            # Chateau residence: steep central roof framed by two proud turrets.
            hip(b,2.62,1.84,top+.08,.72,region,1)
            for xx in (-.91,.91):
                rounded_tower(b,xx,-.55,.17,.33,3.79+lift,3,region,False,(0,))
                chateau_spire(b,xx,-.55,3.925+lift,.43,.57)
            iron(b,0,y,.21+storey,1.18,True,.32)
            b.xz_shape([(-.59,0),(.59,0),(0,.27)],(0,y-.09,1.17),.26,'trim')
        elif family=='shop':
            # A roof-top winter market hall is a different shape to the L2 shop.
            b.box((0,0,top+.08),(2.64,1.85,.13),'trim')
            dome(b,0,.13,top+.13,.83,.61,region,True)
            roof_lantern(b,-.90,-.30,top+.10,.48,.58,.64,region,True)
            roof_lantern(b,.90,-.30,top+.10,.48,.58,.64,region)
            iron(b,0,y,top+.13,1.15,False,.27)
            for j in (1,2):iron(b,0,y,.22+j*storey,2.19,False,.26)
        elif family=='hotel':
            # Three distinct roof pavilions and a grand projecting porte-cochere.
            for xx in (-.86,.86):
                with b.at((xx,0,0)):hip(b,.92,1.86,top+.08,.64,region,1)
            b.box((0,0,top+.16),(1.02,1.28,.32),'wall')
            roof_lantern(b,0,0,top+.30,1.02,1.28,.72,region)
            for xx in (-.64,.64):b.cylinder((xx,y-.26,.70),.073,1.04,'trim',12)
            dome(b,0,y-.22,1.24,.76,.24,region,True)
            for j in (1,2):iron(b,0,y,.22+j*storey,2.20,False,.30)
        else:
            # The mansion gains an entire crown pavilion, with two copper cupolas.
            hip(b,2.64,1.86,top+.08,.58,region,1)
            roof_lantern(b,0,.13,top+.54,1.12,1.10,.75,region)
            for xx in (-.91,.91):
                rounded_tower(b,xx,y+.12,.17,.28,3.35+lift,3,region,False,(0,))
                dome(b,xx,y+.12,3.57+lift,.38,.46,region)
            for j in (1,2):iron(b,0,y,.22+j*storey,.94,True,.32)
        for xx in (-.87,.87):chimney(b,xx,.59,top+.38,region,.39)
    else:
        # Coastal L3 roofs use white stepped terraces and bright vaulted pavilions.
        b.box((0,0,top+.075),(2.65,1.84,.13),'trim')
        if family=='villa':
            roof_lantern(b,-.61,.20,top+.13,1.03,1.12,.63,region)
            rounded_tower(b,.77,.25,top+.14,.31,.43,1,region,False,(0,PI/2),window_height=.23,window_width=.18,window_offset=.10)
            dome(b,.77,.25,top+.60,.40,.40,region)
            pergola(b,.48,-.46,top+.14,1.08,.47)
            for j in (1,2):iron(b,0,y,.22+j*storey,2.16,False,.30)
        elif family=='shop':
            for xx in (-.87,.87):
                with b.at((xx,.08,0)):gable(b,.88,1.37,top+.10,.44,region)
            roof_lantern(b,0,.16,top+.13,.87,.96,.82,region,True)
            iron(b,0,y-.05,.20+2*storey,2.38,False,.28)
        elif family=='hotel':
            # An asymmetric double lookout replaces the former single tiny turret.
            with b.at((0,.10,0)):hip(b,2.55,1.25,top+.10,.42,region)
            for xx,extra in ((-.93,.35),(.93,.65)):
                outer=PI/2 if xx>0 else -PI/2
                rounded_tower(b,xx,-.39,2.18+lift,.32,1.55+extra,2,region,False,(0,outer),skip_windows=((0,0),(0,outer)))
                dome(b,xx,-.39,3.77+extra+lift,.42,.38,region)
        else:
            # A palatial round belvedere gives the mansion its own broad crown.
            rounded_tower(b,0,.14,top+.14,.61,.69,1,region,False)
            dome(b,0,.14,top+.88,.72,.59,region)
            for xx in (-.93,.93):
                with b.at((xx,.15,0)):hip(b,.57,1.16,top+.12,.36,region)
            iron(b,0,y-.08,.20+2*storey,2.34,False,.29)
            pergola(b,0,-.57,top+.15,1.30,.43)
    for xx in (-1.08,1.08):plant(b,xx,y-.17,.14,.14,True)
    for xx in (-w/2+.015,w/2-.015):b.rod((xx,d/2+.053,.20),(xx,d/2+.053,top-.04),.021,'metal',8)
    return b.finish(bevel=.007)


def bath_pool(b,x,y,w,d,z=.23,round_pool=False):
    """Broad visible water, a raised tiled coping and actual descending steps."""
    if round_pool:
        b.cylinder((x,y,z),w*.5,.20,'stone',32)
        b.cylinder((x,y,z+.11),w*.46,.05,'trim',32)
        b.cylinder((x,y,z+.14),w*.40,.018,'water',32)
    else:
        b.box((x,y,z),(w,d,.20),'stone')
        b.box((x,y,z+.11),(w-.11,d-.11,.025),'water')
        for xx in (-w/2,w/2):b.box((x+xx,y,z+.15),(.10,d+.08,.14),'trim')
        for yy in (-d/2,d/2):b.box((x,y+yy,z+.15),(w+.08,.10,.14),'trim')
        for k in range(3):b.box((x-w*.30+k*.11,y,z+.14-k*.025),(.11,d*.36,.045),'trim')
        # Two pale surface arcs break the flat-water/fountain reading at game size.
        for k in range(2):b.box((x+w*.13,y-.11+k*.19,z+.127),(w*.30,.018,.006),'petal')


def bath_complex(region,level,mats):
    if level==3:return grand_bath(region,mats)
    b=Mesh(f'{region}_onsen_{level}',mats);b.compact_dome=True
    foundation(b,5.55,2.26)
    # The resort buildings occupy the rear third, leaving the baths unroofed.
    central_h=[.96,1.35,2.00][level-1]
    for xx in (-1.91,1.91):
        with b.at((xx,.62,0)):
            top=shell(b,1.53,.98,1,region,'door',False,2,sparse=True)
            door(b,0,-.49,.17,.42,.84,region,True)
            hip(b,1.65,1.10,top+.05,.40,region,0)
    b.box((0,.65,.17+central_h/2),(2.22,.95,central_h),'wall')
    for xx in (-.76,0,.76):
        pane(b,xx,.163,.24,.46,min(1.46,central_h-.20),True,False)
    for xx in (-1.09,1.09):b.box((xx,.13,.17+central_h/2),(.12,.12,central_h),'trim')
    if level==1:
        with b.at((0,.65,0)):hip(b,2.34,1.08,.19+central_h,.43,region,0)
    elif region=='classic':
        dome(b,0,.65,.19+central_h,1.04,.66 if level==2 else .93,region,True)
        if level==3:
            for xx in (-1.91,1.91):roof_lantern(b,xx,.62,1.62,.65,.64,.62,region)
    else:
        with b.at((0,.65,0)):hip(b,2.34,1.08,.19+central_h,.35,region,0)
        if level==3:
            rounded_tower(b,0,.66,central_h+.49,.52,.59,1,region,False)
            dome(b,0,.66,central_h+1.13,.64,.58,region)
        else:dome(b,0,.66,central_h+.47,.63,.49,region)
    # Bath terraces: L1 one generous pool; L2 hot/cold split; L3 a resort circuit.
    bath_pool(b,0,-.58,2.42,1.00)
    if level>=2:
        for xx in (-2.02,2.02):bath_pool(b,xx,-.61,1.05,.91,.23,level==3)
    else:
        for xx in (-1.91,1.91):
            b.box((xx,-.47,.25),(.98,.38,.16),'wood_light')
            b.box((xx,-.47,.35),(.53,.31,.025),'petal')
    # Folded towels and bathing benches read as spa furnishings, not a bank fountain.
    for xx in (-1.36,1.36):
        b.box((xx,-.55,.28),(.22,.65,.16),'wood')
        for k in range(3):b.box((xx,-.72+k*.15,.38),(.20,.12,.045),'petal')
    for xx in (-2.61,2.61):plant(b,xx,-.13,.17,.14,True)
    for xx in (-.91,.91):lantern(b,xx,.12,.83)
    # The regional bath sign is a raised water-wave crest above the centre entry.
    for k in range(3):
        points=[(-.18,.00),(-.09,.035),(0,0),(.09,-.035),(.18,0)]
        for (x0,z0),(x1,z1) in zip(points,points[1:]):b.rod((x0,.12,.81+k*.12+z0),(x1,.12,.81+k*.12+z1),.025,'water',6)
    root=b.finish(bevel=.007)
    root['thermalPools']=[[0,-.58,.351,2.31,.89]]+([[xx,-.61,.37 if level==3 else .351,.84,.84 if level==3 else .80] for xx in (-2.02,2.02)] if level>=2 else [])
    return root


def oval_dome(b,x,y,z,rx,ry,h,region,glass=False):
    start=len(b.vertices);dome(b,x,y,z,rx,h,region,glass)
    # The rear bath house has a wide barrel-like crown within its shallow parcel.
    center_y=y+b.offset.y
    for i in range(start,len(b.vertices)):
        px,py,pz=b.vertices[i];b.vertices[i]=(px,center_y+(py-center_y)*ry/rx,pz)


def grand_bath(region,mats):
    b=Mesh(f'{region}_onsen_3',mats);b.compact_dome=True;b.roof_pitch=.25
    foundation(b,5.55,2.26)
    # The thermal hall is a single monumental vaulted space, not a small hotel.
    h=3.58;w=2.70;d=1.12;y=.54
    b.box((0,y,.17+h/2),(w,d,h),'wall')
    with b.at((0,y,0)):masonry(b,w,d,.17,.31)
    for a,span,depth in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
        with b.at((0,y,0),a):
            for xx in (-span*.39,span*.39):b.box((xx,-depth/2-.04,1.99),(.17,.15,3.64),'trim')
            count=3 if a in (0,PI) else 1
            for k in range(count):
                xx=(k-(count-1)/2)*.76
                pane(b,xx,-depth/2,.36,.50 if count==3 else .56,2.68,True,False)
            b.box((0,-depth/2-.05,3.41),(span+.12,.19,.16),'trim')
    with b.at((0,y,0)):cornice(b,w,d,3.79,region=='classic')
    oval_dome(b,0,y,3.84,1.47,.66,1.08,region,region=='classic')
    for xx in (-2.10,2.10):
        with b.at((xx,.54,0)):
            side=shell(b,1.20,1.05,1,region,'door',False,1,sparse=True)
            door(b,0,-.525,.17,.43,.83,region)
            hip(b,1.34,1.18,side+.07,.44,region,0)
        if region=='classic':roof_lantern(b,xx,.54,1.65,.58,.62,.56,region)
        else:pergola(b,xx,.54,1.66,.97,.75,leg_bottom=1.34)
    # Terraced thermal circuit: raised warm pool spills into the long lower pool.
    bath_pool(b,0,-.33,2.50,.43,.65)
    bath_pool(b,0,-.91,2.50,.43,.23)
    b.box((0,-.605,.56),(1.86,.032,.35),'water')
    for xx in (-2.05,2.05):bath_pool(b,xx,-.72,1.08,.97,.23,True)
    for xx in (-1.43,1.43):
        for k in range(4):b.box((xx,-.91+k*.16,.22+k*.14),(.28,.18,.16),'trim')
        b.box((xx,-.11,.89),(.21,.17,.05),'petal')
    for xx in (-2.65,2.65):plant(b,xx,-.19,.17,.13,True)
    for xx in (-.94,.94):lantern(b,xx,-.07,1.15)
    for k in range(3):
        for x0,x1,z0,z1 in ((-.27,-.135,0,.05),(-.135,0,.05,0),(0,.135,0,-.05),(.135,.27,-.05,0)):
            b.rod((x0,-.075,3.52+k*.10+z0),(x1,-.075,3.52+k*.10+z1),.022,'water',6)
    root=b.finish(bevel=.007)
    root['thermalPools']=[[0,-.33,.771,2.39,.32],[0,-.91,.351,2.39,.32],[-2.05,-.72,.37,.86,.86],[2.05,-.72,.37,.86,.86]]
    return root


def prestige_large(region,family,mats):
    b=Mesh(f'{region}_{family}_3',mats);b.compact_dome=True;b.roof_pitch=.28;b.quoin_pitch=.31;b.clean_facade=region=='harbor'
    foundation(b,5.60,2.24)
    if family=='skyscraper':
        # The central palace has five complete floors; the attached wings stop at two.
        with b.at((0,.11,0)):
            top=shell(b,2.82,1.76,5,region,'door',False,3,sparse=True,hidden=(PI/2,-PI/2))
            for a in (PI/2,-PI/2):
                with b.facing(a):
                    for j in (2,3,4):
                        for xx in (-.43,.43):pane(b,xx,-1.41,.35+j,.39,.65,region=='harbor',False)
        for xx in (-2.08,2.08):wide_block(b,xx,.11,1.32,1.76,2,region,False,True,omit_front_columns=(0,1) if region=='classic' else ())
        door(b,0,-.77,.17,.68,1.18,region,True)
        if region=='classic':
            hip(b,3.00,1.94,top+.08,.98,region,2)
            roof_lantern(b,0,.12,top+.88,1.48,1.15,.55,region)
            for xx in (-2.17,2.17):
                rounded_tower(b,xx,-.50,.17,.40,2.81,2,region,False,(0,PI/2 if xx>0 else -PI/2))
                chateau_spire(b,xx,-.50,3.00,.51,.73)
            iron(b,0,-.78,1.22,2.50,False,.27)
            oval_dome(b,0,-.88,1.49,.91,.45,.29,region,True)
        else:
            b.box((0,.11,top+.08),(2.98,1.93,.14),'trim')
            roof_lantern(b,0,.30,top+.15,1.75,1.30,.88,region)
            pergola(b,0,-.52,top+.14,2.11,.55)
            for xx,extra in ((-2.20,.0),(2.20,.38)):
                outer=PI/2 if xx>0 else -PI/2
                rounded_tower(b,xx,-.28,.17,.37,2.87+extra,3,region,False,(0,outer),skip_windows=tuple((j,a) for j in (0,1) for a in (0,outer)))
                dome(b,xx,-.28,3.08+extra,.48,.45,region)
    elif region=='classic':
        # A broad rotunda and a giant column portico dominate the stock exchange.
        top=wide_block(b,0,.10,2.78,1.78,3,region,False,False)
        for xx in (-2.08,2.08):wide_block(b,xx,.10,1.30,1.78,2,region,False,True)
        rounded_tower(b,0,.12,top+.05,1.10,1.40,1,region,False,tuple(i*math.tau/8 for i in range(8)),window_height=1.03)
        for a in (i*math.tau/8+math.pi/8 for i in range(8)):
            with b.at((0,.12,0),a):
                b.box((0,-1.105,top+.74),(.065,.065,1.24),'trim')
                b.box((0,-1.105,top+1.36),(.11,.09,.065),'trim')
        oval_dome(b,0,.12,top+1.51,1.30,1.03,1.23,region)
        for xx in (-1.05,-.63,.63,1.05):
            b.cylinder((xx,-.91,1.65),.085,2.96,'trim',16)
            b.box((xx,-.91,3.13),(.24,.25,.15),'trim')
        b.xz_shape([(-1.39,0),(1.39,0),(0,.63)],(0,-.88,3.23),.35,'trim')
        base.clock_face(b,0,-1.075,3.47,.25,coin=True)
        door(b,0,-.81,.17,.72,1.44,region,True)
        for k in range(3):b.box((0,-1.00-k*.06,.12-k*.025),(2.42+k*.08,.22,.08),'trim')
    else:
        # Maritime trading hall: a tall main hall with integrated arched windows.
        # No second colonnade is pasted across the existing shutters and frames.
        top=wide_block(b,0,.10,2.80,1.78,5,region,False,False)
        for a in (PI/2,-PI/2):
            with b.at((0,.10,0),a):
                for j in (1,2,3,4):
                    for xx in (-.43,.43):pane(b,xx,-1.40,.35+j,.39,.65,True,False)
        for xx in (-2.08,2.08):wide_block(b,xx,.10,1.30,1.78,1,region,False,True)
        hip(b,3.00,1.97,top+.08,.99,region,0)
        b.xz_shape([(-1.25,0),(-.87,.28),(-.60,.61),(0,1.02),(.60,.61),(.87,.28),(1.25,0)],(0,-.78,top-.01),.26,'wall')
        base.clock_face(b,0,-.94,top+.45,.31,coin=True)
        for xx in (-2.08,2.08):
            rounded_tower(b,xx,.11,1.65,.40,.90,1,region,False)
            dome(b,xx,.11,2.60,.51,.46,region)
        door(b,0,-.81,.17,.74,1.35,region,True)
        for xx in (-2.42,2.42):crate(b,xx,-1.00,.19,.29)
    plant_positions=(-2.61,2.61) if region=='harbor' and family=='skyscraper' else (-2.61,-1.28,1.28,2.61)
    for xx in plant_positions:plant(b,xx,-.97,.17,.14,True)
    return b.finish(bevel=.007)


def core(region,family,level,mats):
    if level==3:return prestige_core(region,family,mats)
    b=Mesh(f'{region}_{family}_{level}',mats)
    b.compact_dome=region=='harbor' and family=='hotel' and level==3
    w=2.18 if family in ('villa','shop') else 2.50;d=1.70 if family!='tower' else 1.90
    if region=='classic' and family in ('villa','shop') and level==3:w=2.54
    front='shop' if family=='shop' else 'offdoor' if family=='villa' and region=='classic' and level<3 else 'arcade' if family=='hotel' and region=='harbor' else 'door'
    cols=3 if region=='classic' and family in ('villa','shop') and level==3 else 2 if family in ('villa','shop') else 3
    # The reference's highest coastal residence retains only the central balcony;
    # its smaller villa grows two separate flower balconies.
    top=shell(b,w,d,level,region,front,False,cols,omit_front=(1,) if family=='tower' and region=='classic' else (),omit_by_facing={PI/2:(1,)} if family=='tower' and region=='harbor' and level==2 else None)
    y=-d/2
    if family=='shop':shopfront(b,w,d,region,level)
    elif family=='villa' and region=='classic' and level<3:
        door(b,-w*.23,y,.16,.43,.85,region);pane(b,w*.23,y,.40,.44,.62,False,True);lantern(b,.08,y,.84)
    else:
        door(b,0,y,.16,.48,.86,region,family!='villa')
        for xx in (-w*.33,w*.33):pane(b,xx,y,.37,.35,.61,region=='harbor',family=='villa')
        for xx in (-w*.21,w*.21):lantern(b,xx,y,.88)
    if family=='hotel' and region=='harbor':
        arcade(b,w+.10,y-.28,.17,3,1.0,.39)
        if level>1:iron(b,0,y-.02,1.21,w+.04,True,.43)
    elif family=='hotel':
        for xx in (-.31,.31):b.cylinder((xx,y-.21,.68),.047,1.01,'trim',14)
        if level==1:
            b.xz_shape([(-.46,0),(.46,0),(0,.19)],(0,y-.14,1.20),.36,'trim')
        else:dome(b,0,y-.13,1.20,.51,.16,region,True)
        if level==2:iron(b,0,y,1.25,.85,True,.35)
        if level==3:iron(b,0,y,1.24,w-.15,True,.34)
    if region=='classic':
        count=1 if level==1 and family!='tower' else 3 if family=='hotel' and level==3 else 2
        hip(b,w+.18,d+.18,top+.09,.64,region,count)
        if family=='tower':
            rounded_tower(b,0,y+.12,.17,.43,level+0.28,level,region,False,(0,))
            dome(b,0,y+.12,level+.49,.53,.67 if level==3 else .47,region)
            door(b,0,y-.32,.16,.43,.88,region,True)
            for j in range(1,level):iron(b,0,y-.33,.19+j,.76,True)
        if family=='villa' and level==3:
            for j in (1,2):iron(b,0,y,.22+j,.63,True)
        if family=='shop' and level==3:
            for j in (1,2):
                for xx in (-w*.29,0,w*.29):iron(b,xx,y,.22+j,.50,j==1)
            pane(b,0,y+.08,top+.16,.30,.38,False,False);iron(b,0,y+.08,top+.10,.75,True)
        chimney(b,-w*.34,d*.25,top+.42,region,.43)
        if family in ('hotel','tower') or level==3:chimney(b,w*.34,d*.25,top+.42,region,.43)
    else:
        if family=='tower' and level==1:
            b.box((0,0,top+.08),(w+.12,d+.12,.12),'trim')
            for xx in (-w*.48,w*.48):b.box((xx,0,top+.22),(.10,d,.24),'wall')
            pergola(b,0,.12,top+.13,w*.80,d*.67)
            for xx in (-w*.34,w*.34):plant(b,xx,-d*.25,top+.14,.16)
        elif family=='tower' and level>=2:
            if level==2:hip(b,w*.78,d*.61,top+.08,.45,region)
            else:
                b.box((0,0,top+.06),(w+.06,d+.06,.11),'trim')
                with b.at((-.77,.15,0)):hip(b,.92,d*.82,top+.08,.43,region)
            pergola(b,-.25,.30 if level==2 else -.28,top+.12,1.25,.90,leg_bottom=top+.07 if level==2 else None)
            rounded_tower(b,w*.43,.22,.17,.29,level+.54,level,region)
            for j in range(1,level):iron(b,0,y,.19+j,w*.78 if level==2 else .74,True,.30)
        else:
            hip(b,w+.20,d+.18,top+.08,.43,region)
            if family=='hotel' and level==2:
                rounded_tower(b,0,.20,top+.32,.26,.43,1,region,window_height=.23,window_width=.18,window_offset=.10)
            elif family=='hotel' and level==3:
                rounded_tower(b,w*.49,-.50,.17,.29,level+.72,level,region,True,(0,PI/2))
                for xx in (-w*.29,0,w*.29):iron(b,xx,y,2.23,.52,True)
            if family=='shop' and level==3:
                b.box((0,y+.11,top+.30),(.65,.54,.54),'wall');pane(b,0,y-.17,top+.12,.35,.45,True,False)
                with b.at((0,y+.11,0)):hip(b,.83,.67,top+.59,.22,region)
                iron(b,0,y-.18,top+.09,.89,True)
        chimney(b,w*.32,d*.23,top+.29,region,.43)
        if family=='villa' and level==2:iron(b,0,y,top-.93,.52,True)
        if family=='villa' and level==3:
            for j in (1,2):
                for xx in (-w*.208,w*.208):iron(b,xx,y,.23+j,.61,True)
    # The smallest buildings receive the same lamps, masonry, gutters and plants.
    for xx in (-w*.43,w*.43):plant(b,xx,y-.19,.14,.14,level>1 and family=='hotel')
    for xx in (-w/2+.015,w/2-.015):
        b.rod((xx,d/2+.053,.20),(xx,d/2+.053,top-.04),.021,'metal',8)
        b.rod((xx,d/2+.053,.20),(xx,d/2+.11,.16),.021,'metal',8)
    root=b.finish(bevel=.007);return root


def wide_block(b,x,y,w,d,floors,region,balconies=False,roof=True,omit_outer=False,omit_front_columns=()):
    with b.at((x,y,0)):
        # The side walls between joined wings are internal: no hidden windows,
        # flower boxes, bevelled quoins or ironwork are built into those seams.
        hidden=(PI/2,-PI/2) if abs(x)<.01 else (PI/2,) if x<0 else (-PI/2,)
        omit=(0,) if omit_outer and x<0 else (1,) if omit_outer and x>0 else ()
        omit=tuple(sorted(set(omit+tuple(omit_front_columns))))
        top=shell(b,w,d,floors,region,'door',balconies,2,sparse=True,hidden=hidden,omit_front=omit)
        for k,xx in enumerate((-w*.27,w*.27)):
            if k not in omit:pane(b,xx,-d/2,.38,.34,.62,True,False)
        if roof:hip(b,w+.18,d+.16,top+.07,.52 if region=='classic' else .37,region,1 if region=='classic' else 0)
    return top


def large(region,family,level,mats):
    if family=='onsen':return bath_complex(region,level,mats)
    if level==3:return prestige_large(region,family,mats)
    b=Mesh(f'{region}_{family}_{level}',mats)
    w=5.60;d=2.24;floors=level
    if family=='skyscraper':floors=max(2,level) if region=='classic' else 3 if level==2 else 2
    if family=='finance' and level==3:floors=2
    foundation(b,w,d)
    if family=='onsen':
        wingfloors=1;centerfloors=1
        for x in (-1.97,1.97):
            wide_block(b,x,.12,1.54,1.65,wingfloors,region,False)
            with b.at((x,.12,0)):
                door(b,0,-.825,.16,.43,.85,region)
                if region=='harbor':awning(b,0,-.86,1.11,1.20,'accent',True)
        top=wide_block(b,0,.50,2.20,1.20,centerfloors,region,False,False)
        for x in (-.75,0,.75):pane(b,x,-.125,.37,.44,.65,True,False)
        if region=='classic':
            if level==1:
                hip(b,2.36,1.35,top+.07,.49,region)
                for xx in (-.71,0,.71):
                    ring(b,xx,-.19,top+.25,.11,.025,'gold',16)
                    b.rod((xx,-.18,top+.25),(xx,-.21,top+.25),.085,'glass',16)
            else:
                if level==3:
                    b.cylinder((0,.48,top+.25),.78,.45,'wall',28)
                    for xx in (-1.15,1.15):iron(b,xx,.10,top+.12,.60,False)
                dome(b,0,.48,top+.04+(.45 if level==3 else 0),1.10 if level==2 else .83,.70 if level==2 else .91,region,True)
        else:
            hip(b,2.36,1.35,top+.07,.49,region)
            arcade(b,2.55,-.27,.18,3,1.12,.27)
            if level==2:
                for xx in (-.70,0,.70):pane(b,xx,-.18,top+.13,.24,.29,True,False)
            if level==3:
                rounded_tower(b,0,.45,top+.19,.64,.63,1,region,False)
                dome(b,0,.45,top+.86,.72,.63,region)
        b.box((0,-.69,.20),(2.65,.94,.13),'stone');b.box((0,-.70,.275),(2.43,.79,.035),'water')
        for x in (-1.29,1.29):b.box((x,-.69,.31),(.12,.98,.13),'trim')
        for yy in (-1.13,-.25):b.box((0,yy,.31),(2.68,.11,.13),'trim')
        b.cylinder((0,-.22,.47),.11,.38,'trim',18);b.cylinder((0,-.22,.65),.26,.07,'trim',24)
        b.cylinder((0,-.22,.69),.21,.017,'water',24)
        for xx in (-1.40,1.40):plant(b,xx,-.70,.18,.18,True)
        if region=='harbor' and level==3:
            for xx in (-2.00,2.00):
                b.box((xx,-.87,.21),(1.24,.56,.13),'stone');b.box((xx,-.88,.285),(1.10,.43,.023),'water')
                for yy in (-1.13,-.61):b.box((xx,yy,.32),(1.29,.085,.10),'trim')
                for side in (-1,1):b.box((xx+side*.60,-.87,.32),(.09,.58,.10),'trim')
    else:
        # A continuous central façade with true articulated wings, not a stretched villa.
        centerfloors=floors
        individual_balconies=family=='skyscraper' and region=='classic'
        top=wide_block(b,0,.12,2.34,1.82,centerfloors,region,individual_balconies,False)
        wingfloors=1 if family=='finance' and level==3 and region=='classic' else floors
        for xx in (-1.96,1.96):wide_block(b,xx,.12,1.52,1.82,wingfloors,region,individual_balconies,True,individual_balconies and level>=2)
        if family=='finance' and level==3:
            if region=='harbor':rounded_tower(b,0,.19,top+.02,.66,.44,1,region,False)
            dome(b,0,.19,top+(.48 if region=='harbor' else .10),.81 if region=='harbor' else 1.0,.72,region)
        elif family=='skyscraper' and region=='harbor' and level==3:
            b.box((0,.12,top+.08),(2.45,1.94,.14),'trim')
            with b.at((0,-.55,0)):hip(b,2.49,.67,top+.14,.22,region)
            pergola(b,-.43,.43,top+.15,1.33,.90)
            iron(b,0,-.10,top+.16,2.17,True,.20)
            for xx in (-.85,.85):plant(b,xx,.62,top+.16,.16,True)
            # Rooftop canvas parasol distinguishes the highest coastal hotel.
            b.cylinder((.63,.40,top+.58),.021,.84,'wood',10)
            vv=[(.63+.42*math.cos(i*math.tau/10),.40+.42*math.sin(i*math.tau/10),top+.93) for i in range(10)]+[(.63,.40,top+1.10)]
            b.poly(vv,[(i,(i+1)%10,10) for i in range(10)]+[tuple(range(9,-1,-1))],'trim',False)
        else:
            dormer_count=(2,1) if family=='skyscraper' and level==3 and region=='classic' else 2 if family=='skyscraper' and level==1 else 3
            hip(b,2.49,1.99,top+.07,.62 if region=='classic' else .42,region,dormer_count if region=='classic' else 0)
        door(b,0,-.805,.16,.65,.92,region,True)
        if region=='classic':
            for xx in (-.59,.59):b.cylinder((xx,-.87,.67),.075,1.04,'trim',16)
        if family=='skyscraper':
            if region=='classic':
                if level>=2:
                    for xx in (-2.22,2.22):rounded_tower(b,xx,-.64,.17,.42,floors+.20,floors,region,True,(0,PI/2 if xx>0 else -PI/2))
                dome(b,0,-.92,1.23,.66,.24,region,True)
                if level in (1,3):
                    with b.at((0,-.52,0)):hip(b,1.12,.83,top+.22,.71,region,1)
                    if level==3:iron(b,0,-.48,top+.98,.64,False,.42)
            else:
                for j in range(1,floors):iron(b,0,-.79,.19+j,4.96,j==1,.35)
                if level>=2:rounded_tower(b,-2.27,-.10,.17,.35,floors+.62 if level==2 else 3.30,3,region,True,(0,-PI/2))
                if level==1:awning(b,0,-.91,1.22,1.06,'accent',True)
                if level==3:dome(b,0,-1.0,1.20,.70,.24,region,True)
        else:
            if region=='classic':
                b.box((0,-.77,top+.27),(.71,.31,.62),'wall')
                arch_ring(b,0,-.96,top+.03,.58,.62,.08,.10,'trim',False)
                base.clock_face(b,0,-1.02,top+.35,.21,coin=level!=2)
                for xx in (-2.42,-1.52,-.70,.70,1.52,2.42):
                    colh=wingfloors if abs(xx)>.8 else floors
                    b.box((xx,-.825,colh*.5+.18),(.095,.12,colh),'trim')
                    b.box((xx,-.85,colh+.12),(.17,.15,.09),'stone')
            else:
                for j in range(1,floors):iron(b,0,-.79,.19+j,4.96,True,.35)
                b.xz_shape([(-.54,0),(-.40,.20),(-.25,.40),(0,.55),(.25,.40),(.40,.20),(.54,0)],(0,-.78,top-.02),.20,'wall')
                ring(b,0,-.90,top+.28,.18,.035,'gold',24)
                b.rod((0,-.86,top+.28),(0,-.91,top+.28),.145,'recess',24)
                for i in range(8):
                    a=i*math.tau/8;b.rod((0,-.935,top+.28),(math.cos(a)*.145,-.935,top+.28+math.sin(a)*.145),.011,'wood_light')
                for xx in (-2.42,2.42):crate(b,xx,-1.02,.19,.28)
                if level==1:
                    for xx in (-1.76,0,1.76):awning(b,xx,-.90,1.16,1.34,'accent',True,.23)
        for xx in (-1.28,1.28):
            b.box((xx,-.895,min(1.58,top-.20)),(.20,.035,.55),'accent')
            b.box((xx,-.924,min(1.58,top-.20)),(.024,.016,.34),'gold')
            b.rod((xx-.12,-.91,min(1.88,top+.10)),(xx+.12,-.91,min(1.88,top+.10)),.016,'gold')
        for xx in (-2.57,-.81,.81,2.57):plant(b,xx,-.99,.17,.17,True)
        if region=='classic':
            for xx in (-1.60,1.60):chimney(b,xx,.55,wingfloors+.47,region,.50)
    return b.finish(bevel=.007)


def crate(b,x,y,z,s=.25):
    b.box((x,y,z+s/2),(s,s,s),'wood_light')
    for xx in (-s*.38,s*.38):b.box((x+xx,y-s*.51,z+s/2),(.035,.027,s*.94),'wood')
    for zz in (z+.03,z+s-.03):b.box((x,y-s*.52,zz),(s,.03,.035),'wood')
    b.rod((x-s*.34,y-s*.54,z+.05),(x+s*.34,y-s*.54,z+s-.05),.013,'wood',6)


def emblem(b,x,y,z,kind):
    if kind in ('clock','coin','info'):base.clock_face(b,x,y,z,.19,kind=='coin',kind=='info')
    elif kind=='tools':
        ring(b,x,y-.015,z,.18,.025,'trim')
        for s in (-1,1):
            b.rod((x-s*.10,y-.04,z-.12),(x+s*.095,y-.04,z+.10),.023,'wood_light',8)
            b.box((x+s*.095,y-.04,z+.10),(.14,.045,.065),'metal',s*.6)


def roof_pediment(b,x,y,z,w=.70,h=.43,region='classic'):
    pts=[(-w/2,0),(w/2,0),(w*.42,h*.30),(w*.26,h*.75),(0,h),(-w*.26,h*.75),(-w*.42,h*.30)]
    b.xz_shape(pts,(x,y,z),.16,'wall')
    for i in range(2,len(pts)-1):
        p=pts[i];q=pts[i+1];b.rod((x+p[0],y-.10,z+p[1]),(x+q[0],y-.10,z+q[1]),.033,'trim')


def public(region,name,mats):
    b=Mesh(f'{region}_{name}',mats);w=2.24;d=1.72;h=1.48;wheel=None;crane=None
    if name=='teleport_gate':
        for xx in (-.94,.94):
            with b.at((xx,0,0)):
                top=shell(b,.67,1.28,2 if region=='classic' else 1,region,'blank',False,1,compact_windows=True)
                door(b,0,-.64,.16,.30,.78,region)
                hip(b,.87,1.45,top+.06,.60 if region=='classic' else .38,region,1 if region=='classic' else 0)
        opening_h=2.06 if region=='classic' else 1.70
        with b.at((0,0,.17)):base.arch_opening(b,1.18,opening_h,1.02,'trim',.15)
        for yy in (-.56,.56):arch_ring(b,0,yy,.17,1.18,opening_h,.12,.12,'stone')
        b.box((0,0,opening_h+.26),(1.37,1.04,.16),'wall')
        hip(b,1.48,1.23,opening_h+.34,.32,region)
        ring(b,0,-.61,opening_h+.29,.20,.045,'trim')
        b.rod((0,-.59,opening_h+.29),(0,-.645,opening_h+.29),.16,'water',24)
        for xx in (-1.18,1.18):plant(b,xx,-.79,.14,.17)
    else:
        if name in ('junction_hub','chance_wheel'):w=1.94;d=1.58
        if name=='builders_guild':w=1.85
        foundation(b,w,d);b.box((0,0,.17+h/2),(w,d,h),'wall');masonry(b,w,d,.17,.26)
        for a,span,dep in ((0,w,d),(PI,w,d),(PI/2,d,w),(-PI/2,d,w)):
            with b.facing(a):
                for sign in (-1,1):
                    for k in range(6):b.box((sign*(span/2-.035),-dep/2-.025,.30+k*.23),(.14,.08,.205),'stone' if k%2 else 'trim')
                if a!=0:
                    pane(b,0,-dep/2,.66,.43,.65,True,region=='harbor',True)
                    if a==PI:door(b,-span*.27,-dep/2,.16,.32,.65,region)
        cornice(b,w,d,1.69,region=='classic')
        if region=='harbor' and name in ('builders_guild','rush_station'):gable(b,w+.18,d+.18,1.77,.60,region)
        else:hip(b,w+.18,d+.18,1.77,.62 if region=='classic' else .44,region,2 if region=='classic' and name in ('civic_hall','vault_bank','rush_station') else 1 if region=='classic' else 0)
        chimney(b,-w*.32,d*.24,2.10,region,.43)
        y=-d/2
        if name in ('civic_hall','vault_bank','rush_station'):
            door(b,0,y,.17,.62,.97,region,True)
            for xx in (-w*.34,w*.34):pane(b,xx,y,.43,.36,.76,True,False,True,name=='vault_bank')
            for xx in (-.43,.43):
                b.cylinder((xx,y-.12,.80),.070,1.25,'trim',16)
                for zz in (.24,1.42):b.box((xx,y-.12,zz),(.20,.23,.095),'stone')
            roof_pediment(b,0,y-.08,1.57,.96,.70,region);emblem(b,0,y-.20,1.92,'coin' if name=='vault_bank' else 'clock')
            if name=='civic_hall':
                if region=='harbor':
                    with b.at((0,y+.12,0)):gable(b,1.08,.60,1.82,.54,region)
                for xx in (-.19,.19):
                    for yy in (-.16,.16):b.box((xx,yy,2.46 if region=='harbor' else 2.56),(.074,.074,.72 if region=='harbor' else .52),'trim')
                b.cylinder((0,0,2.55),.11,.17,'gold',16,top=.06);b.sphere((0,0,2.43),(.030,.030,.035),'metal')
                if region=='classic':dome(b,0,0,2.86,.32,.30,region)
                else:hip(b,.62,.58,2.86,.30,region)
            elif name=='rush_station':
                for xx in (-1.20,1.20):
                    b.cylinder((xx,y-.36,.82),.037,1.30,'metal' if region=='classic' else 'wood',12)
                    b.box((xx,y-.36,.21),(.16,.17,.18),'stone')
                if region=='classic':dome(b,0,y-.22,1.58,1.31,.23,region,True)
                else:
                    with b.at((0,y-.20,0)):hip(b,2.71,.66,1.59,.20,region)
                base.bench(b,-.78,.91,.16,.65);base.bench(b,.78,.91,.16,.65)
        elif name in ('card_pavilion','chance_wheel'):
            # Open counter, deep timber shutter reveals and visible merchandise.
            b.arch(0,y-.02,.43,1.21,1.10,'recess',.07)
            arch_ring(b,0,y-.06,.43,1.21,1.10,.09,.16,'trim')
            b.box((0,y-.115,.41),(1.30,.23,.12),'wood_light')
            b.box((0,y-.055,.25),(1.20,.10,.28),'wood' if region=='classic' else 'wood_light')
            for xx in (-.48,-.24,0,.24,.48):b.box((xx,y-.115,.26),(.025,.035,.26),'accent')
            b.box((0,y+.07,1.02),(1.05,.06,.42),'wood')
            for xx in (-.34,0,.34):
                b.box((xx,y-.005,.66),(.18,.12,.18),'terracotta');b.box((xx,y-.04,.77),(.20,.13,.025),'gold')
            awning(b,0,y-.08,1.54,1.63,'accent',region=='harbor')
            lantern(b,-w*.43,y,1.08);lantern(b,w*.43,y,1.08)
            if name=='card_pavilion':
                for k in (-1,0,1):
                    with b.at((k*.33,y-.08,1.99),k*.08):
                        b.box((0,0,0),(.40,.065,.61),'gold');b.box((0,-.039,0),(.35,.025,.54),'petal')
                        if k==0:b.xz_shape([(0,-.16),(.115,0),(0,.16),(-.115,0)],(0,-.06,0),.016,'flower')
                        elif k==-1:b.xz_shape([(0,-.14),(-.14,.025),(-.10,.12),(-.04,.13),(0,.07),(.04,.13),(.10,.12),(.14,.025)],(0,-.06,0),.016,'flower')
                        else:
                            for xx,zz in ((-.06,.03),(.06,.03),(0,.105)):b.rod((xx,-.055,zz),(xx,-.08,zz),.071,'accent',12)
                            b.xz_shape([(-.06,-.13),(.06,-.13),(0,.025)],(0,-.073,0),.016,'accent')
            else:
                wheel=(w*.53,-d*.43,.79)
                for xx in (wheel[0]-.21,wheel[0]+.21):b.rod((xx,wheel[1],.17),wheel,.045,'wood')
                if region=='harbor':rounded_tower(b,0,.10,2.04,.24,.34,1,region,window_height=.16,window_width=.14,window_offset=.09)
        elif name=='builders_guild':
            # Dark setback aperture with shelving; no noisy or missing solid wall.
            b.box((0,y-.025,.79),(1.13,.07,1.20),'recess')
            for xx in (-.63,.63):b.box((xx,y-.085,.77),(.12,.16,1.24),'wood')
            b.box((0,y-.10,1.42),(1.44,.20,.13),'wood_light')
            for xx in (-.36,0,.36):crate(b,xx,y-.07,.20,.28)
            for zz in (.61,.96):
                b.box((0,y-.07,zz),(1.10,.18,.06),'wood')
                for xx in (-.36,-.12,.12,.36):b.box((xx,y-.10,zz+.13),(.19,.13,.20),'stone')
            emblem(b,0,y-.12,1.69,'tools')
            for k in range(2):
                for j in range(3):crate(b,-1.17+k*.22,y+.15+j*.18,.16,.19)
            b.box((1.01,.07,1.23),(.13,.13,2.16),'wood');b.box((1.24,.07,2.30),(1.03,.14,.14),'wood_light')
            b.rod((1.01,.07,1.70),(1.66,.07,2.29),.055,'wood')
            for zz in (1.70,2.30):b.box((1.01,-.012,zz),(.18,.025,.18),'metal')
            crane=(1.68,.07,2.25)
            lantern(b,-.77,y,1.08)
        elif name=='junction_hub':
            door(b,-.57,y,.16,.35,.90,region)
            b.box((.32,y-.045,.91),(1.09,.09,.90),'wood');b.box((.32,y-.10,.91),(.96,.035,.77),'gold')
            b.box((.32,y-.127,.91),(.88,.023,.69),'water')
            # Legible map symbols in geometry, no fake microtext.
            for x,z,s in ((.08,.77,.16),(.53,1.07,.13),(.42,.75,.12)):
                b.sphere((x,y-.15,z),(s,.013,s*.70),'leaf_light',8,4)
            for a,c in [((-.01,.69),(.32,.91)),((.32,.91),(.62,1.13)),((.32,.91),(.66,.69))]:b.rod((a[0],y-.17,a[1]),(c[0],y-.17,c[1]),.020,'trim',6)
            for x,z in ((-.01,.69),(.32,.91),(.62,1.13),(.66,.69)):b.rod((x,y-.165,z),(x,y-.19,z),.048,'terracotta',12)
            awning(b,.26,y-.07,1.45,1.23,'accent',region=='harbor')
            b.box((1.16,-.22,1.02),(.075,.075,1.70),'wood')
            for k,mat in enumerate(('accent','terracotta','wood_light')):
                pts=[(-.22,-.09),(.22,-.09),(.32,0),(.22,.09),(-.22,.09)]
                b.xz_shape(pts,(1.21,-.28,1.58-k*.27),.055,'gold')
                pts=[(-.18,-.06),(.20,-.06),(.27,0),(.20,.06),(-.18,.06)];b.xz_shape(pts,(1.21,-.315,1.58-k*.27),.017,mat)
            lantern(b,-.84,y,1.11)
        for xx in (-w*.43,w*.43):plant(b,xx,y-.23,.14,.15,name in ('civic_hall','vault_bank'))
        for xx in (-w/2+.01,w/2-.01):b.rod((xx,d/2+.055,.18),(xx,d/2+.055,1.66),.023,'metal')
    root=b.finish(bevel=.007)
    if wheel:
        rotor=bpy.data.objects.new(f'{region}_life_wheel_rotor',None);bpy.context.collection.objects.link(rotor);rotor.parent=root;rotor.location=wheel;rotor['lifePart']='wheel'
        p=Mesh(f'{region}_chance_wheel_rotor',mats);p.rod((0,.045,0),(0,-.035,0),.48,'wood_light',40)
        for i in range(10):
            a=i*math.tau/10;c=(i+1)*math.tau/10
            p.poly([(0,-.05,0),(.43*math.sin(a),-.05,.43*math.cos(a)),(.43*math.sin(c),-.05,.43*math.cos(c))],[(0,2,1)],('accent','gold','flower')[i%3])
            p.rod((0,-.065,0),(.44*math.sin(a),-.065,.44*math.cos(a)),.014,'gold')
            p.sphere((.45*math.sin(a),-.07,.45*math.cos(a)),(.025,.017,.025),'gold',8,4)
        p.rod((0,-.055,0),(0,-.13,0),.085,'gold',20);p.finish(rotor,bevel=.006)
    if crane:
        pendulum=bpy.data.objects.new(f'{region}_life_crane_pendulum',None);bpy.context.collection.objects.link(pendulum);pendulum.parent=root;pendulum.location=crane;pendulum['lifePart']='pendulum'
        p=Mesh(f'{region}_crane_load',mats);p.rod((0,0,0),(0,0,-.55),.014,'metal');crate(p,0,0,-.79,.28);p.finish(pendulum,bevel=.007)
    return root


def lighthouse(mats):
    b=Mesh('harbor_lighthouse',mats)
    foundation(b,3.60,2.38)
    # The established hero has a left domed annex, right wheel and tall light tower.
    rounded_tower(b,-1.03,.08,.18,.66,1.24,1,'harbor',False)
    dome(b,-1.03,.08,1.47,.76,.66,'harbor',True)
    rounded_tower(b,.36,.08,.18,.73,2.65,2,'harbor',False,skip_windows=((1,PI/2),(1,PI),(1,PI*1.5)))
    door(b,.36,-.69,.18,.62,1.0,'harbor',True)
    for a in (PI/2,PI,-PI/2):
        with b.at((.36,.08,0),a):pane(b,0,-.74,2.02,.40,.65,True,False,True)
    b.cylinder((.36,.08,3.08),.82,.40,'roof',32,top=.48)
    b.cylinder((.36,.08,2.88),.85,.065,'trim',32)
    for i in range(28):
        a=i*math.tau/28
        b.rod((.36+.82*math.cos(a),.08+.82*math.sin(a),2.90),(.36+.48*math.cos(a),.08+.48*math.sin(a),3.29),.025,'roof_edge',6)
    for j in range(1,5):
        z=2.90+j*.079;rr=.82-j*.068
        for i in range(28):
            a=i*math.tau/28;c=(i+1)*math.tau/28
            b.rod((.36+rr*math.cos(a),.08+rr*math.sin(a),z),(.36+rr*math.cos(c),.08+rr*math.sin(c),z),.009,'roof_edge',5)
    b.cylinder((.36,.08,3.36),.68,.13,'trim',36)
    b.cylinder((.36,.08,3.70),.46,.55,'glass',24)
    for i in range(10):
        a=i*math.tau/10;xx=.36+math.cos(a)*.48;yy=.08+math.sin(a)*.48
        b.rod((xx,yy,3.41),(xx,yy,4.0),.029,'gold',8)
    for zz in (3.45,3.75):
        for i in range(24):
            a=i*math.tau/24;c=(i+1)*math.tau/24
            b.rod((.36+.70*math.cos(a),.08+.70*math.sin(a),zz),(.36+.70*math.cos(c),.08+.70*math.sin(c),zz),.023,'gold',8)
    for i in range(12):
        a=i*math.tau/12;b.rod((.36+.70*math.cos(a),.08+.70*math.sin(a),3.40),(.36+.70*math.cos(a),.08+.70*math.sin(a),3.75),.021,'gold',8)
    dome(b,.36,.08,4.02,.57,.42,'harbor')
    for xx,yy in ((-1.52,-.66),(-.83,-.79),(1.02,-.65)):plant(b,xx,yy,.17,.20)
    lantern(b,-.19,-.77,1.14)
    # Water wheel is closed, regularly spaced carpentry with a preserved animation pivot.
    root=b.finish(bevel=.009)
    rotor=bpy.data.objects.new('harbor_lighthouse_waterwheel',None);bpy.context.collection.objects.link(rotor);rotor.parent=root;rotor.location=(1.36,.12,1.22);rotor['lifePart']='wheel'
    p=Mesh('harbor_lighthouse_waterwheel_geometry',mats)
    # Local wheel rotates in XZ, matching the existing life wheel semantic.
    for yy in (-.20,.20):
        for i in range(28):
            a=i*math.tau/28;c=(i+1)*math.tau/28
            p.rod((.98*math.cos(a),yy,.98*math.sin(a)),(.98*math.cos(c),yy,.98*math.sin(c)),.055,'wood',8)
        for i in range(8):
            a=i*math.tau/8;p.rod((0,yy,0),(.95*math.cos(a),yy,.95*math.sin(a)),.042,'wood_light',8)
    for i in range(14):
        a=i*math.tau/14;x=.94*math.cos(a);z=.94*math.sin(a)
        p.rod((x,-.24,z),(x,.24,z),.10,'wood_light',6)
    p.rod((0,-.30,0),(0,.30,0),.12,'metal',16);p.finish(rotor,bevel=.008)
    # Destination scenes consume GLB clips directly, unlike the lot lifePart rig.
    rotor.rotation_euler[1]=0;rotor.keyframe_insert(data_path='rotation_euler',index=1,frame=1)
    rotor.rotation_euler[1]=math.tau;rotor.keyframe_insert(data_path='rotation_euler',index=1,frame=481)
    action=rotor.animation_data.action;action.name='Harbor waterwheel — slow continuous turn'
    if hasattr(action,'fcurves'):
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='LINEAR'
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    for curve in strip.channelbag(slot).fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=481;bpy.context.scene.frame_set(1)
    return root


def build(region,asset):
    if region not in ('classic','harbor'):raise ValueError(f'Unsupported western region: {region}')
    name=asset['name'] if isinstance(asset,dict) else str(asset)
    if name.startswith(region+'_'):name=name[len(region)+1:]
    mats=materials(region)
    if name in ('lighthouse','harbor_lighthouse'):
        root=lighthouse(mats);family='lighthouse';level=0
    elif name.rsplit('_',1)[-1] in ('1','2','3'):
        family,level=name.rsplit('_',1);level=int(level)
        root=core(region,family,level,mats) if family in ('villa','shop','hotel','tower') else large(region,family,level,mats)
    else:
        family=name;level=0;root=public(region,name,mats)
    root.name=f'{region}_{name}';root['region']=region;root['family']=family;root['level']=level
    root['construction']='Authored Blender solid geometry from existing per-asset front/right/back references; no AI source mesh'
    root['reference_manifest']=f'assets/models/regions/{region}-manifest.json'
    return root
