// Resource bounds for the actual installed model library and occupied board.
// Header-based texture estimates and CPU geometry counts are not phone FPS.
import assert from 'node:assert/strict';
import {requestedMap,runMapWorkers,regionalFixture} from './regional-scene-fixture.mjs';
const mapId=requestedMap();
if(!mapId){
  const maps=runMapWorkers(import.meta.url);
  console.log(JSON.stringify({maps:maps.length,pixelsRendered:false,phonePerformanceMeasured:false,failures:0}));
  process.exit(0);
}
const fixture=await regionalFixture(mapId);
function measure(roots){
  const attributes=new Set();let triangles=0,draws=0;
  for(const root of roots)root.traverse(node=>{
    if(!node.isMesh)return;
    const geometry=node.geometry;
    draws+=geometry.groups.length||1;
    triangles+=(geometry.index?.count||geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);
    for(const attribute of Object.values(geometry.attributes))attributes.add(attribute.isInterleavedBufferAttribute?attribute.data:attribute);
    for(const list of Object.values(geometry.morphAttributes))for(const attribute of list)attributes.add(attribute);
    if(geometry.index)attributes.add(geometry.index);
  });
  return {triangles,draws,uniqueAttributeMiB:[...attributes].reduce((sum,a)=>sum+a.array.byteLength,0)/1048576};
}
try{
  const models=fixture.run('[...modelLibrary.values()]');
  const expectedSource=process.argv.includes('--candidate')?'pixal_native_multiview':'authored_blender_reference_rebuild';
  assert.equal(models.filter(model=>model.userData.sourceType===expectedSource).length,29,'resource acceptance requires every building in the selected release');
  const library=measure(models);
  // Conservative uncompressed RGBA8 plus a complete mip chain, including
  // library textures whose corresponding level may not yet be visible.
  const textureMiB=fixture.imageHeaders.reduce((sum,image)=>sum+image.width*image.height*4*4/3,0)/1048576;
  assert(textureMiB<=384,`${mapId}: the complete near architecture texture library exceeds 384 MiB RGBA8+mips`);
  assert(library.uniqueAttributeMiB<=128,`${mapId}: installed architecture buffers exceed 128 MiB`);
  const levels=[];
  for(const level of [1,2,3]){
    const views=fixture.build({level,steps:true}),board=measure(views.map(view=>view.building));
    assert(board.triangles<=1400000,`${mapId} level ${level}: occupied-board architecture exceeds 1.4 million triangles`);
    assert(board.draws<=96,`${mapId} level ${level}: ${board.draws} occupied-board architectural draws exceed 96`);
    assert(board.uniqueAttributeMiB<=library.uniqueAttributeMiB+.01,'placements borrow installed model buffers');
    levels.push({level,buildings:views.length,...board});
  }
  console.log(`PASS ${mapId}: actual architecture placement and resident library budgets at all three levels`);
  console.log(JSON.stringify({mapId,library,textureRGBA8MipEstimateMiB:textureMiB,levels,pixelsRendered:false,phonePerformanceMeasured:false,failures:0}));
}finally{fixture.dispose();}
