'use strict';
// Real rule entry points with only UI, clocks and the test's next dice roll
// controlled. In particular resolveLanding and collectToll remain unchanged.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {context} = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8');
const checks = [];
async function test(name, work) { await work(); checks.push(name); }
const value = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
function setup(map = 'classic', secondary = false) {
  const c = context(source, 73), events = [];
  c.capture = cfg => events.push(cfg);
  c.run(`initializeGame('${map}');showContinueModal=async cfg=>capture(cfg);
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});
    var spa=state.board.find(t=>t.lot?.effectId==='hot_spring_rest' && ${secondary ? 't.isLargeSecondary' : '!t.isLargeSecondary'});
    spa.lot.ownerId='ai';spa.lot.level=1;state.players[0].cash=5000;state.players[0].position=spa.index;`);
  return {c, events};
}
(async () => {
  for (const map of ['classic', 'compact', 'expansion']) for (const secondary of [false, true]) {
    await test(`${map} ${secondary ? 'second' : 'first'} half: rest and trap do not bill or re-arm`, async () => {
      const {c, events} = setup(map, secondary);
      await c.run('resolveLanding(state.players[0],spa,state.sessionId)');
      assert.equal(c.run('state.players[0].effects.hotSpringRest'), true);
      const paid = value(c, 'state.players.map(p=>p.cash)');
      assert.equal(5000 - paid[0], c.run('spa.lot.tolls[1]'));
      c.run('state.players[0].effects.frozen=true;animateDiceRoll=async()=>{throw Error("Rest must not roll")};');
      const oldEvents = events.length;
      await c.run('processTurn(state.players[0])');
      assert.deepEqual(value(c, 'state.players.map(p=>p.cash)'), paid);
      assert.equal(c.run('state.players[0].effects.hotSpringRest'), false);
      assert.equal(c.run('state.players[0].effects.frozen'), false);
      assert.equal(c.run('state.currentPlayerIndex'), 1);
      assert.equal(events.length, oldEvents + 1);
      assert.match(events.at(-1).message, /不重复收租/);
      assert.doesNotMatch(events.at(-1).message, /重新结算/);
      // Opponent completes its action. The recovered player now really rolls.
      c.run('endTurn();animateDiceRoll=async()=>3;state.players[0].isAi=true;');
      await c.run('processTurn(state.players[0])');
      assert.notEqual(c.run('state.players[0].position'), c.run('spa.index'));
    });
  }
  await test('one ordinary onsen rest still consumes exactly one action', async () => {
    const {c} = setup();
    await c.run('resolveLanding(state.players[0],spa,state.sessionId)');
    const paid = value(c, 'state.players.map(p=>p.cash)');
    await c.run('processTurn(state.players[0])');
    assert.deepEqual(value(c, 'state.players.map(p=>p.cash)'), paid);
    assert.equal(c.run('state.players[0].effects.hotSpringRest'), false);
    assert.equal(c.run('state.currentPlayerIndex'), 1);
  });
  await test('poor onsen visitor gets one relief rest, without a second onsen hold', async () => {
    const {c, events} = setup();
    c.run('state.players[0].cash=10');
    await c.run('resolveLanding(state.players[0],spa,state.sessionId)');
    assert.equal(c.run('state.players[0].cash'), 200);
    assert.equal(c.run('state.players[0].effects.bankruptcyRelief'), true);
    assert.equal(c.run('state.players[0].effects.hotSpringRest'), false);
    assert(!events.some(e => e.label === '温泉庄园'));
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].cash'), 200);
    assert.equal(c.run('state.players[0].effects.bankruptcyRelief'), false);
  });
  await test('general trap still settles its current ordinary property once', async () => {
    const {c} = setup();
    c.run(`var ordinary=state.board.find(t=>t.lot && !t.lot.effectId && !t.isLargeSecondary);
      ordinary.lot.ownerId='ai';ordinary.lot.level=1;state.players[0].position=ordinary.index;
      state.players[0].effects.frozen=true;`);
    const paid = c.run('ordinary.lot.tolls[1]');
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].cash'), 5000 - paid);
    assert.equal(c.run('state.players[0].effects.frozen'), false);
    assert.equal(c.run('state.players[0].position'), c.run('ordinary.index'));
  });
  await test('genuine movement onto the other onsen half still counts as a new landing', async () => {
    const {c} = setup();
    await c.run('resolveLanding(state.players[0],spa,state.sessionId)');
    await c.run('processTurn(state.players[0])');
    const cash = c.run('state.players[0].cash');
    c.run('endTurn();animateDiceRoll=async()=>1;');
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].position'), c.run('spa.index + 1'));
    assert.equal(c.run('state.players[0].cash'), cash - c.run('spa.lot.tolls[1]'));
    assert.equal(c.run('state.players[0].effects.hotSpringRest'), true);
  });
  await test('trap cast during onsen rest explains its non-stacking result', async () => {
    const {c, events} = setup();
    await c.run('resolveLanding(state.players[0],spa,state.sessionId)');
    await c.run('executeCardEffect(state.players[1],{id:"freeze"},state.sessionId)');
    assert.equal(c.run('state.players[0].effects.frozen'), true);
    assert.match(events.at(-1).message, /不重复收租或追加休息/);
    const cash = c.run('state.players[0].cash');
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].cash'), cash);
    assert.equal(c.run('state.players[0].effects.hotSpringRest'), false);
    assert.equal(c.run('state.players[0].effects.frozen'), false);
  });
  await test('rolling six into onsen still spends the extra action on its one rest', async () => {
    const {c} = setup();
    c.run('state.players[0].position=spa.index-6;animateDiceRoll=async()=>6;');
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].position'), c.run('spa.index'));
    assert.equal(c.run('state.players[0].cash'), 5000 - c.run('spa.lot.tolls[1]'));
    assert.equal(c.run('state.players[0].effects.hotSpringRest'), false);
    assert.equal(c.run('state.currentPlayerIndex'), 1);
  });
  await test('restart during rest presentation never advances the new game', async () => {
    const {c} = setup();
    c.run('state.players[0].effects.hotSpringRest=true;state.players[0].effects.frozen=true;');
    let release;
    c.hold = () => new Promise(resolve => release = resolve);
    c.run('showContinueModal=()=>hold()');
    const pending = c.run('processTurn(state.players[0])');
    await Promise.resolve();
    c.run('initializeGame("compact")');
    release(); await pending;
    assert.equal(c.run('state.currentPlayerIndex'), 0);
    assert.equal(c.run('state.round'), 1);
    assert.equal(c.run('state.currentMapId'), 'compact');
  });
  for (const effect of ['hotSpringRest', 'frozen', 'bankruptcyRelief']) {
    await test(`real AI card draw avoids redundant freeze during ${effect}`, async () => {
      const {c, events} = setup();
      c.run(`state.players[0].effects.${effect}=true;
        state.board.find(t=>t.lot && !t.lot.effectId && !t.isLargeSecondary).lot.ownerId='human';
        var offered=['freeze','boost','doubleRent'].map(id=>CARD_POOL.find(card=>card.id===id));
        CARD_POOL.splice(0,CARD_POOL.length,...offered);`);
      const before = value(c, 'state.players[0].effects');
      await c.run('resolveCardDraw(state.players[1],state.sessionId)');
      assert.match(events.find(e=>e.label==='翻牌事件').title, /加速引擎/);
      assert.equal(c.run('state.players[1].effects.speedBoost'), true);
      assert.deepEqual(value(c, 'state.players[0].effects'), before);
    });
  }
  await test('AI still chooses effective freeze at its original priority', async () => {
    const {c, events} = setup();
    c.run(`state.board.find(t=>t.lot && !t.lot.effectId && !t.isLargeSecondary).lot.ownerId='human';
      var offered=['freeze','boost','doubleRent'].map(id=>CARD_POOL.find(card=>card.id===id));
      CARD_POOL.splice(0,CARD_POOL.length,...offered);`);
    await c.run('resolveCardDraw(state.players[1],state.sessionId)');
    assert.match(events.find(e=>e.label==='翻牌事件').title, /绊脚术/);
    assert.equal(c.run('state.players[0].effects.frozen'), true);
    assert.equal(c.run('state.players[1].effects.speedBoost'), false);
  });
  await test('mandatory AI draw with only freeze still returns a usable card', async () => {
    const {c, events} = setup();
    c.run(`state.players[0].effects.hotSpringRest=true;
      var onlyFreeze=CARD_POOL.find(card=>card.id==='freeze');
      CARD_POOL.splice(0,CARD_POOL.length,onlyFreeze);`);
    await c.run('resolveCardDraw(state.players[1],state.sessionId)');
    assert.match(events.find(e=>e.label==='翻牌事件').title, /绊脚术/);
    assert.match(events.at(-1).message, /不重复收租或追加休息/);
  });
  console.log('PASS', checks.length, 'rest / trap / rent / recovery checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
