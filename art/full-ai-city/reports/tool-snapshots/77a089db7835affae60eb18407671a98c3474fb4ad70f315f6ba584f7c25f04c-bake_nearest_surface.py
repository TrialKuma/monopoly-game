"""CPU nearest-surface PBR transfer from a real neural mesh to its own LOD.

No directional cage rays: atlas pixels sample the closest original triangle and
its original UV. This is a standard source-derived texture transfer, not painting.
"""
import time
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

def array(collection,attribute,width,dtype=np.float32):
    out=np.empty(len(collection)*width,dtype=dtype);collection.foreach_get(attribute,out);return out.reshape(-1,width)

def source_image(socket):
    seen=set();todo=[link.from_node for link in socket.links]
    while todo:
        node=todo.pop()
        if node.as_pointer() in seen:continue
        seen.add(node.as_pointer())
        if node.type=='TEX_IMAGE' and node.image:return node.image
        todo.extend(link.from_node for inp in node.inputs for link in inp.links)
    return None

def sample(image,uv):
    width,height=image.size;pixels=np.empty(width*height*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
    q=np.mod(uv,1)*np.array([width,height])-0.5;floor=np.floor(q).astype(np.int32);f=q-floor
    x0=np.mod(floor[:,0],width);x1=np.mod(floor[:,0]+1,width);y0=np.mod(floor[:,1],height);y1=np.mod(floor[:,1]+1,height)
    return (pixels[y0,x0]*(1-f[:,0,None])+pixels[y0,x1]*f[:,0,None])*(1-f[:,1,None])+(pixels[y1,x0]*(1-f[:,0,None])+pixels[y1,x1]*f[:,0,None])*f[:,1,None]

def bake(source,low,args):
    started=time.monotonic();high=source.data;mesh=low.data
    hv=array(high.vertices,'co',3);hf=array(high.loops,'vertex_index',1,np.int32).reshape(-1,3)
    hu=array(high.uv_layers.active.data,'uv',2).reshape(-1,3,2)
    lv=array(mesh.vertices,'co',3);lf=array(mesh.loops,'vertex_index',1,np.int32).reshape(-1,3);lu=array(mesh.uv_layers.active.data,'uv',2).reshape(-1,3,2)
    tree=BVHTree.FromPolygons(hv.tolist(),hf.tolist(),all_triangles=True)
    size=args.texture_size;locations=np.zeros((size,size,3),np.float32);valid=np.zeros((size,size),bool)
    for face,uv in zip(lf,lu):
        q=uv*size-.5;lo=np.maximum(0,np.ceil(q.min(0)).astype(int));hi=np.minimum(size-1,np.floor(q.max(0)).astype(int))
        if np.any(hi<lo):continue
        x,y=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));p=np.stack([x,y],axis=-1)
        a,b,c=q;v0=b-a;v1=c-a;den=v0[0]*v1[1]-v0[1]*v1[0]
        if abs(den)<1e-12:continue
        v2=p-a;u=(v2[:,:,0]*v1[1]-v2[:,:,1]*v1[0])/den;v=(v0[0]*v2[:,:,1]-v0[1]*v2[:,:,0])/den;inside=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
        a,b,c=lv[face];locations[y[inside],x[inside]]=a+(b-a)*u[inside,None]+(c-a)*v[inside,None];valid[y[inside],x[inside]]=True
    points=locations[valid];hits=np.empty_like(points);polygons=np.empty(len(points),np.int32);distances=np.empty(len(points),np.float32)
    for i,point in enumerate(points):
        hit,normal,face,distance=tree.find_nearest(point)
        if hit is None:raise RuntimeError('Nearest original surface not found')
        hits[i]=hit;polygons[i]=face;distances[i]=distance
    tri=hv[hf[polygons]];a=tri[:,0];v0=tri[:,1]-a;v1=tri[:,2]-a;v2=hits-a
    d00=(v0*v0).sum(1);d01=(v0*v1).sum(1);d11=(v1*v1).sum(1);d20=(v2*v0).sum(1);d21=(v2*v1).sum(1);den=d00*d11-d01*d01;den=np.where(abs(den)<1e-20,1e-20,den)
    u=(d11*d20-d01*d21)/den;v=(d00*d21-d01*d20)/den;uv=hu[polygons,0]*(1-u-v)[:,None]+hu[polygons,1]*u[:,None]+hu[polygons,2]*v[:,None]
    original=high.materials[0];bsdf=next(n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    base_image=source_image(bsdf.inputs['Base Color']);orm_image=source_image(bsdf.inputs['Roughness'])
    if base_image is None:raise RuntimeError('Original source has no base-color texture')
    base=sample(base_image,uv);orm=sample(orm_image,uv) if orm_image else np.tile([1,float(bsdf.inputs['Roughness'].default_value),float(bsdf.inputs['Metallic'].default_value),1],(len(uv),1));orm[:,0]=1;orm[:,3]=1
    material=bpy.data.materials.new(args.name+'__nearest_pbr');material.use_nodes=True;low.data.materials.clear();low.data.materials.append(material)
    nodes=material.node_tree.nodes;links=material.node_tree.links;target=nodes.get('Principled BSDF');images={}
    for role,values in [('base',base),('orm',orm)]:
        pixels=np.zeros((size,size,4),np.float32);pixels[valid]=values;pixels[:,:,3]=1;filled=valid.copy()
        for _ in range(3):
            expanded=filled.copy()
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                mask=np.roll(filled,(dy,dx),(0,1))&~expanded;pixels[mask]=np.roll(pixels,(dy,dx),(0,1))[mask];expanded|=mask
            filled=expanded
        image=bpy.data.images.new(args.name+'__nearest_'+role,width=size,height=size,alpha=False);image.colorspace_settings.name='sRGB' if role=='base' else 'Non-Color';image.pixels.foreach_set(pixels.reshape(-1));image.update()
        if role=='orm':image.scale(max(128,size//2),max(128,size//2))
        image.pack();images[role]=image;texture=nodes.new('ShaderNodeTexImage');texture.image=image
        if role=='base':links.new(texture.outputs['Color'],target.inputs['Base Color'])
        else:
            sep=nodes.new('ShaderNodeSeparateColor');links.new(texture.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],target.inputs['Roughness']);links.new(sep.outputs['Blue'],target.inputs['Metallic'])
    distance_quantiles=np.quantile(distances,[.5,.95,.99,1]).tolist();over_two=float((distances>.02).mean())
    return {'method':'CPU closest-original-triangle projection with barycentric original UV and bilinear original texture sampling; geometric normals retained, no directional normal-map rebake or invented color','coveredAtlasPixels':len(points),'nearestLookupSuccessFraction':1.0,'notRayCoverage':True,'sourceDistanceQuantiles':distance_quantiles,'sourceDistanceQuantileLevels':[.5,.95,.99,1],'overTwoPercentMaxEdge':over_two,'distanceReviewRequired':bool(distance_quantiles[2]>.02 or over_two>.01),'visualGeometryReviewRequired':True,'seconds':time.monotonic()-started,'maps':[{'role':k,'size':list(v.size)} for k,v in images.items()]},images
