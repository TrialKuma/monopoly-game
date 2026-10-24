"""Reference-specific, editable Kyoto machiya quality study. No AI inference.

Blender -b -t 4 --python build_kyoto_villa2.py
The exported GLB is reimported into a fresh scene before all review renders.
"""
import bpy, math, json, hashlib, importlib.util, struct, zlib
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
spec=importlib.util.spec_from_file_location('regional_architecture',ROOT/'art/build_regional_city.py')
legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
Mesh=legacy.Mesh

def material(name,hexcode,roughness=.62,emission=0):
    rgb=tuple(legacy.linear(int(hexcode[i:i+2],16)/255) for i in (0,2,4))
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=roughness
    if emission:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission
    return m

def make_materials():
    return {k:material('Kyoto / '+k,c,r,e) for k,c,r,e in [
        ('wall','E8D5AD',.82,0),('dark','443222',.65,0),('wood','765036',.60,0),
        ('lightwood','9E764F',.59,0),('roof','3D4B5B',.42,0),('edge','586678',.46,0),
        ('stone','A4A59D',.82,0),('stone2','BDB8A6',.8,0),('glass','EEB55F',.42,.09),
        ('unlit','85714B',.55,0),('indigo','253C67',.78,0),('cream','ECD7A9',.76,0),
        ('bronze','966938',.5,0),('leaf','54723B',.7,0),('leaf2','7B9848',.7,0)]}

def beam_between(b,a,c,w,d,mat='wood'):
    # Rectangular beam in the YZ plane; use true solid geometry for gable rafters.
    a=Vector(a);c=Vector(c);axis=(c-a).normalized();u=Vector((1,0,0));v=axis.cross(u).normalized()
    vv=[tuple(p+sx*w/2*u+sy*d/2*v) for p in (a,c) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    b.poly(vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,bevel=True)

def tile_course(b,x0,x1,y0,y1,z0,z1,cols,rows,roll=True):
    """Ordered concave pan tiles and convex cover rolls, overlapping each course."""
    width=(x1-x0)/cols
    slope=(z1-z0)/(y1-y0)
    for row in range(rows):
        t0=row/rows;t1=min(1,(row+1.10)/rows)
        yy0=y0+(y1-y0)*t0;yy1=y0+(y1-y0)*t1
        for col in range(cols):
            xx0=x0+col*width;xx1=xx0+width
            verts=[]
            for under in (0,1):
                for j in range(3):
                    t=j/2;yy=yy0+(yy1-yy0)*t
                    # The ridge-side course overlaps the course below it.
                    # Raising the eave edge makes an actual clean, readable lip.
                    zz=z0+(yy-y0)*slope + .020*t
                    # Four straight regular sections define a concave pan.
                    for i in range(5):
                        u=i/4;curve=.022*(2*u-1)**2
                        xx=xx0+u*width
                        # Physical courses overlap, but their exposed gable-side
                        # walls must not be coplanar in the overlap interval.
                        # Submillimetre lateral steps prevent depth flicker.
                        if col==0 and i==0:xx-=row*.0008
                        if col==cols-1 and i==4:xx+=row*.0008
                        verts.append((xx,yy,zz+curve-under*.016))
            top_faces=[];solid_faces=[]
            for j in range(2):
                for i in range(4):
                    k=j*5+i
                    top_faces.append((k,k+1,k+6,k+5));solid_faces.append((k+20,k+21,k+16,k+15))
            perimeter=[0,1,2,3,4,9,14,13,12,11,10,5]
            for a,c in zip(perimeter,perimeter[1:]+perimeter[:1]):solid_faces.append((a,a+15,c+15,c))
            # Winding swaps for the front slope because y runs toward -Y.
            if y1<y0:
                top_faces=[tuple(reversed(f)) for f in top_faces];solid_faces=[tuple(reversed(f)) for f in solid_faces]
            # Split the crisp ceramic rim from the curved top; smoothing a solid
            # shell across its 90-degree edge gives the melted edge of AI meshes.
            b.poly(verts,top_faces,'roof',True)
            b.poly(verts,solid_faces,'roof',False)
            lip=[]
            for yy,t in ((yy1-(yy1-yy0)*.035,.965),(yy1,1)):
                for i in range(5):
                    u=i/4;lip.append((xx0+u*width,yy,z0+(yy-y0)*slope+.020*t+.022*(2*u-1)**2+.001))
            ff=[(i,i+1,i+6,i+5) for i in range(4)]
            if y1<y0:ff=[tuple(reversed(f)) for f in ff]
            b.poly(lip,ff,'edge',True)
        if roll:
            for col in range(cols+1):
                xx=x0+col*width
                # Roll top is a semicircle; thickness and front disk are physical.
                vv=[];n=7
                for yy,t in ((yy0,0),(yy1,1)):
                    zz=z0+(yy-y0)*slope+.020*t+.022
                    for k in range(n):
                        a=math.pi*k/(n-1);vv.append((xx+math.cos(a)*.036,yy,zz+math.sin(a)*.036))
                caps=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n)),(n-1,0,n,2*n-1)]
                faces=[(i,i+1,i+1+n,i+n) for i in range(n-1)]
                if y1>y0:
                    faces=[tuple(reversed(f)) for f in faces];caps=[tuple(reversed(f)) for f in caps]
                b.poly(vv,faces,'roof',True);b.poly(vv,caps,'roof',False)
                # Narrow but visible overlap cuff in the roof's own direction.
                if row<rows-1:
                    yyc=yy1-(yy1-yy0)*.05;zz=z0+(yyc-y0)*slope+.044
                    vv=[]
                    for yy in (yyc,yyc+(y1-y0)*.012):
                        for k in range(n):
                            a=math.pi*k/(n-1);vv.append((xx+math.cos(a)*.037,yy,zz+(yy-yyc)*slope+math.sin(a)*.037))
                    faces=[(i,i+1,i+1+n,i+n) for i in range(n-1)]
                    if y1>y0:faces=[tuple(reversed(f)) for f in faces]
                    b.poly(vv,faces,'edge',True)

