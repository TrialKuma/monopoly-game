// The movement graph stays fixed; these authored streets set the physical town.
import { harborWalkSetback } from './scene-harbor-landmarks.js?v=20261025-harbor-main-island1';
const STEP=1.8,STREET_PARCELS={};
const unit=([x,z])=>{const length=Math.hypot(x,z);return[x/length,z/length];};
function place(index,walk,normal){STREET_PARCELS[index]={walk:[...walk],normal:unit(normal)};}
function street(indices,start,direction,distances){
 const tangent=unit(direction),normal=[-tangent[1],tangent[0]];let walk=[...start];
 indices.forEach((index,i)=>{if(i){const distance=distances[i-1];walk=[walk[0]+tangent[0]*distance,walk[1]+tangent[1]*distance];}place(index,walk,normal);});return walk;
}
// A broad cross-town S. The middle street crosses the island rather than
// extending its length. Estate pairs retain 1.30 grid units of frontage.
const lower=unit([-4.2,-5.6]),middle=unit([7.3,-2.8]),upper=unit([-3,-6]);
const middleStart=street([28,29,30,31,32,33,0],[8,16.6],lower,[1.2,1.1,1.3,1.1,1.1,1.2]);
const upperStart=street([0,1,2,3,4,5],middleStart,middle,[1.6,1.3,1.3,1.3,1.7]);
street([5,6,7,8,9,10,11],upperStart,upper,[1.3,1.1,1.3,1.1,1.18,1.22]);
// Homes on both sides make a town frontage instead of one thin row of houses.
for(const index of [29,32,1,4,6])STREET_PARCELS[index].normal=STREET_PARCELS[index].normal.map(v=>-v);
STREET_PARCELS[0].normal=unit([-lower[1]-middle[1],lower[0]+middle[0]]);
STREET_PARCELS[5].normal=unit([middle[1]+upper[1],-middle[0]-upper[0]]);
STREET_PARCELS[11].normal=[0,1];STREET_PARCELS[28].normal=[0,-1];
// Two coastal crescents form a round outer circuit. Each building follows
// the local tangent of the coast; no individual lot bends the roadway.
const coast={x:8,z:9.2,rx:9.8,rz:8.5};
const merchantAngles=[-118,-137,-155,-173,-191,-209,-227,-242];
const resortAngles=[-62,-43,-25,-7,11,29,47,62];
for(const [start,angles] of [[12,merchantAngles],[20,resortAngles]])angles.forEach((degrees,i)=>{const a=degrees*Math.PI/180;place(start+i,[coast.x+Math.cos(a)*coast.rx,coast.z+Math.sin(a)*coast.rz],[-Math.cos(a)/coast.rx,-Math.sin(a)/coast.rz]);});
export function harborCoastLayout(){return{...coast,merchantAngles:[...merchantAngles],resortAngles:[...resortAngles]};}
export function harborVisualPosition(tile){const pose=STREET_PARCELS[tile.index],setback=harborWalkSetback(tile)/STEP;return pose?{x:pose.walk[0]-pose.normal[0]*setback,y:pose.walk[1]-pose.normal[1]*setback}:{x:tile.x,y:tile.y};}
export function harborStreetPosition(tile){const p=STREET_PARCELS[tile.index]?.walk;return p?{x:p[0],y:p[1]}:{x:tile.x,y:tile.y};}
export function harborParcelRotation(tile){const n=STREET_PARCELS[tile.index]?.normal;return n?Math.atan2(n[0],n[1]):null;}
export function harborWalkOffset(tile,THREE){const [x,z]=STREET_PARCELS[tile.index]?.normal||[0,1],s=harborWalkSetback(tile);return new THREE.Vector3(x*s,0,z*s);}
export function harborEdgePath(fromIndex,toIndex,stepViews){const a=stepViews.get(fromIndex),b=stepViews.get(toIndex);return a&&b?[a.walk.clone(),b.walk.clone()]:[];}
