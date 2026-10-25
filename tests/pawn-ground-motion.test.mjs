import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';

// Exercise the production animation independently of WebGL/frame scheduling.
const source=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8');
const context=vm.createContext({THREE});
vm.runInContext(source.slice(source.indexOf('function pawnTravelProgress('),source.indexOf('function update(data)')),context);
const run=(view,time,delta=1/60)=>{Object.assign(context,{view,time,delta});vm.runInContext('updatePawnMotion(view,time,delta)',context);};
const vector=([x,z])=>new THREE.Vector3(x,.265,z);
function view(points,duration=800,teleport=false){
 const path=points.map(vector),group=new THREE.Group();group.position.copy(path[0]);
 const lengths=path.slice(1).map((point,i)=>point.distanceTo(path[i]));
 return {group,from:path[0].clone(),target:path.at(-1).clone(),path,pathLengths:lengths,pathLength:lengths.reduce((a,b)=>a+b,0),started:0,duration,active:true,teleport,facing:.6};
}
for(const points of [[[0,0],[10,4]],[[10,4],[0,0]],[[0,0],[3,0],[3,6]]]){
 const v=view(points),samples=[];
 for(let time=0;time<=800;time+=10){run(v,time,.01);samples.push(v.group.position.clone());assert.equal(v.group.position.y,.265,'walking stays grounded');assert.equal(v.group.scale.x,1,'walking never shrinks the pawn');}
 assert(v.group.position.distanceTo(v.target)<1e-10);assert.equal(v.active,false);
 const last=points.at(-1),prior=points.at(-2),facing=Math.atan2(last[0]-prior[0],last[1]-prior[1]);
 assert(Math.abs(v.group.rotation.y-facing)<1e-10,'arrival keeps travel direction');
 if(points.length===2){const distances=samples.slice(20,61).map((p,i,a)=>i?p.distanceTo(a[i-1]):null).slice(1);assert(Math.max(...distances)-Math.min(...distances)<1e-10,'long crossing has a steady middle pace');}
}
{
 const v=view([[0,0],[10,4]],470,true),initialFacing=v.facing;
 run(v,117.5);assert(v.group.position.equals(v.from));assert(Math.abs(v.group.scale.x-.55)<1e-10);
 run(v,235);assert(v.group.position.equals(v.target));assert(Math.abs(v.group.scale.x-.1)<1e-10);
 run(v,470);assert(v.group.position.equals(v.target));assert.equal(v.group.scale.x,1);assert.equal(v.group.rotation.y,initialFacing);assert.equal(v.active,false);
}
for(const teleport of [false,true]){
 const v=view([[0,0],[10,4]],0,teleport);run(v,0);
 assert(v.group.position.equals(v.target));assert.equal(v.active,false);assert.equal(v.group.scale.x,1);
}
console.log('PASS grounded forward/reverse/bent paths, steady bridge pace, exact arrival/facing, teleport and reduced motion');
