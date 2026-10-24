import * as THREE from 'three';
import {GLTFLoader} from '/assets/vendor/three/addons/loaders/GLTFLoader.js';

const stage=document.querySelector('#stage'),canvas=document.querySelector('#view'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.setScissorTest(true);
const clay=new THREE.MeshStandardMaterial({color:0xbac3c7,roughness:.8});
const paths=['../../source/alpine--tower_1-a003-pixal-mv-1024-23421.glb','./attempt-011/source/alpine-tower1-single-front-pixal-1024-23421.glb'];
const scenes=[],cameras=[],targets=[];let angle='back',neutral=false,ready=false;
const directions={front:[0,.35,4],right:[4,.35,0],back:[0,.35,-4],left:[-4,.35,0],iso:[2.8,2.6,4],'rear-iso':[-2.8,2.6,-4]};
const loader=new GLTFLoader();
function draw(){
  const width=stage.clientWidth,height=stage.clientHeight;
  renderer.setSize(width,height,false);
  if(!ready)return;
  for(let i=0;i<2;i++){
    const x=Math.floor(i*width/2),w=i===0?Math.floor(width/2):width-x;
    const camera=cameras[i],aspect=w/height;
    camera.left=-.7*Math.max(1,aspect);camera.right=-camera.left;
    camera.top=.7*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();
    camera.position.copy(targets[i]).add(new THREE.Vector3(...directions[angle]));camera.lookAt(targets[i]);
    scenes[i].overrideMaterial=neutral?clay:null;
    renderer.setViewport(x,0,w,height);renderer.setScissor(x,0,w,height);renderer.render(scenes[i],camera);
  }
}
for(const button of document.querySelectorAll('[data-angle]'))button.addEventListener('click',()=>{
  angle=button.dataset.angle;for(const b of document.querySelectorAll('[data-angle]'))b.setAttribute('aria-pressed',String(b===button));draw();
});
document.querySelector('#clay').addEventListener('click',event=>{neutral=!neutral;event.currentTarget.setAttribute('aria-pressed',String(neutral));draw();});
new ResizeObserver(draw).observe(stage);
try{
  // Sequential loading limits the import peak; GPU inference is not performed here.
  for(const path of paths){
    const gltf=await loader.loadAsync(path),pivot=new THREE.Group();pivot.add(gltf.scene);pivot.rotation.y=Math.PI;pivot.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(pivot),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=1/Math.max(size.x,size.y,size.z);pivot.scale.setScalar(scale);pivot.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);pivot.updateMatrixWorld(true);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#52636d');scene.add(pivot);
    scene.add(new THREE.HemisphereLight(0xf1f7ff,0x7d807b,2));
    for(const [x,y,z,intensity] of [[2,4,3,2.2],[-3,2,1,1],[1,3,-3,1.4]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,y,z);scene.add(light);}
    scenes.push(scene);cameras.push(new THREE.OrthographicCamera(-.7,.7,.7,-.7,.01,50));targets.push(new THREE.Vector3(0,size.y*scale*.5,0));
  }
  ready=true;status.textContent='两份原始模型已加载，可切换六个视角与结构检查。';draw();
}catch(error){status.textContent='模型未加载完成：'+error.message;console.error(error);}
