'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function setup(random = .1, reduced = false) {
  const c = context(source), timers = new Map(), results = []; let timerId = 0, randomCalls = 0;
  c.run('initializeGame("harbor"); playOpeningCoinToss=realPlayOpeningCoinToss;');
  c.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  c.clearTimeout = id => timers.delete(id);
  c.matchMedia = () => ({ matches: reduced });
  c.Math.random = () => { randomCalls++; return random; };
  c.showModal = async () => 'flip';
  c.showContinueModal = async cfg => { results.push(cfg); return 'continue'; };
  return { c, timers, results, randomCalls: () => randomCalls, finish() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } } };
}
(async () => {
  for (const [random, first] of [[.1, true], [.9, false]]) {
    const f = setup(random), pending = f.c.run('coinFlipForFirstPlayer(state.sessionId)'); await flush();
    assert.equal(f.c.run('state.modal.openingCoin.phase'), 'tossing');
    assert.equal(f.c.run('state.modal.openingCoin.humanFirst'), first);
    assert.equal(f.c.run('state.initiativeResolved'), false, 'initiative waits for the toss');
    assert.equal(f.c.run('state.busy'), true); assert.equal(f.c.run('state.modal.buttons.length'), 0);
    assert.equal(f.randomCalls(), 1, 'animation cannot reroll the outcome');
    assert.equal([...f.timers.values()][0].delay, 1760);
    f.finish(); assert.equal(await pending, first);
    assert.equal(f.results[0].openingCoin.humanFirst, first);
    assert.equal(f.c.run('state.firstPlayerIndex'), first ? 0 : 1);
    assert.equal(f.c.run('state.openingCompensation.playerId'), first ? 'ai' : 'human');
    assert.equal(f.c.run('state.openingCompensation.cardId'), 'boost');
    assert.deepEqual(JSON.parse(f.c.run('JSON.stringify(state.players.map(player=>player.cards.map(card=>card.cardId)))')), first ? [[], ['boost']] : [['boost'], []]);
    assert.equal(f.results[0].message, `${first ? '对手' : '你'}获后手补偿 ¥400 · 双骰卡 ×1`);
    assert.equal(f.randomCalls(), 1);
  }
  console.log('PASS both faces match the single sampled initiative and only settle after the toss');
  {
    const f = setup(), pending = f.c.run('coinFlipForFirstPlayer(state.sessionId)'); await flush();
    const sid = f.c.run('state.sessionId'); f.c.run('initializeGame("classic")');
    assert.equal(await pending, undefined); assert.equal(f.timers.size, 0);
    assert.notEqual(f.c.run('state.sessionId'), sid); assert.equal(f.c.run('state.initiativeResolved'), false); assert.equal(f.results.length, 0);
    f.finish(); assert.equal(f.c.run('state.initiativeResolved'), false);
  }
  console.log('PASS restart cancels the timer and the stale toss cannot alter a new match');
  {
    const f = setup(), pending = f.c.run('coinFlipForFirstPlayer(state.sessionId)'); await flush(); f.c.run('hideModal()');
    assert.equal(await pending, undefined); assert.equal(f.timers.size, 0); assert.equal(f.results.length, 0); assert.equal(f.c.run('state.initiativeResolved'), false);
    const g = setup(); g.c.showModal = async () => 'cancel'; assert.equal(await g.c.run('coinFlipForFirstPlayer(state.sessionId)'), undefined); assert.equal(g.randomCalls(), 0);
  }
  console.log('PASS closing the toss or cancelling the initial prompt cannot award initiative');
  {
    const f = setup(.9, true), pending = f.c.run('coinFlipForFirstPlayer(state.sessionId)'); await flush();
    assert.equal(f.c.run('state.modal.openingCoin.reduced'), true); assert.equal([...f.timers.values()][0].delay, 120);
    f.finish(); assert.equal(await pending, false); assert.equal(f.c.run('state.firstPlayerIndex'), 1);
  }
  console.log('PASS reduced motion reveals the same correct result in 120 ms');
})().catch(error => { console.error(error); process.exitCode = 1; });
