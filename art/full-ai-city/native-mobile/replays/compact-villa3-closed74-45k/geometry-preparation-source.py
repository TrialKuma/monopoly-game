"""Close the 74 reviewed single-triangle gaps in one frozen voxel-derived LOD.

This is deliberately asset/hash scoped. It is not a general hole filler and
must not close architectural openings or be applied to arbitrary source meshes.
No inference, remeshing, moved vertices or existing face/texture edits occur.
"""
from pathlib import Path
import copy, json, shutil, struct, sys
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from prepare_triptych import ART, atomic_json, evidence, sha


def read_glb(path):
    data=Path(path).read_bytes()
    assert struct.unpack_from('<III', data)==(0x46546C67, 2, len(data))
    size, kind=struct.unpack_from('<II', data, 12); assert kind==0x4E4F534A
    doc=json.loads(data[20:20+size]); pos=20+size
    size, kind=struct.unpack_from('<II', data, pos); assert kind==0x004E4942
    return doc, data[pos+8:pos+8+size]


def accessor(doc, binary, index):
    a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and not v.get('byteStride')
    types={5126:'<f4',5125:'<u4',5123:'<u2'}
    width={'VEC3':3,'SCALAR':1}[a['type']]
    return np.frombuffer(binary,dtype=types[a['componentType']],count=a['count']*width,
                         offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)