def window(b,x,y,z,w,h,cols=5,rows=2,lit=True,shutter=False):
    # The glazing sits inside a deep dark reveal, never pasted over the frame.
    b.box((x,y-.008,z+h/2),(w+.09,.06,h+.10),'dark')
    b.box((x,y-.044,z+h/2),(w,.018,h),'glass' if lit else 'unlit')
    for xx in (x-w/2-.022,x+w/2+.022):b.box((xx,y-.083,z+h/2),(.045,.075,h+.11),'wood')
    for zz in (z-.025,z+h+.025):
        b.box((x,y-.084,zz),(w+.135,.079,.05),'wood')
        b.box((x,y-.127,zz+.006),(w+.13,.009,.012),'lightwood')
    for k in range(1,cols):b.box((x-w/2+k*w/cols,y-.071,z+h/2),(.019,.046,h),'wood')
    for k in range(1,rows):b.box((x,y-.069,z+k*h/rows),(w,.04,.019),'wood')
    if shutter:
        for k in range(cols+1):b.box((x-w/2+k*w/cols,y-.104,z+h/2),(.026,.043,h+.01),'wood')
    for xx in (x-w/2-.022,x+w/2+.022):
        b.box((xx,y-.129,z-.025),(.053,.018,.049),'lightwood')

def small_awning(b,x,y,z,w):
    with b.at((x,y,z)):
        b.box((0,-.085,-.035),(w+.13,.28,.035),'wood')
        tile_course(b,-w/2-.075,w/2+.075,0,-.28,.09,0,max(4,round(w/.17)),2,False)

