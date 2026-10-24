"""Split an inspected rigid region of an actual neural-derived GLB, adding no faces."""
from pathlib import Path
import argparse,copy,json,struct,hashlib,math
import numpy as np
DTYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
class GLB:
    def __init__(self,path):
        data=Path(path).read_bytes();magic,version,size=struct.unpack_from('<4sII',data)
        if (magic,version,size)!=(b'glTF',2,len(data)):raise ValueError('Invalid GLB')
        n,kind=struct.unpack_from('<II',data,12);self.doc=json.loads(data[20:20+n]);offset=20+n
        length,kind=struct.unpack_from('<II',data,offset);self.blob=bytearray(data[offset+8:offset+8+length])
    def array(self,index):
        a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']];dtype=np.dtype(DTYPES[a['componentType']]);width=WIDTH[a['type']]
        stride=v.get('byteStride',dtype.itemsize*width);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return np.ndarray((a['count'],width),dtype=dtype,buffer=self.blob,offset=offset,strides=(stride,dtype.itemsize)).copy()
    def add(self,data,template,target):
        a=copy.deepcopy(template);data=np.asarray(data,dtype=np.dtype(DTYPES[a['componentType']]));width=data.shape[1];raw_width=data.dtype.itemsize*width
        stride=(raw_width+3)//4*4 if target==34962 else raw_width
        raw=np.zeros((len(data),stride),dtype=np.uint8);raw[:,:raw_width]=data.view(np.uint8).reshape(len(data),raw_width)
        while len(self.blob)%4:self.blob.append(0)
        view={'buffer':0,'byteOffset':len(self.blob),'byteLength':raw.size}
        if target is not None:view['target']=target
        if stride!=raw_width:view['byteStride']=stride
        self.blob.extend(raw.tobytes());self.doc['bufferViews'].append(view)
        a.update(bufferView=len(self.doc['bufferViews'])-1,byteOffset=0,count=len(data));a.pop('sparse',None)
        if 'min' in a:a['min']=data.min(axis=0).tolist()
        if 'max' in a:a['max']=data.max(axis=0).tolist()
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def image_hashes(self):
        rows=[]
        for image in self.doc.get('images',[]):
            v=self.doc['bufferViews'][image['bufferView']];b=self.blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
            rows.append(hashlib.sha256(b).hexdigest())
        return rows
    def compact(self):
        used=set()
        for mesh in self.doc['meshes']:
            for primitive in mesh['primitives']:used.update(primitive['attributes'].values());used.add(primitive['indices'])
        for animation in self.doc.get('animations',[]):
            for sampler in animation['samplers']:used.update((sampler['input'],sampler['output']))
        mapping={old:new for new,old in enumerate(sorted(used))}
        self.doc['accessors']=[self.doc['accessors'][i] for i in sorted(used)]
        for mesh in self.doc['meshes']:
            for primitive in mesh['primitives']:
                primitive['attributes']={key:mapping[value] for key,value in primitive['attributes'].items()};primitive['indices']=mapping[primitive['indices']]
        for animation in self.doc.get('animations',[]):
            for sampler in animation['samplers']:
                sampler['input']=mapping[sampler['input']];sampler['output']=mapping[sampler['output']]
        used_views=sorted({a['bufferView'] for a in self.doc['accessors']}|{i['bufferView'] for i in self.doc.get('images',[])})
        view_map={old:new for new,old in enumerate(used_views)};output=bytearray();views=[]
        for old in used_views:
            view=copy.deepcopy(self.doc['bufferViews'][old]);start=view.get('byteOffset',0)
            while len(output)%4:output.append(0)
            view['byteOffset']=len(output);output.extend(self.blob[start:start+view['byteLength']]);views.append(view)
        for a in self.doc['accessors']:a['bufferView']=view_map[a['bufferView']]
        for image in self.doc.get('images',[]):image['bufferView']=view_map[image['bufferView']]
        self.doc['bufferViews']=views;self.blob=output
    def save(self,path):
        self.doc['buffers']=[{'byteLength':len(self.blob)}]
        text=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode('utf-8');text+=b' '*((-len(text))%4)
        binary=bytes(self.blob)+b'\0'*((-len(self.blob))%4);size=12+8+len(text)+8+len(binary)
        Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,size)+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary)
