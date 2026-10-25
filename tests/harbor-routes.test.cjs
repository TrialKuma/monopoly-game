'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { runner } = require('../tools/economy-simulation.cjs');
const { createStore, BUILDING_CARDS } = require('../progression.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const fresh = () => { const c = context(source, 2087); c.run('initializeGame("harbor")'); return c; };
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
    for (const [p, s] of [[11,12],[14,15],[22,23]]) {
      assert.equal(c.run(`state.board[${p}].lot===state.board[${s}].lot`), true);
      assert.equal(board[s].largePrimaryIndex, p);
      assert.equal(Math.abs(board[p].x-board[s].x)+Math.abs(board[p].y-board[s].y), 1);
    }
  });
  await test('both routes close in 24 steps, share 14 cells, and together cover all 34', () => {
    const c = fresh(), loops = [];
    for (const branch of ['merchant','resort']) {
      const p = json(c, `previewMovement(state.players[0],24,{branchChoice:'${branch}'})`);
      assert.equal(p.index, 0); assert.equal(new Set(p.path).size, 24);
      assert.equal(p.path.filter(i => i===7).length, 1); assert.equal(p.path.filter(i => i===28).length, 1);
      loops.push(p.path);
    }
    assert.equal(loops[0].filter(i => loops[1].includes(i)).length, 14);
    assert.equal(new Set(loops.flat()).size, 34);
    const nav = json(c, 'getMapNavigation()');
    assert.equal(nav.edges.length, 35); assert.equal(Object.keys(nav.junctions).length, 1);
    assert.deepEqual(nav.junctions[7].options.map(o => o.next), [8,18]);
  });
  await test('every origin returns to the port with either preference and neither graph direction dead-ends', () => {
    const c = fresh(), nav = json(c, 'getMapNavigation()');
    for (let index=0;index<34;index++) for (const branch of ['merchant','resort']) for (const direction of [-1,1]) {
      const route = json(c, `previewMovement(state.players[0],48,{startingIndex:${index},branchChoice:'${branch}',direction:${direction}})`);
      assert(route.path.includes(0)); assert(route.path.every(i => Number.isInteger(i) && i>=0 && i<34));
      const routeWithOrigin = [index,...route.path];
      for(let n=1;n<routeWithOrigin.length;n++) {
        const a=routeWithOrigin[n-1],b=routeWithOrigin[n];
        assert(nav.edges.some(e => direction>0 ? e.from===a&&e.to===b : e.from===b&&e.to===a));
      }
    }
  });
  await test('route stays selected across multiple laps and crossing or landing on either junction never opens a modal', async () => {
    const c=fresh(); assert.equal(c.GameHarbor.setRoute('resort').ok,true);
    c.run('showContinueModal=async()=>{throw Error("unexpected junction confirmation")};');
    await c.run('resolveLanding(state.players[0],state.board[7],state.sessionId)');
    await c.run('resolveLanding(state.players[0],state.board[28],state.sessionId)');
    assert.deepEqual(json(c,'previewMovement(state.players[0],48).path.filter(i=>i===8||i===18)'),[18,18]);
    assert.equal(c.GameHarbor.getState().route,'resort');
    for (const condition of ['state.busy=true','state.cardUsePending=true','state.phase="await_modal"','state.currentPlayerIndex=1','state.gameOver=true']) {
      const d=fresh(); d.run(condition); assert.equal(d.GameHarbor.setRoute('resort').ok,false);
    }
  });
  await test('reverse and rewind retrace the island actually visited even after preference changes', async () => {
    for (const branch of ['merchant','resort']) {
      const c=fresh(); c.GameHarbor.setRoute(branch);
      await c.run('animateMovement(state.players[0],18,state.sessionId)'); // merge at 28
      assert.equal(c.run('state.players[0].position'),28);
      c.GameHarbor.setRoute(branch==='merchant'?'resort':'merchant');
      const before=json(c,'state.players[0]');
      const preview=json(c,'previewMovement(state.players[0],3,{direction:-1})');
      assert.deepEqual(preview.path,branch==='merchant'?[17,16,15]:[27,26,25]);
      assert.deepEqual(json(c,'state.players[0]'),before,'preview is read-only');
      await c.run('executeCardEffect(state.players[0],{id:"rewind"},state.sessionId,{target:"self"})');
      assert.equal(c.run('state.players[0].position'),preview.index);
      c.run('state.players[0].effects.reversed=true');
      await c.run('animateMovement(state.players[0],1,state.sessionId)');
      assert.equal(c.run('state.players[0].position'),branch==='merchant'?14:24);
    }
  });
  await test('each full lap pays once, reversing across start cannot farm salary, relocation resets eligibility', async () => {
    for(const branch of ['merchant','resort']) for(const reversed of [false,true]) {
      const c=fresh();c.GameHarbor.setRoute(branch);c.run(`state.players[0].effects.reversed=${reversed};state.players[0].harborLastBranch='${branch}'`);
      await c.run('animateMovement(state.players[0],24,state.sessionId)');
      assert.equal(c.run('state.players[0].position'),0);assert.equal(c.run('state.players[0].cash'),2020);
      await c.run('animateMovement(state.players[0],24,state.sessionId)');assert.equal(c.run('state.players[0].cash'),2340);
    }
    const c=fresh();
    await c.run('animateMovement(state.players[0],24,state.sessionId)');
    for(let i=0;i<3;i++) {
      c.run('state.players[0].effects.reversed=true');await c.run('animateMovement(state.players[0],1,state.sessionId)');
      c.run('state.players[0].effects.reversed=false');await c.run('animateMovement(state.players[0],1,state.sessionId)');
    }
    assert.equal(c.run('state.players[0].cash'),2020);
    c.run('state.players[0].position=33;resetHarborJourney(state.players[0])');
    await c.run('animateMovement(state.players[0],1,state.sessionId)');assert.equal(c.run('state.players[0].cash'),2020);
  });
  await test('teleport and swap establish coherent reverse paths without carrying a fabricated lap', async () => {
    const c=fresh(); await c.run('animateMovement(state.players[0],18,state.sessionId)');
    c.run('state.players[1].position=24;state.players[1].harborDistance=23');
    await c.run('executeCardEffect(state.players[0],{id:"swap"},state.sessionId)');
    assert.deepEqual(json(c,'state.players.map(p=>p.harborDistance)'),[0,0]);
    assert.equal(c.run('getNextTileIndex(state.players[0],24,-1,false)'),23);
    await c.run('executeCardEffect(state.players[0],{id:"teleport"},state.sessionId,{target:"self"})');
    assert.equal(c.run('state.players[0].harborDistance'),0);
    assert.equal(c.run('state.players[0].harborAnchor===state.players[0].position'),true);
  });
  await test('rules wait for each complete authored scene path instead of cutting a long bridge at 180 ms', async () => {
    const c=fresh(),waits=[];
    c.CityScene={getMovementDuration:()=>682};c.captureWait=milliseconds=>waits.push(milliseconds);
    c.run('sleep=async milliseconds=>captureWait(milliseconds)');
    await c.run('animateMovement(state.players[0],3,state.sessionId)');
    assert.deepEqual(waits,[682,682,682]);assert.equal(c.run('state.players[0].position'),3);
  });
  await test('paid construction records family milestones once and caps one match at five cards', () => {
    const c=fresh(); c.run('state.harborCollection.wishlist="onsen";state.players[0].cash=10000');
    for(const index of [1,2,4,5,11,14,22]) c.run(`state.board[${index}].lot.ownerId="human";buildLot(state.players[0],state.board[${index}],false);buildLot(state.players[0],state.board[${index}],false);`);
    assert.equal(c.GameHarbor.getRewards().reduce((s,r)=>s+r.count,0),5);
    assert(c.GameHarbor.getRewards().some(r=>r.cardId==='harbor_onsen'));
    const before=json(c,'getHarborBuildingRewards()');
    c.run('state.board[1].lot.level=1;buildLot(state.players[0],state.board[1],false)');
    assert.deepEqual(json(c,'getHarborBuildingRewards()'),before,'demolish/rebuild cannot repeat a milestone');
  });
  await test('large-lot level 2 and 3 each reward one card and completed achievements survive losing ownership', () => {
    const c=fresh();c.run('state.players[0].cash=10000;state.board[22].lot.ownerId="human";buildLot(state.players[0],state.board[22],false);buildLot(state.players[0],state.board[22],false);buildLot(state.players[0],state.board[22],false);state.board[22].lot.ownerId="ai"');
    assert.deepEqual(json(c,'getHarborBuildingRewards()'),[{cardId:'harbor_onsen',count:2},{cardId:'harbor_villa',count:1}]);
    assert.equal(c.GameHarbor.getState().earnedCount,2);
  });
  await test('actual finish forwards frozen wishlist and earned cards exactly once; other maps never grant harbor cards', () => {
    const c=fresh(),receipts=[];c.GameProgression={resetResult(){},createRunId(){return 'route-test'},settle:r=>{receipts.push(JSON.parse(JSON.stringify(r)));return{ok:true}},getProfile:()=>({profile:{town:{targetCardId:'harbor_hotel'}}})};
    c.run('initializeGame("harbor");state.isFormalRun=true;state.round=31');
    assert.equal(c.GameHarbor.setWishlist('onsen').ok,false);
    c.run('finishGame("rounds");finishGame("rounds")');
    assert.equal(receipts.length,1);assert.deepEqual(receipts[0].buildingCards,[{cardId:'harbor_hotel',count:1}]);
    c.run('initializeGame("classic");state.isFormalRun=true;state.round=31;finishGame("rounds")');
    assert.deepEqual(receipts[1].buildingCards,[]);
  });
  await test('AI evaluates owned properties and chooses a route before movement without human prompts', () => {
    const c=fresh();c.run('state.board.forEach(t=>{if(t.lot&&t.index>=8&&t.index<=17){t.lot.ownerId="human";t.lot.level=3}});chooseAiHarborRoute(state.players[1])');
    assert.equal(c.run('state.players[1].selectedRoute'),'resort');
  });
  await test('paid match → targeted cards → place/rotate/store → merge stars → saved town survives reload', async () => {
    const data=new Map(); let runId=0;
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const store=createStore(storage),c=fresh();
    c.GameProgression={...store,getProfile:store.read,createRunId:()=>`harbor-journey-${++runId}`,resetResult(){},showEntryError:error=>{throw Error(error.error)}};
    c.run('showModal=async cfg=>cfg.buttons.some(b=>b.id==="enter")?"enter":"flip";selectedMapId="harbor"');
    assert.equal(c.GameHarbor.setWishlist('onsen').ok,true);
    const complete=async build=>{
      await c.run('startNewGame()');
      if(build)c.run('buyLot(state.players[0],state.board[22],false);buildLot(state.players[0],state.board[22],false);buildLot(state.players[0],state.board[22],false);buildLot(state.players[0],state.board[22],false)');
      for(let n=0;n<60;n++)c.run('endTurn()');
      assert.equal(c.run('state.gameOver'),true);assert.equal(c.run('state.citySettlement.ok'),true);
    };
    await complete(true);
    assert.deepEqual(store.read().profile.town.cards.harbor_onsen,{unlocked:true,star:1,duplicates:2});
    assert.equal(store.read().profile.receipts[0].rounds,30);
    const placed=store.town.place({cardId:'harbor_onsen',x:1,y:1,rotation:0,actionId:'journey-place'});
    assert.equal(placed.ok,true);const id=placed.building.id;
    assert.equal(store.town.move({buildingId:id,x:3,y:2,rotation:1,actionId:'journey-rotate'}).ok,true);
    assert.equal(store.town.merge({cardId:'harbor_onsen',expectedStar:2,actionId:'journey-merge-2'}).ok,true);
    assert.equal(store.read().profile.town.buildings[0].id,id,'star upgrades keep the actual placed building');
    assert.equal(BUILDING_CARDS.find(card=>card.id==='harbor_onsen').modelKeys[store.read().profile.town.cards.harbor_onsen.star-1],'onsen_2');
    assert.equal(store.town.store({buildingId:id,actionId:'journey-store'}).ok,true);
    const coins=store.read().profile.wallet;
    assert.equal(store.town.restore({buildingId:id,x:0,y:0,rotation:0,actionId:'journey-restore'}).ok,true);
    assert.equal(store.read().profile.wallet,coins,'reposition and restore are free');
    await complete(true); await complete(false);
    assert.equal(store.read().profile.town.cards.harbor_onsen.duplicates,4);
    assert.equal(store.town.merge({cardId:'harbor_onsen',expectedStar:3,actionId:'journey-merge-3'}).ok,true);
    assert.equal(store.town.expand({actionId:'journey-expand'}).ok,true);
    const restored=createStore(storage).read();assert.equal(restored.ok,true);
    assert.equal(restored.profile.town.size,8);assert.equal(restored.profile.town.cards.harbor_onsen.star,3);
    assert.equal(restored.profile.town.cards.harbor_onsen.duplicates,0);
    assert.equal(restored.profile.town.buildings[0].stored,false);
    assert.equal(restored.profile.receipts.length,3);
  });
  await test('16 real-start games finish both seats at 30 normal rounds with finite reconciled cash', async () => {
    const run=runner(source,'harbor');
    for(let seed=41401;seed<41409;seed++) for(const seat of [0,1]) {
      const result=await run(seed,seat);assert.deepEqual(result.base,[30,30]);assert(result.cash.every(v=>Number.isFinite(v)&&v>=0));
    }
  });
  console.log(`${checks} harbor route, navigation, card reward and game-length checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
