'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {context} = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
let checks = 0;
function setup(map='compact') {
  const c=context(source,73), events=[];
  c.capture=cfg=>events.push(cfg);
  c.run(`initializeGame('${map}');showContinueModal=async cfg=>capture(cfg);
    state.players.forEach(p=>p.isAi=true);
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});
    var visitor=state.players[0],owner=state.players[1];
    var spa=state.board.find(t=>t.lot?.effectId==='hot_spring_rest'&&!t.isLargeSecondary);
    spa.lot.ownerId=owner.id;spa.lot.level=1;visitor.cash=10;visitor.position=spa.index;`);
  return {c,events};
}
async function test(name,work){await work();checks++;console.log('PASS '+name);}
(async()=>{
  await test('compact rescue permits the next real roll and blocks exactly one later rent',async()=>{
    const {c,events}=setup();
    await c.run('resolveLanding(visitor,spa,state.sessionId)');
    assert.equal(c.run('visitor.cash'),200);
    assert.equal(c.run('visitor.effects.shield'),true);
    assert.equal(c.run('visitor.effects.hotSpringRest'),false);
    assert.match(events.find(e=>e.label==='破产救助').message,/正常掷骰，不额外休整/);
    // A trap cast before the protected departure must not restore the lost turn.
    await c.run('executeCardEffect(owner,{id:"freeze"},state.sessionId)');
    assert.equal(c.run('visitor.effects.frozen'),false);
    c.run(`state.board[14].lot.ownerId=owner.id;state.board[14].lot.level=1;
      state.board[16].lot.ownerId=owner.id;state.board[16].lot.level=1;
      animateDiceRoll=async()=>3;`);
    const ownerCash=c.run('owner.cash');
    await c.run('processTurn(visitor)');
    assert.equal(c.run('visitor.position'),14);
    assert.equal(c.run('visitor.cash'),200);
    assert.equal(c.run('owner.cash'),ownerCash);
    assert.equal(c.run('visitor.effects.bankruptcyRelief'),false);
    assert.equal(c.run('visitor.effects.shield'),false);
    assert(!events.some(e=>e.label==='等待救援'));
    c.run('endTurn();animateDiceRoll=async()=>2;');
    await c.run('processTurn(visitor)');
    assert.equal(c.run('visitor.position'),16);
    const rent=Math.round((62+64)*1.2);
    assert.equal(c.run('visitor.cash'),200-rent);
    assert.equal(c.run('owner.cash'),ownerCash+rent);
  });
  for(const map of ['classic','expansion']) await test(map+' keeps its existing recovery turn',async()=>{
    const {c,events}=setup(map);
    await c.run('resolveLanding(visitor,spa,state.sessionId)');
    c.run('animateDiceRoll=async()=>{throw Error("Existing recovery must not roll")};');
    const position=c.run('visitor.position');
    await c.run('processTurn(visitor)');
    assert.equal(c.run('visitor.position'),position);
    assert.equal(c.run('visitor.cash'),200);
    assert.equal(c.run('visitor.effects.shield'),map==='expansion');
    assert(events.some(e=>e.label==='等待救援'));
  });
  await test('compact bankruptcy mode still ends on unpaid rent, without rescue',async()=>{
    const {c,events}=setup();c.run('state.gameMode="bankruptcy"');
    await c.run('resolveLanding(visitor,spa,state.sessionId)');
    assert.equal(c.run('state.gameOver'),true);
    assert.equal(c.run('visitor.cash'),0);
    assert.equal(c.run('visitor.effects.bankruptcyRelief'),false);
    assert.equal(c.run('visitor.effects.shield'),false);
    assert(!events.some(e=>e.label==='破产救助'));
  });
  for(const reversed of [false,true]) await test('all seven compact rush outcomes use real '+(reversed?'reverse':'forward')+' movement and one arrival',async()=>{
    const landings=[];
    for(let roll=0;roll<7;roll++) {
      const {c}=setup();c.captureLanding=tile=>landings.push({index:tile.index,spa:tile.lot?.effectId==='hot_spring_rest',special:tile.isSpecial});
      c.run(`visitor.position=8;visitor.effects.reversed=${reversed};resolveLanding=async(p,t)=>captureLanding(t);`);
      c.Math.random=()=> (roll+.1)/7;
      await c.run('resolveRushTile(visitor,state.sessionId,state.board[8])');
      assert.equal(landings.length,roll+1);
      assert.equal(landings.at(-1).index,(8+(reversed?-1:1)*(roll+2)+18)%18);
    }
    assert(landings.filter(t=>t.spa).length<=2,'No more than two direct onsen endpoints out of seven');
    assert(landings.some(t=>t.special),'Rush must offer outcomes beyond one landlord district');
  });
  console.log(checks+' compact recovery / rush checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