def frame_wall(b,width,depth):
    b.box((0,0,1.34),(width,depth,2.36),'wall')
    # Gable infill, extruded along X at both sides.
    for side in (-1,1):
        with b.facing(math.pi/2):
            b.xz_shape([(-depth/2,2.46),(0,2.97),(depth/2,2.46)],(0,-side*width/2,0),.025,'wall')
    for x in (-width/2,width/2):
        for y in (-depth/2,depth/2):b.box((x,y,1.37),(.105,.105,2.42),'wood')
    for a,span,dep in ((0,width,depth),(math.pi,width,depth),(math.pi/2,depth,width),(math.pi*1.5,depth,width)):
        with b.facing(a):
            y=-dep/2-.026
            for z,h in ((.18,.075),(.46,.06),(1.42,.10),(2.46,.105)):
                b.box((0,y,z),(span+.025,.071,h),'wood')
                if z in (1.42,2.46):b.box((0,y-.039,z+.027),(span+.04,.013,.017),'lightwood')
            # Wainscot panels have regular, readable vertical seams.
            n=max(6,round(span/.13))
            for k in range(n):b.box((-span/2+(k+.5)*span/n,y-.004,.32),(span/n-.009,.034,.21),'wood' if k%3 else 'dark')
            for k in range(n+1):b.box((-span/2+k*span/n,y-.025,.32),(.009,.012,.22),'lightwood')
    # Upstairs front framing matches the three-view: single broad central opening.
    for x in (-.72,.72):b.box((x,-depth/2-.025,1.99),(.072,.09,.91),'wood')
    for x in (-.94,.94):b.box((x,-depth/2-.036,2.27),(.40,.065,.075),'wood')

def foundation(b,w,d):
    b.box((0,0,.075),(w+.12,d+.15,.15),'stone')
    for a,span,dep in ((0,w,d),(math.pi,w,d),(math.pi/2,d,w),(math.pi*1.5,d,w)):
        with b.facing(a):
            n=round(span/.26)
            for k in range(n):
                x=-span/2+(k+.5)*span/n
                b.box((x,-dep/2-.058,.12),(span/n-.012,.13,.20),'stone' if k%3 else 'stone2')
            for x in (-span/2+.06,span/2-.06):b.box((x,-dep/2-.066,.22),(.20,.15,.16),'stone')
    b.box((.12,-d/2-.18,.056),(1.02,.38,.11),'stone2')
    b.box((.12,-d/2-.22,.108),(1.01,.28,.016),'stone')

def roof(b,w,d):
    # Full double-pitch main roof; clean ridge and identical repeated tile rhythm.
    for sign in (-1,1):
        tile_course(b,-w/2,w/2,0,sign*d/2,3.02,2.49,12,5)
        b.box((0,sign*d/2,2.455),(w+.04,.10,.085),'wood')
        b.box((0,sign*(d/2+.048),2.482),(w+.06,.025,.026),'lightwood')
        for x in (-w/2+.10,w/2-.10):
            b.box((x,sign*(d/2-.025),2.37),(.09,.18,.15),'wood')
            b.box((x,sign*(d/2+.020),2.38),(.095,.09,.075),'lightwood')
        for k in range(11):
            x=-w/2+.12+k*(w-.24)/10;b.box((x,sign*(d/2-.012),2.433),(.035,.155,.065),'wood')
    for x in (-w/2,w/2):
        for s in (-1,1):
            beam_between(b,(x,0,2.985),(x,s*d/2,2.46),.085,.07,'wood')
            # The reference has a ceramic barge cap covering the otherwise
            # exposed, overlapping outer pan walls. Solid separated sections
            # make that silhouette clean and remove all coplanar exposed rims.
            capx=x+math.copysign(.047,x)
            for k in range(5):
                t0=k/5+.002;t1=(k+1)/5-.002
                beam_between(b,(capx,s*d/2*t0,3.02-.53*t0+.026),(capx,s*d/2*t1,3.02-.53*t1+.026),.068,.074,'roof')
        # Rounded ridge finials, restrained and symmetrical.
        b.box((x,0,3.059),(.10,.19,.10),'roof')
        b.rod((x-.055,0,3.116),(x+.055,0,3.116),.084,'roof',12)
        b.rod((x-.058,0,3.118),(x+.058,0,3.118),.060,'edge',12)
    b.box((0,0,3.04),(w,.17,.063),'roof')
    b.box((0,0,3.075),(w,.13,.027),'edge')
    for k in range(12):
        x0=-w/2+k*w/12;x1=x0+w/12-.007
        b.rod((x0,0,3.104),(x1,0,3.104),.053,'roof',10)

