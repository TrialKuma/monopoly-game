"""Preserve boundaries, normals and topology when reducing an approved AI near mesh."""
from pathlib import Path
import argparse,json,sys,shutil,importlib.metadata
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime/packages'))
import pymeshlab
from neural_component import GLB,digest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--triangles',type=int,default=6000);args=parser.parse_args()
    g=GLB(args.source);nodes=[n for n in g.doc['nodes'] if 'mesh' in n]
    if len(nodes)!=1 or any(k in nodes[0] for k in ('matrix','translation','rotation','scale')):raise RuntimeError('Expected baked identity near body')
    primitive=g.doc['meshes'][nodes[0]['mesh']]['primitives'][0]
    positions=g.array(primitive['attributes']['POSITION']).astype(np.float64);faces=g.array(primitive['indices']).reshape(-1,3)
    vertices,inverse=np.unique(positions,axis=0,return_inverse=True);faces=inverse[faces]
    settings={'targetfacenum':args.triangles,'qualitythr':.3,'preserveboundary':True,'boundaryweight':20.,'preservenormal':True,'preservetopology':True,'optimalplacement':True,'planarquadric':True,'planarweight':.01,'autoclean':True}
    ms=pymeshlab.MeshSet();ms.add_mesh(pymeshlab.Mesh(vertices,faces.astype(np.int32)))
    ms.apply_filter('meshing_decimation_quadric_edge_collapse',**settings)
    reduced=ms.current_mesh();args.output.parent.mkdir(parents=True,exist_ok=True)
    np.savez(args.output,vertices=reduced.vertex_matrix(),faces=reduced.face_matrix())
    snapshot=Path(__file__).resolve().parents[1]/'reports/tool-snapshots'/(digest(__file__)+'-'+Path(__file__).name)
    if not snapshot.exists():shutil.copy2(__file__,snapshot)
    report={'source':{'path':str(args.source.resolve()),'sha256':digest(args.source)},'output':str(args.output.resolve()),'outputSha256':digest(args.output),'tool':{'path':str(snapshot),'sha256':digest(snapshot),'pymeshlabVersion':importlib.metadata.version('pymeshlab')},'sourceTriangles':len(faces),'actualTriangles':reduced.face_number(),'actualVertices':reduced.vertex_number(),'method':'PyMeshLab quadric collapse preserving boundary, normal and topology with planar quadrics','settings':settings,'geometryOrigin':'Only existing approved neural-derived surface simplified; no authored geometry'}
    args.output.with_suffix('.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
