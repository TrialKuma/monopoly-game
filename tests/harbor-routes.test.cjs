'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { runner } = require('../tools/economy-simulation.cjs');
const { createStore, BUILDING_CARDS } = require('../progression.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const fresh = () => { const c = context(source,2087); c.testRoute='merchant'; c.run('initializeGame("harbor");showModal=async cfg=>{if(cfg.routeChoice)return testRoute;throw Error("Unexpected modal: "+cfg.title)}'); return c; };
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await test('34 distinct playable cells, seven collectible families, and three adjacent double lots', () => {
    const c = fresh(), board = json(c, 'state.board');
    assert.equal(board.length, 34);
    assert.equal(new Set(board.map(t => `${t.x},${t.y}`)).size, 34);
    assert(board.every(t => t.name && (t.isStart || t.isSpecial || t.lot)));
    assert.deepEqual([...new Set(board.filter(t => t.lot).map(t => t.lot.landmarkKey || t.lot.theme.key))].sort(), ['finance','hotel','onsen','shop','skyscraper','tower','villa']);
    for (const [p, s] of [[2,3],[7,8],[30,31]]) {
      assert.equal(c.run(`state.board[${p}].lot===state.board[${s}].lot`), true);
      assert.equal(board[s].largePrimaryIndex, p);
      assert.equal(Math.abs(board[p].x-board[s].x)+Math.abs(board[p].y-board[s].y), 1);
    }
  });
  await test('red and yellow each visit both islands, reverse only the shared corridor, and join in a 70-step cycle', () => {
    const c=fresh(),nav=json(c,'getMapNavigation()');
    assert.equal(nav.edges.length,35);assert.deepEqual(nav.junctions,{});assert.equal(nav.cycle.length,70);
    for(const [phase,begin,end] of [['red',28,11],['yellow',11,28]]) {
      const route=nav.phases[phase];assert.equal(route.length,36);assert.equal(route[0],begin);assert.equal(route.at(-1),end);
      assert.equal(new Set(route).size,34);
      for(const island of [nav.branches.merchant,nav.branches.resort]) assert(route.join(',').includes(island.join(',')));
    }
    assert.deepEqual(nav.phases.red.slice(0,18),nav.shared);
    assert.deepEqual(nav.phases.yellow.slice(0,18),nav.shared.toReversed());
    assert.equal(json(c,'previewMovement(state.players[0],70)').index,0);
  });
  await test('every itinerary instance is reversible across repeated junctions and phase boundaries; previews stay read-only', () => {
    const c=fresh(),nav=json(c,'getMapNavigation()');
    for(let cursor=-70;cursor<140;cursor++) for(const direction of [-1,1]) {
      const at=((cursor%70)+70)%70;
      c.run(`Object.assign(state.players[0],{position:${nav.cycle[at]},harborAnchor:${nav.cycle[at]},harborCursor:${cursor}})`);
      const before=json(c,'state.players[0]');
      for(const steps of [1,3,12,70,141]) {
        const preview=json(c,`previewMovement(state.players[0],${steps},{direction:${direction}})`);
        assert.deepEqual(preview.path,Array.from({length:steps},(_,i)=>nav.cycle[((cursor+direction*(i+1))%70+70)%70]));
        assert.equal(preview.uncertain,false);
      }
      assert.deepEqual(json(c,'state.players[0]'),before);
    }
  });
  await test('70 real steps need no junction prompts and preserve remaining movement', async () => {
    const c=fresh();c.run('showModal=async()=>{throw Error("No route prompts allowed")}');
    await c.run('animateMovement(state.players[0],70,state.sessionId)');
    assert.equal(c.run('state.players[0].position'),0);assert.equal(c.run('state.players[0].harborCursor'),76);
    assert.equal(c.GameHarbor.setRoute('merchant').ok,false);assert.equal(c.GameHarbor.getState().canChangeRoute,false);
    assert.equal(c.GameHarbor.getState().pendingChoice,null);
  });
  await test('supplies pay at new port crossings in either direction and cannot be farmed by reversing', async () => {
    for(const direction of [-1,1]) {
      const c=fresh();await c.run(`animateMovement(state.players[0],70,state.sessionId,{direction:${direction}})`);
      assert.equal(c.run('state.players[0].cash'),2340);
      for(let bounce=0;bounce<10;bounce++) {
        await c.run(`animateMovement(state.players[0],1,state.sessionId,{direction:${-direction}})`);
        await c.run(`animateMovement(state.players[0],1,state.sessionId,{direction:${direction}})`);
      }
      assert.equal(c.run('state.players[0].cash'),2340);
      await c.run(`animateMovement(state.players[0],70,state.sessionId,{direction:${direction}})`);
      assert.equal(c.run('state.players[0].cash'),2980);
    }
  });
  await test('relocation preserves a coherent phase without inventing salary progress', async () => {
    const c=fresh();await c.run('animateMovement(state.players[0],20,state.sessionId)');
    c.run('state.players[1].position=24;resetHarborJourney(state.players[1])');
    await c.run('executeCardEffect(state.players[0],{id:"swap"},state.sessionId)');
    assert.deepEqual(json(c,'state.players.map(p=>p.harborSalaryDistance)'),[0,0]);
    assert.equal(c.run('getNextTileIndex(state.players[0],24,-1,false)'),23);
    await c.run('executeCardEffect(state.players[0],{id:"teleport"},state.sessionId,{target:"self"})');
    assert.equal(c.run('state.players[0].harborSalaryDistance'),0);
    assert.equal(c.run('state.players[0].harborAnchor===state.players[0].position'),true);
    c.run('state.players[0].position=33;resetHarborJourney(state.players[0])');
    const cash=c.run('state.players[0].cash');
    await c.run('animateMovement(state.players[0],1,state.sessionId)');assert.equal(c.run('state.players[0].cash'),cash);
  });
  await test('rules wait for each authored scene path instead of cutting long bridges', async () => {
    const c=fresh(),waits=[];c.CityScene={getMovementDuration:()=>682};c.captureWait=milliseconds=>waits.push(milliseconds);
    c.run('sleep=async milliseconds=>captureWait(milliseconds)');await c.run('animateMovement(state.players[0],3,state.sessionId)');
    assert.deepEqual(waits,[682,682,682]);assert.equal(c.run('state.players[0].position'),3);
  });
  await test('paid construction records family milestones once and caps construction rewards at four cards', () => {
    const c=fresh(); assert.deepEqual(json(c,'getHarborBuildingRewards()'),[]); c.run('state.players[0].cash=10000');
    for(const index of [1,4,15,6,32,30,7]) c.run(`state.board[${index}].lot.ownerId="human";buildLot(state.players[0],state.board[${index}],false);buildLot(state.players[0],state.board[${index}],false);`);
    assert.equal(c.GameHarbor.getRewards().reduce((s,r)=>s+r.count,0),4);
    const before=json(c,'getHarborBuildingRewards()');
    c.run('state.board[1].lot.level=1;buildLot(state.players[0],state.board[1],false)');
    assert.deepEqual(json(c,'getHarborBuildingRewards()'),before,'demolish/rebuild cannot repeat a milestone');
  });
  await test('large-lot level 2 and 3 each reward one card and completed achievements survive losing ownership', () => {
    const c=fresh();c.run('state.players[0].cash=10000;state.board[7].lot.ownerId="human";buildLot(state.players[0],state.board[7],false);buildLot(state.players[0],state.board[7],false);buildLot(state.players[0],state.board[7],false);state.board[7].lot.ownerId="ai"');
    assert.deepEqual(json(c,'getHarborBuildingRewards()'),[{cardId:'harbor_onsen',count:2}]);
    assert.equal(c.GameHarbor.getState().earnedCount,2);
  });
  await test('actual finish requests a random draft without a target and forwards only earned cards exactly once', () => {
    const c=fresh(),receipts=[];c.GameProgression={resetResult(){},createRunId(){return 'route-test'},settle:r=>{receipts.push(JSON.parse(JSON.stringify(r)));return{ok:true}},getProfile:()=>({profile:{town:{targetCardId:'harbor_hotel'}}})};
    c.run('initializeGame("harbor");state.isFormalRun=true;state.round=41');
    assert.equal(c.GameHarbor.setWishlist,undefined); assert.equal('wishlist' in c.GameHarbor.getState(),false);
    c.run('finishGame("rounds");finishGame("rounds")');
    assert.equal(receipts.length,1);assert.deepEqual(receipts[0].buildingCards,[]);
    assert.equal(receipts[0].buildingCardDraft,true); assert.equal('buildingCardTarget' in receipts[0],false);
    c.run('initializeGame("classic");state.isFormalRun=true;state.round=31;finishGame("rounds")');
    assert.deepEqual(receipts[1].buildingCards,[]); assert.equal(receipts[1].buildingCardDraft,true);
  });
  await test('paid match → random choice and earned cards → build and merge → saved town survives reload', async () => {
    const data=new Map(); let runId=0;
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const store=createStore(storage),c=fresh();
    c.GameProgression={...store,getProfile:store.read,createRunId:()=>`harbor-journey-${++runId}`,resetResult(){},showEntryError:error=>{throw Error(error.error)}};
    c.run('showModal=async()=>"flip";selectedMapId="harbor"');
    const complete=async build=>{
      await c.run('startNewGame()');
      if(build)c.run('buyLot(state.players[0],state.board[7],false);buildLot(state.players[0],state.board[7],false);buildLot(state.players[0],state.board[7],false);buildLot(state.players[0],state.board[7],false)');
      for(let n=0;n<80;n++)c.run('endTurn()');
      assert.equal(c.run('state.gameOver'),true);assert.equal(c.run('state.citySettlement.ok'),true);
      const receipt=store.read().profile.receipts.at(-1),draft=receipt.buildingCardDraft;
      assert.equal(receipt.cardRewardVersion,3); assert.equal(draft.offers.length,3); assert.equal(new Set(draft.offers).size,3);
      assert.equal('targetCardId' in draft,false);
      const selected=draft.offers.find(cardId=>cardId!=='harbor_onsen');
      assert.equal(store.claimBuildingCard({runId:receipt.runId,cardId:selected}).ok,true);
    };
    await complete(true);
    assert.deepEqual(store.read().profile.town.cards.harbor_onsen,{unlocked:true,star:1,duplicates:1});
    assert.equal(store.read().profile.receipts[0].rounds,40);
    const placed=store.town.place({cardId:'harbor_onsen',x:1,y:1,rotation:0,actionId:'journey-place'});
    assert.equal(placed.ok,true);const id=placed.building.id;
    assert.equal(store.town.move({buildingId:id,x:3,y:2,rotation:1,actionId:'journey-rotate'}).ok,true);
    await complete(true);
    assert.equal(store.town.merge({cardId:'harbor_onsen',expectedStar:2,actionId:'journey-merge-2'}).ok,true);
    assert.equal(store.read().profile.town.buildings[0].id,id,'star upgrades keep the actual placed building');
    assert.equal(BUILDING_CARDS.find(card=>card.id==='harbor_onsen').modelKeys[store.read().profile.town.cards.harbor_onsen.star-1],'onsen_2');
    assert.equal(store.town.store({buildingId:id,actionId:'journey-store'}).ok,true);
    const coins=store.read().profile.wallet;
    assert.equal(store.town.restore({buildingId:id,x:0,y:0,rotation:0,actionId:'journey-restore'}).ok,true);
    assert.equal(store.read().profile.wallet,coins,'reposition and restore are free');
    await complete(true); await complete(true);
    assert.equal(store.read().profile.town.cards.harbor_onsen.duplicates,5);
    assert.equal(store.town.merge({cardId:'harbor_onsen',expectedStar:3,actionId:'journey-merge-3'}).ok,true);
    assert.equal(store.town.expand({expectedStage:1,actionId:'journey-expand'}).ok,true);
    const restored=createStore(storage).read();assert.equal(restored.ok,true);
    assert.equal(restored.profile.town.size,8);assert.equal(restored.profile.town.cards.harbor_onsen.star,3);
    assert.equal(restored.profile.town.cards.harbor_onsen.duplicates,1);
    assert.equal(restored.profile.town.buildings[0].stored,false);
    assert.equal(restored.profile.receipts.length,4);
  });
  await test('16 real-start games finish both seats at 40 normal rounds with finite reconciled cash', async () => {
    const run=runner(source,'harbor');
    for(let seed=41401;seed<41409;seed++) for(const seat of [0,1]) {
      const result=await run(seed,seat);assert.deepEqual(result.base,[40,40]);assert(result.cash.every(v=>Number.isFinite(v)&&v>=0));
    }
  });
  console.log(`${checks} harbor route, navigation, card reward and game-length checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
