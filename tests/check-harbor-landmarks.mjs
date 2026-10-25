import assert from 'node:assert/strict';
import fs from 'node:fs';
import {THREE,regionalFixture} from './regional-scene-fixture.mjs';
import {harborLandmarkSpec,harborWalkSetback} from '../scene-harbor-landmarks.js';
import simulation from '../tools/simulation-context.cjs';

const fixture=await regionalFixture('harbor');
const totals={parcels:0,publicParcels:0,estateParcels:0,pickingChecks:0,framingChecks:0,directionChecks:0};
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
try{
  for(const level of [1,2,3]){
    const views=fixture.build({level,owners:'alternating'});
    assert.equal(views.filter(view=>view.landmarkSpec).length,31,'every harbor parcel has shared dimensions');
    assert.equal(views.filter(view=>view.landmarkSpec.isPublic).length,18);
    assert.equal(views.filter(view=>!view.tile.lot).length,18,'dimension metadata never replaces game-owned public/land semantics');
    for(const view of views){
      const spec=harborLandmarkSpec({index:view.tile.index});
      assert(spec);assert.equal(spec.isPublic,!view.tile.lot);
      assert.equal(view.w,spec.width);assert.equal(view.d,spec.depth);
      const model=view.building.children[0];
      assert.deepEqual(model.scale.toArray(),[...spec.scale]);
      assert.equal(model.userData.pendingModel,undefined,'verify the actual published GLB');
      assert(Math.abs(model.position.x)<1e-8&&Math.abs(model.position.z+spec.modelSetback)<1e-8,'setback stays in street-facing parcel coordinates');
      const local=model.clone(true);local.position.set(0,.048,-spec.modelSetback);local.rotation.set(0,0,0);local.updateMatrixWorld(true);
      const footprint=new THREE.Box3().setFromObject(local);
      assert(footprint.min.x>=-spec.width/2&&footprint.max.x<=spec.width/2,`parcel ${view.tile.index}: shell and fittings fit the parcel width`);
      assert(footprint.min.z>=-spec.depth/2&&footprint.max.z<=spec.depth/2,`parcel ${view.tile.index}: shell and fittings fit the parcel depth`);
      assert(footprint.max.z+.20<spec.walkSetback,`parcel ${view.tile.index}: the building leaves space for a pawn`);
      const bounds=new THREE.Box3().setFromObject(view.building),center=bounds.getCenter(new THREE.Vector3());
      fixture.context.view=view;
      const framing=fixture.run('framingForLot(view)'),envelope=new THREE.Box3();framing.forEach(box=>envelope.union(box));envelope.expandByScalar(.003);
      assert(envelope.containsBox(bounds),`parcel ${view.tile.index} level ${level}: framing includes the scaled shell and fittings`);totals.framingChecks++;
      ray.set(new THREE.Vector3(center.x,bounds.max.y+2,center.z),down);
      const hits=ray.intersectObject(view.building,true);assert(hits.length,`parcel ${view.tile.index}: the enlarged model remains selectable`);
      let picked=hits[0].object;while(picked&&!Object.hasOwn(picked.userData,'tileIndex'))picked=picked.parent;
      assert.equal(picked?.userData.tileIndex,view.tile.index);totals.pickingChecks++;
      const label=view.group.worldToLocal(view.anchor.clone());
      assert(Math.abs(label.x)<1e-6&&Math.abs(label.z-(spec.depth/2+.26))<1e-6,'label follows the enlarged street-facing boundary');
      if(view.tile.index===0){assert(footprint.getSize(new THREE.Vector3()).y>2.4,'the port hall has a distinct tall civic silhouette');assert(spec.width>harborLandmarkSpec({index:11}).width);}
      if(spec.kind==='estate'){
        assert(footprint.getSize(new THREE.Vector3()).x>2.5,'the estate shell occupies a substantial part of its enlarged parcel');
        const secondary=fixture.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===view.tile.index);assert(secondary);assert.equal(harborLandmarkSpec(secondary),spec);
        totals.estateParcels++;
      }
      if(spec.isPublic)totals.publicParcels++;
      totals.parcels++;
    }
  }
  fixture.run('makeRoads(data);streetFoundation.finish();world.updateMatrixWorld(true);');
  const arrows=fixture.run('streetArrows'),steps=fixture.run('stepViews');
  assert.equal(arrows.length,35,'one direction arrow per physical street');
  const rules=simulation.context(fs.readFileSync(new URL('../game.js',import.meta.url),'utf8'),2087);
  // Actual navigation advances through both phase boundaries, including the
  // exact reversed boundary. No hand-written phase state feeds the renderer.
  for(const currentPlayerId of ['human','ai'])for(const direction of [1,-1]){
    rules.run(`initializeGame('harbor');state.currentPlayerIndex=${currentPlayerId==='human'?0:1};{const p=currentPlayer(),cursor=${direction>0?32:37};p.harborCursor=cursor;p.position=p.harborAnchor=getMapNavigation().cycle[cursor];p.effects.reversed=${direction<0?1:0};}`);
    const phases=new Set();
    for(let frame=0;frame<78;frame++){
      const journey=JSON.parse(rules.run(`JSON.stringify(${currentPlayerId==='human'?'GameHarbor.getState().journey':'getHarborJourney(currentPlayer())'})`));
      phases.add(journey.phase);fixture.context.activeJourney=journey;fixture.context.activeId=currentPlayerId;
      fixture.run('data.currentPlayerId=activeId;data.players.forEach(p=>p.harborJourney=p.id===activeId?activeJourney:null);syncHarborStreetArrows(data);world.updateMatrixWorld(true);');
      for(const arrow of arrows){
        const sign=arrow.userData.streetBranch==='shared'?journey.centralDirection:journey.travelDirection;
        const from=sign>0?arrow.userData.streetFrom:arrow.userData.streetTo,to=sign>0?arrow.userData.streetTo:arrow.userData.streetFrom;
        assert.equal(arrow.userData.actualFrom,from);assert.equal(arrow.userData.actualTo,to);
        const actual=new THREE.Vector3(0,1,0).transformDirection(arrow.matrixWorld),expected=steps.get(to).walk.clone().sub(steps.get(from).walk).normalize();
        assert(actual.dot(expected)>.999999,`${currentPlayerId} ${journey.phase} ${direction}: arrow ${from}→${to} follows the real journey`);totals.directionChecks++;
      }
      const currentIndex=rules.run('currentPlayer().position');
      assert(arrows.some(arrow=>arrow.userData.actualFrom===currentIndex&&arrow.userData.actualTo===journey.nextTileIndex),'the next actual move always has a matching street arrow, including phase boundaries');
      rules.run('{const p=currentPlayer();p.position=getNextTileIndex(p,p.position,p.effects.reversed?-1:1,true);}');
    }
    assert.equal(phases.size,2,'real movement crosses both itinerary phases');
  }
}finally{fixture.dispose();}
assert.equal(totals.parcels,93);assert.equal(totals.publicParcels,54);assert.equal(totals.estateParcels,9);
console.log(JSON.stringify({pass:true,...totals}));
