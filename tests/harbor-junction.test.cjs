'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {context}=require('../tools/simulation-context.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const fresh=()=>{const c=context(source,81);c.run('initializeGame("harbor");startScreenEl.classList.contains=()=>true');return c};
const json=(c,code)=>JSON.parse(c.run(`JSON.stringify(${code})`));
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
(async()=>{
  await test('reversing twice restores the exact next edge at every itinerary occurrence',async()=>{
    const c=fresh(),cycle=json(c,'getMapNavigation().cycle');
    for(let cursor=0;cursor<70;cursor++) {
      c.run(`Object.assign(state.players[0],{position:${cycle[cursor]},harborAnchor:${cycle[cursor]},harborCursor:${cursor}})`);
      const before=json(c,'getHarborJourney(state.players[0])');
      await c.run('executeCardEffect(state.players[0],{id:"reverse"},state.sessionId,{target:"self"})');
      assert.equal(c.run('getHarborJourney(state.players[0]).nextTileIndex'),cycle[(cursor+69)%70]);
      await c.run('executeCardEffect(state.players[0],{id:"reverse"},state.sessionId,{target:"self"})');
      assert.deepEqual(json(c,'getHarborJourney(state.players[0])'),before);
    }
  });
  await test('rewind moves three steps opposite the current direction, including phase boundaries',async()=>{
    for(const reversed of [false,true]) for(const cursor of [0,1,17,26,34,35,36,52,61,69]) {
      const c=fresh(),cycle=json(c,'getMapNavigation().cycle');
      c.run(`Object.assign(state.players[0],{position:${cycle[cursor]},harborAnchor:${cycle[cursor]},harborCursor:${cursor}});state.players[0].effects.reversed=${reversed}`);
      const cash=c.run('state.players[0].cash');
      await c.run('executeCardEffect(state.players[0],{id:"rewind"},state.sessionId,{target:"self"})');
      assert.equal(c.run('state.players[0].harborCursor'),cursor+(reversed?3:-3));
      assert.equal(c.run('state.players[0].position'),cycle[(cursor+(reversed?3:-3)+70)%70]);
      assert.equal(c.run('state.players[0].cash'),cash);
    }
  });
  await test('outgoing arrow phase uses the preceding phase when reversing from a boundary',()=>{
    const c=fresh();
    for(const [cursor,position,central] of [[0,28,1],[35,11,-1],[70,28,1]]) {
      c.run(`Object.assign(state.players[0],{position:${position},harborAnchor:${position},harborCursor:${cursor}});state.players[0].effects.reversed=true`);
      const p=json(c,'state.players[0]'),journey=json(c,'getHarborJourney(state.players[0])');
      assert.equal(journey.centralDirection,central);assert.equal(journey.travelDirection,-1);
      assert.deepEqual(json(c,'state.players[0]'),p);
    }
  });
  await test('relocated reverse previews match actual movement without mutating the source player',async()=>{
    for(const start of [0,11,12,19,20,27,28,33]) for(const reversed of [false,true]) {
      const c=fresh();c.run(`state.players[0].effects.reversed=${reversed}`);
      const before=json(c,'state.players[0]');
      const preview=json(c,`previewMovement(state.players[0],12,{startingIndex:${start}})`);
      assert.deepEqual(json(c,'state.players[0]'),before);
      c.run(`state.players[0].position=${start};resetHarborJourney(state.players[0])`);
      await c.run('animateMovement(state.players[0],12,state.sessionId)');
      assert.equal(c.run('state.players[0].position'),preview.index);
    }
  });
  await test('two simultaneous movements cannot consume one cursor twice',async()=>{
    const c=fresh();let release;const wait=new Promise(resolve=>release=resolve);c.pause=()=>wait;
    c.run('sleep=()=>pause()');const first=c.run('animateMovement(state.players[0],2,state.sessionId)');
    await Promise.resolve();await Promise.resolve();
    assert.equal(await c.run('animateMovement(state.players[0],3,state.sessionId)'),false);
    release();assert.equal(await first,true);assert.equal(c.run('state.players[0].harborCursor'),8);
  });
  await test('restart cancels old cursor movement without touching the new match',async()=>{
    const c=fresh();let release;const wait=new Promise(resolve=>release=resolve);c.pause=()=>wait;c.run('sleep=()=>pause()');
    const move=c.run('animateMovement(state.players[0],8,state.sessionId)');await Promise.resolve();await Promise.resolve();
    c.run('initializeGame("harbor")');release();assert.equal(await move,false);
    assert.equal(c.run('state.players[0].harborCursor'),6);assert.equal(c.run('state.players[0].position'),0);
  });
  await test('rush follows current phase and settles exactly once in either direction',async()=>{
    for(const reversed of [false,true]){
      const c=fresh(),landings=[];c.record=index=>landings.push(index);
      c.run(`state.players[0].position=21;resetHarborJourney(state.players[0]);state.players[0].effects.reversed=${reversed};resolveLanding=async(p,t)=>record(t.index)`);
      const destination=c.run('previewMovement(state.players[0],3).index');
      await c.run('resolveRushTile(state.players[0],state.sessionId,{index:21,name:"快线",special:{rushMin:3,rushMax:3}})');
      assert.deepEqual(landings,[destination]);
    }
  });
  await test('chosen six queues one normal roll and crosses either harbor phase boundary exactly once',async()=>{
    for(const reversed of [false,true]) for(const cursor of [0,34,35,69]) {
      const c=fresh(),cycle=json(c,'getMapNavigation().cycle'),landings=[];
      c.record=index=>landings.push(index);
      c.run(`Object.assign(state.players[0],{position:${cycle[cursor]},harborAnchor:${cycle[cursor]},harborCursor:${cursor}});
        state.players[0].effects.reversed=${reversed};
        resolveLanding=async(p,t)=>record(t.index);showModal=async()=>"6";
        rollDice=()=>{throw Error("Chosen dice must not sample or trigger a six bonus")};
        grantInventoryCard('human','launch');`);
      const before=json(c,'({position:state.players[0].position,cursor:state.players[0].harborCursor,cash:state.players[0].cash})');
      assert.equal((await c.run('GameCards.use("launch")')).ok,true);
      assert.deepEqual(json(c,'({position:state.players[0].position,cursor:state.players[0].harborCursor,cash:state.players[0].cash})'),before,
        'using the card cannot move, cross a boundary, or collect salary');
      assert.deepEqual(landings,[]);
      assert.equal(c.run('state.phase'),'await_roll');
      assert.equal(c.run('state.players[0].cards.length'),0);
      const expectedCursor=cursor+(reversed?-6:6),expectedIndex=cycle[(expectedCursor%70+70)%70];
      await c.run('playHumanTurn()');
      assert.equal(c.run('state.players[0].harborCursor'),expectedCursor);
      assert.equal(c.run('state.players[0].position'),expectedIndex);
      assert.deepEqual(landings,[expectedIndex],'the queued normal roll settles only its final destination');
      assert.equal(c.run('state.players[0].effects.fixedDiceFace'),null);
      assert.equal(c.run('state.currentPlayerIndex'),1,'chosen six passes the turn instead of granting another action');
    }
  });
  console.log(`${checks} automatic harbor cycle lifecycle checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