def frame(axis):
    axis=np.asarray(axis,dtype=np.float64);axis/=np.linalg.norm(axis);z=np.array([0.,0.,1.]);cross=np.cross(z,axis);dot=np.dot(z,axis)
    if dot<-.99999:raise ValueError('Choose the positive axle direction')
    q=np.r_[cross/math.sqrt(2*(1+dot)),math.sqrt((1+dot)/2)]
    k=np.array([[0,-cross[2],cross[1]],[cross[2],0,-cross[0]],[-cross[1],cross[0],0]])
    return np.eye(3)+k+k@k/(1+dot),q
def split(source,output,config):
    glb=GLB(source);before_images=glb.image_hashes();doc=glb.doc
    mesh_nodes=[(i,node) for i,node in enumerate(doc['nodes']) if 'mesh' in node]
    if len(mesh_nodes)!=1 or len(doc['meshes'][mesh_nodes[0][1]['mesh']]['primitives'])!=1:raise ValueError('Expected one verified near body primitive')
    node_index,node=mesh_nodes[0]
    if any(key in node for key in ('matrix','translation','rotation','scale')):raise ValueError('Mesh node must already have baked identity transform')
    primitive=doc['meshes'][node['mesh']]['primitives'][0];positions=glb.array(primitive['attributes']['POSITION']);indices=glb.array(primitive['indices']).reshape(-1,3)
    center=np.asarray(config['center'],dtype=np.float64);rotation,quaternion=frame(config['axis'])
    selection_center=np.asarray(config.get('selectionCenter',config['center']),dtype=np.float64)
    coordinates=(positions-selection_center)@rotation;centroids=coordinates[indices].mean(axis=1)
    if config.get('shape')=='box':
        world_centroids=positions[indices].mean(axis=1)
        mask=np.all(world_centroids>=np.asarray(config['min']),axis=1)&np.all(world_centroids<=np.asarray(config['max']),axis=1)
    else:
        mask=(np.linalg.norm(centroids[:,:2],axis=1)<config['radius'])&(centroids[:,2]>=config['depth'][0])&(centroids[:,2]<=config['depth'][1])
    if config.get('radialDepthBands'):
        radial=np.linalg.norm(centroids[:,:2],axis=1)
        for band in config['radialDepthBands']:
            region=(radial>=band['minRadius'])&(radial<band['maxRadius'])
            mask[region]=(centroids[region,2]>=band['depth'][0])&(centroids[region,2]<=band['depth'][1])
    # Subtract inspected stationary support regions; this only partitions existing faces.
    world_centroids=positions[indices].mean(axis=1)
    for region in config.get('excludeBoxes',[]):
        excluded=np.all(world_centroids>=np.asarray(region['min']),axis=1)&np.all(world_centroids<=np.asarray(region['max']),axis=1)
        mask &= ~excluded
    if config.get('crossBladeHalfWidth'):
        # Measured four-blade footprint keeps the tower facade outside the rotor.
        u,v=centroids[:,0],centroids[:,1]
        blade_distance=np.minimum(np.abs(u-v),np.abs(u+v))/math.sqrt(2)
        radial=np.linalg.norm(centroids[:,:2],axis=1)
        mask &= (blade_distance<config['crossBladeHalfWidth']+radial*config.get('crossBladeWidthSlope',0))|(radial<config.get('hubRadius',.05))
    if config.get('innerAxleCut'):
        region=config['innerAxleCut']
        mask &= (np.linalg.norm(centroids[:,:2],axis=1)>region['radius'])|(centroids[:,2]>region['minDepth'])
    if config.get('keepLargestConnected'):
        # Exact-position welding reconnects UV seam duplicates only for adjacency.
        _,welded=np.unique(np.round(positions,6),axis=0,return_inverse=True)
        chosen_ids=np.flatnonzero(mask);faces=welded[indices[mask]];parents={}
        def find(i):
            i=int(i);parents.setdefault(i,i)
            while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
            return i
        for face in faces:
            a=find(face[0])
            for b in face[1:]:parents[find(b)]=a
        labels=np.array([find(face[0]) for face in faces]);groups,counts=np.unique(labels,return_counts=True)
        mask[chosen_ids[labels!=groups[np.argmax(counts)]]]=False
    if not 100<mask.sum()<len(mask)*.45:raise ValueError('Rigid selection is empty or includes too much of the building')
    meshes=[];roundtrip_error=0
    for moving,chosen in ((False,indices[~mask]),(True,indices[mask])):
        vertices,inverse=np.unique(chosen.reshape(-1),return_inverse=True);attributes={}
        for semantic,accessor in primitive['attributes'].items():
            template=doc['accessors'][accessor];array=glb.array(accessor)[vertices]
            if moving and semantic=='POSITION':
                array=((array-center)@rotation).astype(np.float32)
                roundtrip_error=float(np.max(np.abs(array@rotation.T+center-positions[vertices])))
            elif moving and semantic in ('NORMAL','TANGENT'):
                factor=127 if template['componentType']==5120 else 32767 if template['componentType']==5122 else 1
                result=(array[:,:3].astype(np.float64)/factor)@rotation
                if factor!=1:result=np.rint(np.clip(result,-1,1)*factor)
                array=array.copy();array[:,:3]=result.astype(array.dtype)
            attributes[semantic]=glb.add(array,template,34962)
        index=glb.add(inverse.astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963)
        part=copy.deepcopy(primitive);part.update(attributes=attributes,indices=index)
        meshes.append({'name':config['name'] if moving else doc['meshes'][node['mesh']].get('name','body'),'primitives':[part]})
    doc['meshes']=meshes;node['mesh']=0
    mover={'name':config['name'],'mesh':1,'translation':center.tolist(),'rotation':quaternion.tolist(),'extras':{'lifePart':config['lifePart'],'geometryOrigin':'Existing neural-derived faces only; rigid separation, no new faces','selectionConfig':config}}
    parent=next(n for n in doc['nodes'] if node_index in n.get('children',[]));parent['children'].append(len(doc['nodes']));doc['nodes'].append(mover)
    glb.compact();glb.save(output);after=GLB(output)
    if before_images!=after.image_hashes() or roundtrip_error>1e-6:raise RuntimeError('Appearance provenance verification failed')
    return {'source':{'path':str(source),'sha256':digest(source)},'output':{'path':str(output),'sha256':digest(output),'bytes':Path(output).stat().st_size},'staticTriangles':int((~mask).sum()),'movingTriangles':int(mask.sum()),'triangleTotalPreserved':len(mask),'poseZeroMaxPositionError':roundtrip_error,'embeddedImageHashesUnchanged':True,'selection':config,'driver':'scene-life; no autoplay GLTF clip','newFacesAdded':0}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--config',type=Path);parser.add_argument('--output',type=Path);args=parser.parse_args()
    if not args.config:
        glb=GLB(args.source);print(json.dumps({'nodes':glb.doc['nodes'],'meshes':glb.doc['meshes'],'positionBounds':[{'min':a.get('min'),'max':a.get('max')} for a in glb.doc['accessors'] if a['type']=='VEC3' and a['componentType']==5126]},ensure_ascii=False,indent=2));return
    if not args.output or args.output.resolve()==args.source.resolve():raise ValueError('Write a new part candidate before replacing the reviewed static export')
    report=split(args.source,args.output,json.loads(args.config.read_text('utf-8')));args.output.with_suffix('.part.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
