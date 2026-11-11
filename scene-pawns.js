import * as THREE from './assets/vendor/three/three.module.min.js';
import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';

// The two playing pieces, built by art/pawns/build_pawns.py. The file is decoded once and its
// geometry and materials are shared by every board for the life of the page, so none of it goes
// on a map's disposal list.
const FILE='./assets/models/pawns/pawns.glb?v=20261111-pawns1';
// Flat colours shown where a building stands between the camera and the pawn: the player's colour
// with a cream rim, like the name tag above it.
const GHOST={human:'#3fb5ab',ai:'#ee8f6c'},RIM='#fff8e5',RIM_WIDTH=.026;
let pending=null;

// Drawn after the city but before the pawn itself, and only where something nearer is already in
// the depth buffer. The pawn then paints over every part that is actually visible. Left out of
// tone mapping so the colours match the HUD by day and by night.
function ghostMaterial(color,grow=0){
  const material=new THREE.MeshBasicMaterial({color,depthFunc:THREE.GreaterDepth,depthWrite:false,toneMapped:false});
  if(grow){
    material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed+=normalize(normal)*${grow.toFixed(4)};`);};
    material.customProgramCacheKey=()=>`pawn-rim-${grow}`;
  }
  return material;
}

function prepare(gltf){
  const kits={},rim=ghostMaterial(RIM,RIM_WIDTH);
  for(const id of Object.keys(GHOST)){
    const source=gltf.scene.getObjectByName(`pawn_${id}`);
    if(!source)throw new Error(`pawns.glb has no pawn_${id}`);
    source.position.set(0,0,0);
    kits[id]={source,fill:ghostMaterial(GHOST[id])};
  }
  return id=>{
    const kit=kits[id]||kits.ai,root=new THREE.Group(),parts=[];
    root.add(kit.source.clone(true));
    root.traverse(node=>{if(node.isMesh)parts.push(node);});
    for(const part of parts){
      part.castShadow=true;part.receiveShadow=true;part.renderOrder=3;
      for(const [material,order] of [[rim,1],[kit.fill,2]]){
        const ghost=new THREE.Mesh(part.geometry,material);
        ghost.position.copy(part.position);ghost.quaternion.copy(part.quaternion);ghost.scale.copy(part.scale);
        ghost.renderOrder=order;part.parent.add(ghost);
      }
    }
    return root;
  };
}

// Resolves to a function that returns a fresh pawn object for a player id.
export function loadPawnModels(){
  return pending||=new GLTFLoader().loadAsync(FILE).then(prepare).catch(error=>{pending=null;throw error;});
}
