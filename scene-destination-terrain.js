import { createTerrainLayerKit } from './scene-terrain-kit.js?v=20261025-terrain3';

// Broad landforms precede small dressing: the open areas read as a shore or a
// stream valley at phone scale. No new trees or buildings are placed here.
export function enrichDestinationTerrain({THREE,own,garden,root,perimeter,alpine,w,d,innerW,innerD}) {
  const {colors:c,material,noise,groundCover,boulder,stone,ribbon}=garden;
  const inner=new THREE.Group(),outer=new THREE.Group();
  inner.name='terrain_courtyard';outer.name='terrain_perimeter';
  inner.userData.terrainLayer=outer.userData.terrainLayer=true;
  root.add(inner);perimeter.add(outer);
  const {mound,patch,watercourse}=createTerrainLayerKit({THREE,own,garden,root});
  const moss=material(alpine?'#78975e':'#91a96a');moss.userData.seasonalKind='grass';
  moss.onBeforeCompile=c.grass.onBeforeCompile;moss.customProgramCacheKey=c.grass.customProgramCacheKey;
  const shallows=material(alpine?'#89c6be':'#8cc7bb',{roughness:.38,metalness:.04});
  function plantingMass(x,y,z,rx,rz,seed,parent,height=.10) {
    mound({x,z,rx,rz,y,height,seed,parent,material:moss});
    // Short ground cover sits on the mound shoulders, leaving its broad form
    // readable. It never grows into the pawn's shoulder-height silhouette.
    for(let i=0;i<4;i++){
      const a=i*2.399+seed,r=.55,px=x+Math.cos(a)*rx*r,pz=z+Math.sin(a)*rz*r;
      groundCover(px,y+height*.58,pz,Math.min(rx,rz)*.22,seed+i,parent);
    }
  }
  function gravelBank(x,y,z,rx,rz,seed,parent) {
    patch({x,z,rx,rz,y,seed,parent,material:c.path});
    for(let i=0;i<7;i++){
      const a=i*2.399+seed,r=.30+noise(seed+i)*.5;
      stone(x+Math.cos(a)*rx*r,y+.015,z+Math.sin(a)*rz*r,.10+noise(i)*.10,.025,.09+noise(i+7)*.08,seed+i,c.stoneLight,parent);
    }
  }

  // The approach to the lower fountain stays open down the middle. Its sides
  // become shallow terraced planting, under the route's sight-line height.
  const south=Math.min(innerD*.43,4.18),sideX=Math.min(innerW*.34,1.75);
  for(const side of [-1,1]){
    const x=side*sideX,rx=Math.min(.62,innerW*.14),rz=.48;
    gravelBank(x,.15,south,rx*1.1,rz*1.1,4100+side,inner);
    plantingMass(x+side*.04,.16,south-.025,rx*.82,rz*.82,4120+side,inner,.085);
    boulder(x-side*rx*.6,.17,south+.10,.12,.065,.14,4140+side,inner);
  }
  if(alpine){
    // Continue the existing upper creek past a gravel fan into a small basin.
    // This uses the empty right strip instead of crossing the central walkway.
    const creekX=innerW/2-.55;
    watercourse({points:[[1.91,.17,.56],[creekX,.17,1.28],[creekX-.12,.17,2.3],[creekX+.04,.17,3.12],[creekX-.28,.17,3.88]],width:.38,bankWidth:.13,parent:inner,seed:4200,bankMaterial:c.path});
    patch({x:creekX-.28,z:3.88,rx:.42,rz:.48,y:.174,seed:4201,parent:inner,material:shallows});
    plantingMass(-innerW*.32,.15,.88,.55,.56,4230,inner,.13);
    gravelBank(-innerW*.31,.154,1.45,.50,.30,4235,inner);

    // A broad foreground river valley closes the old empty front edge. All
    // banks are below the board; its curved channel is visible from local view.
    const z=d/2+2.05;
    mound({x:0,z:z+.15,rx:w/2+1.6,rz:1.25,y:-.43,height:.16,seed:4300,parent:outer});
    const river=[[-w/2-1,-.245,z-.12],[-w*.27,-.245,z+.25],[0,-.245,z-.14],[w*.27,-.245,z+.20],[w/2+1,-.245,z-.30]];
    watercourse({points:river,width:.73,bankWidth:.30,parent:outer,seed:4310,bankMaterial:c.path});
    for(let i=0;i<6;i++){
      const x=(i-2.5)*w*.17,front=i%2?1:-1,cz=z+front*(.56+noise(i)*.12);
      gravelBank(x,-.252,cz,.70,.29,4330+i,outer);
      plantingMass(x+.2,-.25,cz+front*.27,.62,.29,4350+i,outer,.12);
      boulder(x-.30,-.21,cz,.24,.11,.21,4370+i,outer);
    }
    // A low waterfall sill gives a clear change in surface and flow direction.
    for(let i=0;i<5;i++)stone(-w*.10+(i-2)*.16,-.25,z-.12,.24,.07,.22,4390+i,c.stoneDark,outer);
    ribbon([[-w*.10-.44,-.169,z-.13],[-w*.10,-.169,z-.09],[-w*.10+.36,-.169,z-.14]],.035,c.foam,outer,18);
  }else{
    // Irrigated garden edge: a narrow reflecting channel, shallow pockets and
    // soft grass banks alongside the hard central fountain terrace.
    const channelX=-(innerW/2-.29);
    watercourse({points:[[channelX,.17,.75],[channelX+.09,.17,1.7],[channelX-.015,.17,2.8],[channelX+.12,.17,3.55]],width:.23,bankWidth:.10,parent:inner,seed:4500,bankMaterial:c.path});
    for(const side of [-1,1]){
      const edge=w/2+.72,x=side*(edge+2.8),z=-side*d*.34;
      // Three distinct contours: pale submerged shelf, sand bank, planted dune.
      patch({x,z,rx:2.1,rz:2.15,y:-.416,seed:4520+side,parent:outer,material:shallows});
      mound({x:x-side*.16,z:z+.12,rx:1.70,rz:1.80,y:-.405,height:.32,seed:4540+side,parent:outer,material:c.path});
      plantingMass(x+side*.30,-.16,z+.58,.87,.68,4560+side,outer,.23);
      // Tide pools are held inside the sand shoulder, visibly nested in shore.
      patch({x:x-side*.55,z:z-.55,rx:.68,rz:.52,y:-.105,seed:4580+side,parent:outer,material:c.stoneDark});
      patch({x:x-side*.55,z:z-.55,rx:.58,rz:.43,y:-.092,seed:4580+side,parent:outer,material:shallows});
      for(let j=0;j<8;j++){
        const a=j*2.399,px=x+Math.cos(a)*1.40,pz=z+Math.sin(a)*1.45;
        boulder(px,-.29,pz,.24+noise(j)*.11,.14,.25,4600+j,outer);
      }
      gravelBank(x-side*.78,-.14,z+.50,.48,.42,4620+side,outer);
      // A shallow arc traces the land/water contact rather than more ornaments.
      const points=[];for(let j=0;j<=16;j++){const a=-.2+j*.19;points.push([x+Math.cos(a)*1.92,-.404,z+Math.sin(a)*1.97]);}
      ribbon(points,.027,c.foam,outer,32);
    }
  }
  root.userData.terrainComposition=alpine?'stream-courtyard-and-river-valley':'irrigated-courtyard-and-tidal-dunes';
}
