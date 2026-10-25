// Authored footways around the three islands. The same points drive paving,
// bridges and pawn motion; a curved road alone cannot fix walking through a lot.
const STEP = 1.8, SETBACK = 1.04;
const WAYPOINTS = {
  '28:29': [[6,9.5],[5.422222,9.5]],
  '29:30': [[5.422222,9.5],[6.422222,9.5]],
  '32:33': [[6.5,6.4]],
  '33:0': [[6.6,6],[6.6,6.577778]],
  '0:1': [[5.5,6.577778],[5.5,6.25]],
  '5:6': [[5.577778,2.577778]],
  '6:7': [[6.6,2.577778],[6.6,1.577778]],
  '8:9': [[4.577778,1.65],[3.577778,1.65]],
  '15:16': [[3.577778,7]],
  '16:17': [[4.577778,8]],
  '18:19': [[7.422222,1.65],[8.422222,1.65]],
  '19:20': [[8.422222,2]],
  '27:28': [[7.422222,9.5],[6,9.5]],
};

export function harborWalkOffset(tile,THREE) {
  const x=tile.x,y=tile.y;
  // Leave room for the civic hall wings even when two pawns share a pad.
  if(tile.index===1)return new THREE.Vector3(.94,0,0);
  if(tile.index===33)return new THREE.Vector3(-.94,0,0);
  if(x<4.8)return new THREE.Vector3(SETBACK,0,0);
  if(x>7.2)return new THREE.Vector3(-SETBACK,0,0);
  if(x<5.6)return new THREE.Vector3(SETBACK,0,0);
  if(x>6.4)return new THREE.Vector3(-SETBACK,0,0);
  if(y>8&&y<9.5)return new THREE.Vector3(-SETBACK,0,0);
  return new THREE.Vector3(0,0,y>9?-SETBACK:SETBACK);
}

export function harborEdgePath(fromIndex,toIndex,stepViews,THREE) {
  const from=stepViews.get(fromIndex),to=stepViews.get(toIndex);
  if(!from||!to)return [];
  const reverse=!WAYPOINTS[`${fromIndex}:${toIndex}`]&&Boolean(WAYPOINTS[`${toIndex}:${fromIndex}`]);
  const authored=WAYPOINTS[`${fromIndex}:${toIndex}`]||WAYPOINTS[`${toIndex}:${fromIndex}`]||[];
  const origin=stepViews.get(0).center;
  const points=(reverse?[...authored].reverse():authored).map(([x,y])=>new THREE.Vector3(origin.x+(x-6)*STEP,from.walk.y,origin.z+(y-6)*STEP));
  return [from.walk.clone(),...points,to.walk.clone()].filter((point,index,array)=>index===0||point.distanceToSquared(array[index-1])>.000001);
}