def main():
    old_dir=ART/'native-mobile/replays/compact-villa3-b7e7f6ca4c4b-fine0015-45k-low-6bda0c3a3e62'
    proof=json.loads((old_dir/'geometry-source-proof.json').read_text('utf8'))
    expected='6bda0c3a3e62f4f4803a31aa627e06ae2edf4e4dc88f982415f4f66114ed2f67'
    assert proof['candidate']['sha256']==expected and sha(proof['candidate']['path'])==expected
    assert sha(proof['output']['path'])==proof['output']['sha256']
    old_report=json.loads(Path(proof['candidateReport']['path']).read_text('utf8'))
    assert old_report['derivation']['voxelSize']==.0015
    assert old_report['derivation']['remeshedTriangles']==12133624
    doc,binary=read_glb(proof['candidate']['path'])
    assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0]
    coords=accessor(doc,binary,primitive['attributes']['POSITION']).astype(np.float64)
    original_indices=accessor(doc,binary,primitive['indices']).reshape(-1,3)
    # Reuse the already verified inverse normalization, with identical arithmetic.
    blender=coords[:,[0,2,1]].copy(); blender[:,1]*=-1
    raw=(np.column_stack([blender,np.ones(len(blender))])@np.array(proof['inverse']).T)[:,:3]
    native=raw[:,[0,2,1]].copy(); native[:,2]*=-1; native[:,[0,2]]*=-1
    unique, inverse=np.unique(native.astype(np.float32),axis=0,return_inverse=True)
    frozen=np.load(proof['output']['path']); verts=frozen['vertices']; faces=frozen['faces']
    assert np.array_equal(unique,verts) and np.array_equal(inverse[original_indices],faces)
    assert len(faces)==44926
    edges={}
    for face in faces.tolist():
        for a,b in zip(face,face[1:]+face[:1]): edges.setdefault(tuple(sorted((a,b))),[]).append((a,b))
    assert all(len(v) in (1,2) for v in edges.values())
    boundary={key:rows[0] for key,rows in edges.items() if len(rows)==1}
    adjacency={}
    for a,b in boundary:
        adjacency.setdefault(a,set()).add(b); adjacency.setdefault(b,set()).add(a)
    assert len(boundary)==222 and all(len(n)==2 for n in adjacency.values())
    added=[]; components=[]; remaining=set(boundary)
    # All 74 are tiny isolated triangular boundaries after closed voxel remeshing.
    # Do not generalize this to larger loops, source windows or courtyard openings.
    while remaining:
        edge=min(remaining); a,b=boundary[edge]
        others=adjacency[a]-{b}; assert len(others)==1; c=next(iter(others))
        keys={tuple(sorted(x)) for x in [(a,b),(b,c),(c,a)]}
        assert keys<=remaining and adjacency[c]=={a,b}
        triangle=[a,c,b]  # Opposite winding to every adjacent boundary edge.
        assert all(boundary[tuple(sorted((x,y)))]==(y,x)
                   for x,y in zip(triangle,triangle[1:]+triangle[:1]))
        points=coords[np.array([np.flatnonzero(inverse==i)[0] for i in triangle])]
        perimeter=float(sum(np.linalg.norm(points[i]-points[(i+1)%3]) for i in range(3)))
        area=float(np.linalg.norm(np.cross(points[1]-points[0],points[2]-points[0]))/2)
        assert 0<perimeter<.08 and 0<area<.00021
        added.append(triangle); components.append({'vertices':triangle,'perimeter':perimeter,'area':area})
        remaining-=keys
    assert len(added)==74
    updated_faces=np.concatenate([faces,np.asarray(added,dtype=np.int32)])
    all_edges=np.sort(np.concatenate([updated_faces[:,[0,1]],updated_faces[:,[1,2]],updated_faces[:,[2,0]]]),axis=1)
    assert np.all(np.unique(all_edges,axis=0,return_counts=True)[1]==2)
    work=ART/'work/compact-villa3-closed74-45k'; work.mkdir(parents=True,exist_ok=False)
    snapshot=work/Path(__file__).name; shutil.copy2(__file__,snapshot)
    representatives=np.full(len(verts),-1,dtype=np.int32)
    for i,j in enumerate(inverse):
        if representatives[j]<0: representatives[j]=i
    appended_indices=representatives[np.asarray(added,dtype=np.int32)]
    all_indices=np.concatenate([original_indices,appended_indices]).astype('<u4')
    append_offset=len(binary); assert append_offset%4==0
    new_binary=binary+all_indices.tobytes()
    index_view=len(doc['bufferViews']); doc['bufferViews'].append({'buffer':0,'byteOffset':append_offset,'byteLength':all_indices.nbytes,'target':34963})
    index_accessor=len(doc['accessors']); doc['accessors'].append({'bufferView':index_view,'componentType':5125,'count':all_indices.size,'type':'SCALAR'})
    primitive['indices']=index_accessor; doc['buffers'][0]['byteLength']=len(new_binary)
    for node in doc['nodes']:
        if 'geometryOrigin' in node.get('extras',{}):node['extras']['geometryOrigin']='Neural source-derived voxel LOD with 74 explicitly recorded single-triangle reduction-gap closures; all original vertex attributes and triangles preserved.'
    json_bytes=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf8');json_bytes+=b' '*((-len(json_bytes))%4)
    candidate=work/'villa_3.glb'
    candidate.write_bytes(struct.pack('<III',0x46546C67,2,28+len(json_bytes)+len(new_binary))+struct.pack('<II',len(json_bytes),0x4E4F534A)+json_bytes+struct.pack('<II',len(new_binary),0x004E4942)+new_binary)
    check_doc,check_bin=read_glb(candidate)
    assert check_bin[:len(binary)]==binary
    assert np.array_equal(accessor(check_doc,check_bin,index_accessor)[:original_indices.size].reshape(-1,3),original_indices)
    surface=work/'surface.npz';np.savez(surface,vertices=verts,faces=updated_faces)
    method='Close 74 reviewed isolated single-triangle gaps introduced by reduction of a closed voxel surface. Existing 44,926 faces, all vertices, original vertex attributes and image bytes remain exact. No remesh or new inference; original neural field will resample the repaired 45,000-face surface.'
    repair={'method':method,'sourceCandidate':proof['candidate'],'sourceReport':proof['candidateReport'],
            'sourceSurface':proof['output'],'originalSurfaceProof':evidence(old_dir/'geometry-source-proof.json'),
            'output':evidence(candidate),'surface':evidence(surface),'tool':evidence(snapshot),
            'originalTriangles':44926,'newTriangles':74,'finalTriangles':45000,'newVertices':0,
            'originalTrianglesDeleted':0,'originalVerticesMoved':0,'originalBinaryPrefixBytes':len(binary),
            'originalBinaryPrefixUnchanged':True,'closedSurfaceEdgeIncidence':2,'components':components}
    receipt=work/'repair.json';atomic_json(receipt,repair)
    link={'receipt':evidence(receipt),'method':method,'sourceCandidate':proof['candidate'],'output':evidence(candidate),'newTriangles':74}
    low=copy.deepcopy(old_report);low.update(processedCandidate=evidence(candidate),triangles=45000,lowSurfaceRepair=link,
        geometryOrigin=method,processingTool=evidence(snapshot),status='geometry_repaired_pending_native_field')
    low['derivation']['finalTriangles']=45000;low['derivation']['lowSurfaceRepair']=link
    low['glbValidation']['triangles']=45000
    low.pop('renderedCandidate',None);low.pop('quantization',None)
    low['bake']={'method':'Historical low preview UVs only; added faces require fresh sampling of the original neural field before review. Not an approved texture transfer.'}
    report=work/'villa_3.json';atomic_json(report,low)
    new_proof=copy.deepcopy(proof);new_proof.update(method=method,candidate=evidence(candidate),candidateReport=evidence(report),
        originalCandidate=proof['candidate'],output=evidence(surface),triangles=45000,tool=evidence(snapshot),toolSnapshot=evidence(snapshot),
        lowSurfaceRepair=link,reusedNormalizationProof=evidence(old_dir/'geometry-source-proof.json'))
    new_proof.pop('originalReceipt',None);atomic_json(surface.with_suffix('.json'),new_proof)
    request=ART/'queue/native-export-replays/compact-villa3-closed74-45k.json'
    assert not request.exists()
    atomic_json(request,{'status':'requested','sourceReceipt':proof['fieldReceipt']['path'],'triangles':45000,'textureSize':1024,
                         'surfaceNPZ':str(surface),'purpose':method})
    print(json.dumps({'work':str(work),'candidate':evidence(candidate),'newTriangles':74,'request':str(request)}))


if __name__=='__main__':main()
