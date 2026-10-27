"""Soft local ceramic shading without a fragmented roof texture atlas.

COLOR_0 remains the exact authored palette, including ownership-mask colors.
The scalar ambient occlusion is interpolated on the real tile geometry through
one continuous UV ramp. There is no directional illumination baked here.
"""
from array import array
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MIN_AO=.68
ROUGHNESS=.43
SAMPLES=64
RADIUS=.10
OFFSET=.003

def roof_objects(root):
    return [obj for obj in root.children_recursive if obj.type=='MESH' and obj.data.polygons
            and all(obj.data.materials[p.material_index].name.endswith(' / roof ceramic') for p in obj.data.polygons)]

def ambient_uv(root,objects,folder,scale=1):
    """Trace bounded cosine-weighted AO at corners, retaining every face/normal."""
    bpy.context.view_layer.update()
    vertices=[];triangles=[]
    for obj in [root,*root.children_recursive]:
        if obj.type!='MESH':continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangles.extend(tuple(offset+i for i in face.vertices) for face in obj.data.loop_triangles)
    tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True,epsilon=1e-7*scale)
    # A fixed low-discrepancy cosine distribution avoids random speckling.
    directions=[]
    for i in range(SAMPLES):
        r=math.sqrt((i+.5)/SAMPLES);angle=i*math.pi*(3-math.sqrt(5))
        directions.append((r*math.cos(angle),r*math.sin(angle),math.sqrt(1-r*r)))
    cache={};values=[];radius=RADIUS*scale;offset=OFFSET*scale
    for obj in objects:
        # This UV layer stores a scalar, not dozens of separate texture islands.
        for layer in list(obj.data.uv_layers):obj.data.uv_layers.remove(layer)
        uv=obj.data.uv_layers.new(name='RoofAmbient');uv.active_render=True
        normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
        for loop in obj.data.loops:
            point=obj.matrix_world@obj.data.vertices[loop.vertex_index].co
            normal=(normal_matrix@obj.data.corner_normals[loop.index].vector).normalized()
            key=(*[round(v/scale,6) for v in point],*[round(v,5) for v in normal])
            ao=cache.get(key)
            if ao is None:
                reference=Vector((0,0,1)) if abs(normal.z)<.95 else Vector((0,1,0))
                tangent=reference.cross(normal).normalized();bitangent=normal.cross(tangent)
                start=point+normal*offset;occluded=0
                for x,y,z in directions:
                    hit,_,_,distance=tree.ray_cast(start,tangent*x+bitangent*y+normal*z,radius)
                    if hit is not None:
                        # A smooth distance falloff keeps large roof areas open;
                        # only actual tile lips and contacts get gentle depth.
                        t=distance/radius;occluded+=(1-t)*(1-t)
                ao=max(MIN_AO,1-.65*occluded/SAMPLES);cache[key]=ao
            values.append(ao)
            fraction=(ao-MIN_AO)/(1-MIN_AO)
            uv.data[loop.index].uv=((.5+fraction*255)/256,.5)
    image=bpy.data.images.new(root.name+' roof ambient ramp',width=256,height=1,alpha=False)
    image.colorspace_settings.name='Non-Color'
    pixels=array('f')
    for i in range(256):
        shade=MIN_AO+(1-MIN_AO)*i/255;pixels.extend((shade,shade,shade,1))
    image.pixels.foreach_set(pixels);image.update();image.file_format='PNG'
    image.filepath_raw=str(folder/'roof-ambient.png');image.save();image.pack()
    ordered=sorted(values)
    return image,{'method':'bounded_local_vertex_ao_ramp','roughness':ROUGHNESS,'aoTexture':True,
                  'aoRange':[MIN_AO,1],'radiusAuthorUnits':RADIUS,'offsetAuthorUnits':OFFSET,
                  'samples':SAMPLES,'rampSize':[256,1],'directionalLightingBaked':False,
                  'roofExcludedFromFacadeAtlas':True,'neutralAtlasBackground':True,
                  'sampledAoRange':[min(values),max(values)],
                  'sampledAoQuantiles':[ordered[int((len(ordered)-1)*q)] for q in (.1,.5,.9)],
                  'sampledCorners':len(values),'uniqueSamples':len(cache)}

def attach(material,image):
    nodes=material.node_tree.nodes;links=material.node_tree.links
    # A repeated bounded refresh replaces our AO nodes instead of leaving two
    # competing glTF occlusion outputs in an editable source file.
    for node in list(nodes):
        if node.name.startswith('Roof Ambient '):nodes.remove(node)
    principled=next(node for node in nodes if node.type=='BSDF_PRINCIPLED')
    principled.inputs['Roughness'].default_value=ROUGHNESS;principled.inputs['Metallic'].default_value=0
    uv=nodes.new('ShaderNodeUVMap');uv.name='Roof Ambient UV';uv.uv_map='RoofAmbient'
    tex=nodes.new('ShaderNodeTexImage');tex.name='Roof Ambient Ramp';tex.image=image;tex.interpolation='Linear';tex.extension='EXTEND';links.new(uv.outputs['UV'],tex.inputs['Vector'])
    sep=nodes.new('ShaderNodeSeparateColor');sep.name='Roof Ambient Channel';sep.mode='RGB';links.new(tex.outputs['Color'],sep.inputs[0])
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat').default_value=1
    settings=nodes.new('ShaderNodeGroup');settings.name='Roof Ambient Export';settings.node_tree=group;links.new(sep.outputs['Red'],settings.inputs['Occlusion'])
    material['surfacePolicy']='real ceramic geometry; bounded local AO ramp; no micro-island atlas'
