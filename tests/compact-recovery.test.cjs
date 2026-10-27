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
    assert.equal(events.find(e=>e.label==='破产救助').message, '+¥200 · 护盾');
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
  await test('compact earthquake drops the tallest building, clears its owner and repairs at half cost once per game',async()=>{
    const {c,events}=setup();
    c.run(`visitor.cash=1000;owner.cash=1000;
      state.board[4].lot.ownerId=owner.id;state.board[4].lot.level=3;
      state.board[14].lot.ownerId=visitor.id;state.board[14].lot.level=1;
      var eventTile=state.board.find(t=>t.special?.type==='event');visitor.position=eventTile.index;`);
    c.Math.random=()=>.1;
    await c.run('resolveEventTile(visitor,eventTile,state.sessionId)');
    assert.equal(c.run('state.quakeHappened'),true);
    assert.equal(c.run('state.board[4].lot.ownerId'),null);
    assert.equal(c.run('state.board[4].lot.ruined'),true);
    assert.equal(c.run('state.board[14].lot.ownerId'),c.run('visitor.id'));
    assert(events.some(e=>e.title==='地震！'));
    const cost=c.run('getPropertyCost(state.board[4].lot)');
    assert.equal(c.run('getLotPurchasePrice(state.board[4].lot)'),Math.round(cost*.5));
    assert.equal(c.run('buyLot(visitor,state.board[4],false)'),true);
    assert.equal(c.run('state.board[4].lot.level'),3);
    assert.equal(c.run('state.board[4].lot.ruined'),false);
    assert.equal(c.run('visitor.cash'),1000-Math.round(cost*.5));
    await c.run('resolveEventTile(visitor,eventTile,state.sessionId)');
    assert.equal(c.run('state.board.filter(t=>t.lot?.ruined).length'),0,'only one earthquake per game');
  });
  await test('compact passing start pays the larger supply and builds nothing',async()=>{
    const {c,events}=setup();
    c.run(`visitor.cash=500;visitor.position=17;
      state.board[1].lot.ownerId=visitor.id;state.board[4].lot.ownerId=visitor.id;`);
    await c.run('animateMovement(visitor,2,state.sessionId)');
    assert.equal(c.run('visitor.position'),1);
    assert.equal(c.run('visitor.cash'),950);
    assert.equal(c.run('state.board[1].lot.level+state.board[4].lot.level'),0);
    assert.equal(events.find(e=>e.label==='市政府补给').message,'');
  });
  console.log(checks+' compact recovery / earthquake checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
