// Close-range landscape surfaces and planting. These details stay inside the
// existing garden or beyond the playable plinth and consume no game RNG.
export function applyMeadowSurface(grass) {
  // Shared by all five regions, including the broad lawns outside the board.
  const compile=grass.onBeforeCompile;
  grass.onBeforeCompile=shader=>{
    compile.call(grass,shader);
    shader.vertexShader='varying vec3 vMeadowPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMeadowPoint=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vMeadowPoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float meadowPatch=sin(vMeadowPoint.x*1.85+sin(vMeadowPoint.z*1.13))*.5+cos(vMeadowPoint.z*2.14-vMeadowPoint.x*.7)*.35;
      diffuseColor.rgb*=.97+meadowPatch*.09;`);
  };
  grass.customProgramCacheKey=()=> 'landscape-meadow-v1';
}
export function enrichDestinationLandscape({THREE,own,garden,root,perimeter,alpine,w,d,innerW,innerD,heroZ}) {
  const {colors:c,noise,add,material,rod,stone,boulder,ribbon,sphere}=garden;
  const waterClock={value:0};
  c.water.userData.landscapeTime=waterClock;
  c.water.name='landscape_water';c.water.roughness=.24;c.water.metalness=.06;
  const waterCompile=c.water.onBeforeCompile;
  c.water.onBeforeCompile=shader=>{
    waterCompile.call(c.water,shader);shader.uniforms.landscapeTime=waterClock;
    shader.vertexShader='varying vec3 vLandscapePoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLandscapePoint=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vLandscapePoint;\nuniform float landscapeTime;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 waterPoint=vLandscapePoint.xz;
      float swell=sin(waterPoint.x*.71+waterPoint.y*.26+landscapeTime*.11)*cos(waterPoint.y*.49-landscapeTime*.08);
      float ripple=sin(waterPoint.y*3.2+waterPoint.x*.72+sin(waterPoint.x*.65+landscapeTime*.09)*.9+sin(waterPoint.y*.47)*1.4-landscapeTime*.32);
      float brokenWave=.5+.5*sin(waterPoint.x*.92+sin(waterPoint.y*.42)+landscapeTime*.08);
      float lightRipple=smoothstep(.94,1.0,ripple)*smoothstep(.40,.90,brokenWave)*.052;
      float openSea=1.0-step(-.25,vLandscapePoint.y);
      float offshore=smoothstep(${(w*.5+1).toFixed(3)},${(w*.5+13).toFixed(3)},max(abs(waterPoint.x),abs(waterPoint.y)*${(w/d).toFixed(5)}))*openSea;
      diffuseColor.rgb*=vec3(1.0-offshore*.27,1.0-offshore*.14,1.0-offshore*.06)*(.94+swell*.065);
      diffuseColor.rgb+=vec3(lightRipple*.7,lightRipple,lightRipple*.96);`);
  };
  c.water.customProgramCacheKey=()=>`landscape-water-v1-${w}-${d}`;
  const foam=material(alpine?'#c3e3d8':'#c6e7d8',{roughness:.34,transparent:true,opacity:.48,depthWrite:false});
  const lavender=material(alpine?'#d5c59a':'#ac8cad'),reed=material(alpine?'#75966b':'#689b88');
  const leafGeometry=own(new THREE.BufferGeometry());
  leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.16,.26,.21,0,.35,.24,.16,.26,.21,0,.31,.64,0,.25,1],3));
  leafGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,.2,.5,.2,1,.2,.5,.6,.5,1],2));
  leafGeometry.setIndex([0,2,1,0,3,2,1,2,4,2,3,4,1,4,5,4,3,5]);leafGeometry.computeVertexNormals();
  reed.side=THREE.DoubleSide;
  function rosette(x,y,z,size,seed,parent=perimeter) {
    for(let i=0;i<9;i++)add(leafGeometry,reed,[x,y,z],[size*(.68+noise(seed+i)*.33),size,size],i*2.399+seed,parent);
  }
  function flowerClump(x,y,z,size,seed,parent=perimeter) {
    for(let i=0;i<7;i++){
      const a=i*2.399+seed,r=size*Math.sqrt((i+.5)/7)*.55,h=size*(.72+noise(i+seed)*.6),px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
      rod([px,y,pz],[px+.018,y+h,pz],.007,c.leaf,parent);
      for(let j=0;j<3;j++)add(sphere,lavender,[px+.018,y+h-j*.025,pz],[.027,.033,.027],a,parent);
    }
  }
  function stoneScatter(x,y,z,size,seed,parent=perimeter) {
    for(let j=0;j<5;j++){
      const a=j*2.399+seed,r=size*(.35+noise(seed+j)*.55);
      stone(x+Math.cos(a)*r,y,z+Math.sin(a)*r,.09+noise(j)*.10,.025,.07+noise(j+1)*.08,seed+j,j%3?c.stoneLight:c.stoneDark,parent);
    }
  }
  function arcFoam(x,z,rx,rz,start,end,y,parent=perimeter) {
    const points=[];for(let j=0;j<=16;j++){const a=start+(end-start)*j/16;points.push([x+Math.cos(a)*rx,y,z+Math.sin(a)*rz]);}
    const line=ribbon(points,.026,foam,parent,32);return line;
  }
  if(alpine){
    // Flowered verges sit between the retained stone footpath and tree slope.
    for(const side of [-1,1])for(let i=0;i<12;i++){
      const z=-d*.5+.2+i*(d-.4)/11,edge=w*.5+.7,x=side*(edge+.68+noise(i+40)*.22),seed=3100+i+(side+1)*60;
      if([-d*.28,d*.25].some(v=>Math.abs(z-v)<.76))continue;
      flowerClump(x,.035,z,.22,seed);rosette(x+side*.25,.07,z+.15,.28,seed);stoneScatter(x,.02,z,.45,seed);
    }
    // Thin exposed strata and plants make the rear hillside a layered ridge.
    const back=-d*.5-2.4;
    for(let i=0;i<12;i++){
      const x=-w*.5-1+i*(w+2)/11,z=back-.10+Math.sin(i*.8)*.2;
      for(let j=0;j<3;j++)stone(x+j*.035,.11+j*.11,z-j*.09,.65-j*.06,.11,.41,3200+i*3+j,j===2?c.stoneLight:c.stoneDark,perimeter);
      rosette(x+.29,.16,z+.25,.35,3300+i);flowerClump(x-.22,.11,z+.4,.25,3400+i);
    }
    ribbon([[1.56,.121,heroZ+1.03],[1.40,.121,heroZ+1.55],[1.37,.121,-.65],[1.53,.121,-.1]],.035,foam,root,40);
    for(let i=0;i<5;i++){
      const z=heroZ+1.25+i*.35;
      if(z>.65)continue;
      rosette(1.86,.14,z,.22,3500+i,root);stoneScatter(1.84,.145,z,.19,3510+i,root);
    }
  }else{
    // Coastal verges: lavender, sculpted agave leaves and weathered pebbles.
    for(const side of [-1,1]){
      const edge=w*.5+.72;
      for(let i=0;i<7;i++){
        const z=-d*.5+.25+i*(d-.5)/6,x=side*(edge+.72+Math.sin(i*.8)*.13),seed=3600+i+(side+1)*30;
        rosette(x,-.085,z,.34,seed);flowerClump(x-side*.16,-.085,z+.28,.22,seed);stoneScatter(x,-.10,z,.4,seed);
      }
      const islandX=side*(edge+2.6),islandZ=side*d*.22;
      for(let j=0;j<3;j++)arcFoam(islandX,islandZ,1.32+j*.16,1.59+j*.17,.14+j*.2,2.2+j*.2,-.414+j*.001);
      for(let i=0;i<7;i++){
        const z=-d*.5+.3+i*d/6,x=side*(edge+1.18),points=[];
        for(let j=0;j<8;j++)points.push([x+side*(.16+Math.sin(j*.45+i)*.12),-.415,z+(j-3.5)*.14]);
        ribbon(points,.024,foam,perimeter,20);
      }
      // Mooring posts and sagging ropes follow the outside of the promenade.
      for(let i=0;i<5;i++){
        const z=-d*.5+.5+i*(d-1)/4,x=side*(edge+.91);
        rod([x,-.13,z],[x,.13,z],.04,c.timber,perimeter);
        add(garden.circle,c.metal,[x,.14,z],[.059,.045,.059],0,perimeter);
        if(i<4){const end=z+(d-1)/4,route=new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,.1,z),new THREE.Vector3(x,-.025,(z+end)*.5),new THREE.Vector3(x,.1,end));let last=route.getPoint(0);for(let j=1;j<=10;j++){const p=route.getPoint(j/10);rod(last.toArray(),p.toArray(),.009,c.timberLight,perimeter);last=p;}}
      }
    }
  }
  root.userData.landscapeDetail={water:'slow-ripple-and-depth',planting:alpine?'meadow-verges-and-rock-strata':'lavender-agave-and-moorings',footprint:'courtyard-and-outer-perimeter'};
}