def noren(b):
    xcenter=.12;y=-1.059;bottom=.76;top=1.20;total=.82
    b.rod((xcenter-.48,y+.016,top+.035),(xcenter+.48,y+.016,top+.035),.019,'wood',10)
    for k in range(3):
        left=xcenter-total/2+k*total/3+.005;right=left+total/3-.010
        vv=[]
        for zz in (bottom,top):
            for j in range(7):
                t=j/6;xx=left+(right-left)*t
                vv.append((xx,y-.010*math.sin(t*math.tau),zz+.006*math.cos(t*math.pi) if zz==bottom else zz))
        ff=[(j,j+1,j+8,j+7) for j in range(6)]
        b.poly(vv,ff,'indigo',True)
        # Hem and narrow tabs give fabric a convincing finished edge.
        b.box(((left+right)/2,y,top+.036),(.032,.018,.085),'indigo')
    # Original geometry flower crest; no image editing or reference cropping.
    cx=xcenter+.06;cz=.971;r=.123;cy=y-.026
    for i in range(40):
        a=math.tau*i/40;c=math.tau*(i+1)/40
        b.rod((cx+r*math.cos(a),cy,cz+r*math.sin(a)),(cx+r*math.cos(c),cy,cz+r*math.sin(c)),.010,'cream',5)
    for k in range(5):
        a=math.tau*k/5+math.pi/2;u=Vector((math.cos(a),0,math.sin(a)));v=Vector((-math.sin(a),0,math.cos(a)))
        center=Vector((cx,cy-.002,cz));points=[]
        for j in range(18):
            t=math.tau*j/18
            # A tapered petal with a small notch at its outer end, not five disks.
            length=.043+.041*math.cos(t)-.009*math.exp(-(min(t,math.tau-t)/.22)**2)
            p=center+u*length+v*(.030*math.sin(t)*(1+.22*math.cos(t)));points.append(tuple(p))
        b.poly(points,[tuple(range(18))],'cream')
    b.sphere((cx,cy-.004,cz),(.018,.006,.018),'cream',10,4)

def lantern(b):
    x=-1.18;y=-1.04;z=.95
    b.rod((x+.04,-.86,1.31),(x,-1.04,1.35),.014,'bronze',8)
    b.rod((x,-1.04,1.35),(x,-1.04,1.22),.009,'dark',8)
    b.cylinder((x,y,z),.095,.27,'glass',16)
    # Quarter-round shoulders and distinct straight barrel sides.
    b.sphere((x,y,z+.13),(.095,.095,.045),'glass',16,4)
    b.sphere((x,y,z-.13),(.095,.095,.045),'glass',16,4)
    for zz in (z-.17,z+.17):b.cylinder((x,y,zz),.069,.025,'dark',12)
    for k in range(7):
        zz=z-.125+k*.25/6
        for i in range(16):
            a=math.tau*i/16;c=math.tau*(i+1)/16
            b.rod((x+.096*math.cos(a),y+.096*math.sin(a),zz),(x+.096*math.cos(c),y+.096*math.sin(c),zz),.003,'cream',4)
    for i in range(6):
        a=math.tau*i/6;b.rod((x+.096*math.cos(a),y+.096*math.sin(a),z-.12),(x+.096*math.cos(a),y+.096*math.sin(a),z+.12),.004,'bronze',5)

