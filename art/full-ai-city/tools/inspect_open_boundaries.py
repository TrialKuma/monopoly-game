"""Read-only boundary diagnosis for a native model before any local repair."""
from pathlib import Path
import argparse, json
import numpy as np
from neural_component import GLB, digest


def inspect(path):
    g = GLB(path)
    if len(g.doc['meshes']) != 1 or len(g.doc['meshes'][0]['primitives']) != 1:
        raise ValueError('Inspect a single unpartitioned native body')
    primitive = g.doc['meshes'][0]['primitives'][0]
    positions = g.array(primitive['attributes']['POSITION']).astype(np.float64)
    vertices, inverse = np.unique(positions, axis=0, return_inverse=True)
    faces = inverse[g.array(primitive['indices']).reshape(-1, 3)]
    edges = np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    edges.sort(axis=1)
    edges, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = edges[counts == 1]
    adjacency = {}
    for a,b in boundary:
        adjacency.setdefault(int(a),set()).add(int(b))
        adjacency.setdefault(int(b),set()).add(int(a))
    remaining = set(adjacency)
    loops = []
    while remaining:
        start = min(remaining)
        stack = [start]; component = set()
        while stack:
            current = stack.pop()
            if current in component: continue
            component.add(current);stack.extend(adjacency[current]-component)
        remaining -= component
        closed = all(len(adjacency[v]) == 2 for v in component)
        order = [start]
        if closed:
            previous = None;current = start
            while True:
                next_vertex = min(adjacency[current]-({previous} if previous is not None else set()))
                if next_vertex == start: break
                order.append(next_vertex);previous,current = current,next_vertex
        else: order = sorted(component)
        points = vertices[order]
        local_edges = [(a,b) for a in component for b in adjacency[a] if a < b]
        perimeter = sum(float(np.linalg.norm(vertices[a]-vertices[b])) for a,b in local_edges)
        _, singular, _ = np.linalg.svd(points-points.mean(0),full_matrices=False)
        loops.append({'closed':closed,'vertices':len(component),'perimeter':perimeter,
                      'min':points.min(0).tolist(),'max':points.max(0).tolist(),
                      'centroid':points.mean(0).tolist(),'planarityRatio':float(singular[-1]/max(singular[0],1e-12)),
                      'vertexIndices':order})
    return {'source':{'path':str(path.resolve()),'sha256':digest(path)},
            'coordinateSystem':'Original mesh accessor coordinates, before node transforms',
            'geometryChanged':False,'originalVertices':len(positions),'exactPositionVertices':len(vertices),
            'boundaryEdges':len(boundary),'nonmanifoldEdges':int((counts>2).sum()),
            'loops':sorted(loops,key=lambda row:row['perimeter'],reverse=True)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
    args = parser.parse_args();report = inspect(args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2),'utf-8')
    print(json.dumps({**{k:v for k,v in report.items() if k!='loops'},'loops':[{k:v for k,v in row.items() if k!='vertexIndices'} for row in report['loops'][:20]]},indent=2))