def planter(b):
    x=.92;y=-1.015
    b.cylinder((x,y,.255),.095,.27,'bronze',16,top=.13)
    b.cylinder((x,y,.39),.14,.028,'bronze',16)
    b.cylinder((x,y,.405),.121,.015,'dark',16)
    for tier in range(3):
        for i in range(7-tier):
            a=math.tau*i/(7-tier)+tier*.61
            base=Vector((x,y,.43+tier*.07));tip=base+Vector((math.cos(a)*(.19-tier*.035),math.sin(a)*(.19-tier*.035),.09))
            mid=base.lerp(tip,.52)+Vector((0,0,.045));per=Vector((-math.sin(a),math.cos(a),0))*(.049-tier*.007)
            b.rod(tuple(base),tuple(tip),.004,'wood',5)
            b.poly([tuple(base),tuple(mid-per),tuple(tip),tuple(mid+per),tuple(mid+Vector((0,0,.017)))],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'leaf' if i%2 else 'leaf2')

def compact_gray_png(path):
    """Losslessly retain identical AO channels in an 8-bit single-channel PNG.

    Standard-library-only conversion; never resizes or denoises the baked data.
    """
    data=path.read_bytes();pos=8;compressed=b'';header=None
    while pos<len(data):
        size=struct.unpack_from('>I',data,pos)[0];tag=data[pos+4:pos+8];payload=data[pos+8:pos+8+size]
        if tag==b'IHDR':header=payload
        elif tag==b'IDAT':compressed+=payload
        pos+=size+12
    width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',header)
    if color==0:return
    assert depth==8 and color in (2,6) and interlace==0
    channels=3 if color==2 else 4;stride=width*channels;raw=zlib.decompress(compressed)
    previous=bytearray(stride);previous_grey=bytearray(width);encoded=bytearray()
    for y in range(height):
        f=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
            if f==1:predictor=a
            elif f==2:predictor=b
            elif f==3:predictor=(a+b)//2
            elif f==4:
                p=a+b-c;pa=abs(p-a);pb=abs(p-b);pc=abs(p-c);predictor=a if pa<=pb and pa<=pc else b if pb<=pc else c
            else:predictor=0
            row[x]=(row[x]+predictor)&255
        grey=row[0::channels]
        assert grey==row[1::channels] and grey==row[2::channels], 'AO texture unexpectedly contains color'
        candidates=[bytearray(grey)]+[bytearray(width) for _ in range(4)]
        for x,value in enumerate(grey):
            a=grey[x-1] if x else 0;b=previous_grey[x];c=previous_grey[x-1] if x else 0
            p=a+b-c;pa=abs(p-a);pb=abs(p-b);pc=abs(p-c);paeth=a if pa<=pb and pa<=pc else b if pb<=pc else c
            for k,predictor in enumerate((a,b,(a+b)//2,paeth),1):candidates[k][x]=(value-predictor)&255
        best=min(range(5),key=lambda k:sum(min(v,256-v) for v in candidates[k]))
        encoded.append(best);encoded.extend(candidates[best]);previous=row;previous_grey=grey
    def chunk(tag,payload):return struct.pack('>I',len(payload))+tag+payload+struct.pack('>I',zlib.crc32(tag+payload)&0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(encoded,9))+chunk(b'IEND',b''))

def bake_local_occlusion(meshes):
    """Short-range self-occlusion only, no directional light in base color."""
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.render.threads_mode='FIXED';scene.render.threads=4
    image=bpy.data.images.new('Kyoto local contact AO - 18cm',width=2048,height=2048,alpha=False)
    image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0025,area_weight=.5,correct_aspect=True,scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    restore=[]
    for mat in meshes[0].data.materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        previous=out.inputs['Surface'].links[0].from_socket
        tex=nodes.new('ShaderNodeTexImage');tex.name='Shared local occlusion atlas';tex.image=image;nodes.active=tex
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.18;ao.samples=16;ao.only_local=True
        emit=nodes.new('ShaderNodeEmission');links.new(ao.outputs['AO'],emit.inputs['Color']);links.new(emit.outputs[0],out.inputs['Surface'])
        restore.append((mat,out,previous,ao,emit,tex))
    print('BAKING_LOCAL_AO_2048_CPU_16',flush=True)
    bpy.ops.object.bake(type='EMIT',use_clear=True,margin=4)
    image.filepath_raw=str(HERE/'local-occlusion.png');image.file_format='PNG';image.save()
    compact_gray_png(HERE/'local-occlusion.png');image.reload();image.pack()
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat').default_value=1
    for mat,out,previous,ao,emit,tex in restore:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;links.new(previous,out.inputs['Surface'])
        nodes.remove(ao);nodes.remove(emit)
        settings=nodes.new('ShaderNodeGroup');settings.node_tree=group;settings.label='Local AO only, no baked directional light'
        links.new(tex.outputs['Color'],settings.inputs['Occlusion'])
    print('LOCAL_AO_READY',flush=True)

def build():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    mats=make_materials();b=Mesh('Kyoto_Machiya_Villa_2',mats);w=2.32;d=1.65
    foundation(b,w,d);frame_wall(b,w,d)
    # Ground-floor door framing and side lattice, carefully matching front reference.
    for x in (-.42,.66):b.box((x,-.864,.76),(.09,.12,1.12),'wood')
    b.box((.12,-.883,.65),(.99,.04,.94),'dark')
    for x in (-.12,.36):
        window(b,x,-.88,.32,.43,.75,cols=5,rows=4,lit=True)
        b.box((x,-.98,.23),(.43,.055,.18),'wood')
        for k in range(4):b.box((x-.16+k*.105,-1.01,.23),(.008,.009,.17),'dark')
    b.box((.12,-1.012,.72),(.045,.036,1.01),'wood')
    window(b,-.80,-.852,.46,.54,.66,cols=7,rows=2,lit=False,shutter=True)
    window(b,.91,-.852,.46,.35,.66,cols=5,rows=2,lit=False,shutter=True)
    # Front upstairs double sliding window and balcony spanning exactly its width.
    window(b,-.31,-.848,1.73,.55,.52,cols=6,rows=2,lit=True)
    window(b,.31,-.848,1.73,.55,.52,cols=6,rows=2,lit=True)
    b.box((0,-.965,2.31),(1.43,.14,.07),'wood')
    b.box((0,-1.00,2.325),(1.42,.015,.015),'lightwood')
    b.box((0,-.969,1.64),(1.43,.27,.055),'wood')
    for z in (1.66,1.87):
        b.box((0,-1.105,z),(1.40,.05,.055),'wood')
        b.box((0,-1.134,z+.015),(1.42,.015,.014),'lightwood')
    for k in range(15):b.box((-.67+k*1.34/14,-1.10,1.76),(.026,.045,.20),'wood')
    for side in (-1,1):
        b.box((side*.72,-1.09,1.77),(.063,.09,.31),'wood')
        b.box((side*.72,-.975,1.87),(.053,.23,.05),'wood')
    # Side walls: intact plaster gables, timber framing, two differently sized windows.
    for a in (-math.pi/2,math.pi/2):
        with b.facing(a):
            b.box((0,-w/2-.023,1.92),(.065,.075,.97),'wood')
            window(b,.05,-w/2-.025,.51,.58,.45,7,2,True)
            small_awning(b,.05,-w/2-.025,1.06,.68)
            window(b,-.04,-w/2-.025,1.81,.43,.38,4,2,True)
            small_awning(b,-.04,-w/2-.025,2.29,.53)
    # Back facade has offset openings and a continuous timber post as in the rear sheet.
    with b.facing(math.pi):
        b.box((.69,-d/2-.032,1.36),(.078,.088,2.39),'wood')
        window(b,-.25,-d/2-.028,.52,.66,.44,7,2,True);small_awning(b,-.25,-d/2-.025,1.07,.78)
        window(b,-.25,-d/2-.028,1.81,.59,.41,6,2,False);small_awning(b,-.25,-d/2-.025,2.30,.73)
    # Short canopy front and rear, with deep wooden eaves and repeated tiny rafter ends.
    for sign in (-1,1):
        tile_course(b,-1.32,1.32,sign*.77,sign*1.13,1.58,1.40,12,2)
        b.box((0,sign*1.12,1.365),(2.70,.10,.075),'wood')
        b.box((0,sign*1.172,1.392),(2.68,.018,.020),'lightwood')
        for k in range(12):b.box((-1.23+k*2.46/11,sign*1.11,1.33),(.038,.17,.065),'wood')
        for x in (-1.20,1.20):b.box((x,sign*1.03,1.285),(.085,.17,.11),'wood')
    roof(b,2.65,2.08);noren(b);lantern(b);planter(b)
    root=b.finish(bevel=.006)
    root['assetRole']='unapproved isolated quality study';root['family']='villa';root['level']=2
    root['region']='compact';root['reference']='art/themed-city-kit/inputs/compact-house-v01/'
    root['method']='Authored solid architecture. No AI generation. No textures or source mesh reused.'
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    HERE.mkdir(parents=True,exist_ok=True);(HERE/'renders').mkdir(exist_ok=True)
    bake_local_occlusion(meshes)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'kyoto-villa2.blend'))
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(HERE/'kyoto-villa2.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    glb=HERE/'kyoto-villa2.glb'
    info={'asset':'Kyoto villa 2 authored quality study','approved':False,'generatedWithAI':False,'triangles':triangles,'materials':len(mats),'bytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'front':'glTF +Z','up':'glTF +Y','origin':'ground centre','source':'Custom Blender geometry matching front/right/back references; reusable Mesh primitive API from art/build_regional_city.py','referenceFiles':['art/themed-city-kit/inputs/compact-house-v01/'+x for x in ['view00_azim000.png','view01_azim090.png','view02_azim180.png']],'targets':{'triangles':30000,'bytes':3145728,'materials':15},'triangleBudgetException':f'{triangles/1000:.1f}k triangles retained for this isolated comparison sample to preserve real curved roof tiles and physical bevels. It is not a published runtime replacement.','occlusion':{'size':2048,'distance':.18,'samples':16,'method':'CPU Cycles local AO to glTF occlusionTexture; baseColor contains no light/shadow'},'reviewRenders':'All renders use freshly reimported kyoto-villa2.glb, not the source Blender mesh.'}
    info['byteBudgetException']='3.05 MiB, about 52 KiB above the preferred 3 MiB sample target after adding solid ceramic gable caps. No runtime approval.'
    info['knownLimitations']=['Fine grazing-angle stippling is still visible in the right orthographic studio render above the ceramic gable cap; no further geometry iteration in this isolated comparison study.','This is clean stylized architecture, not a pixel-identical reconstruction of the shaded three-view illustration.']
    info['byteBudgetException']='3.05 MiB, about 52 KiB above the preferred 3 MiB sample target after adding solid ceramic gable caps. No runtime approval.'
    info['knownLimitations']=[
        'Fine grazing-angle stippling is still visible in the right orthographic studio render above the ceramic gable cap; no further geometry iteration in this isolated comparison study.',
        'This is clean stylized architecture, not a pixel-identical reconstruction of the shaded three-view illustration.'
    ]
    (HERE/'asset-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('QUALITY_STUDY_EXPORT',json.dumps(info),flush=True)
    render_glb(glb)

def render_glb(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
    scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Warm neutral studio');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
    center=Vector((0,0,1.5))
    for name,pos,power,size in [('Key',(-3,-4,7),500,4),('Fill',(4,-1,5),220,4),('Rim',(-2,4,6),380,3)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
        ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
    floor_mat=material('Review floor','E4DECD',.9)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));bpy.context.object.data.materials.append(floor_mat)
    data=bpy.data.cameras.new('Actual exported GLB review');cam=bpy.data.objects.new('Actual exported GLB review',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=3.65
    for name,offset in [('front',(0,-8,.25)),('right',(8,0,.35)),('back',(0,8,.25)),('iso',(6,-8,5.3))]:
        cam.location=center+Vector(offset);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        data.ortho_scale=3.65 if name!='iso' else 4.10
        scene.render.filepath=str(HERE/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':build()
