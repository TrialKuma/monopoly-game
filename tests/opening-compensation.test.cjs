'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const fresh = (map = 'harbor') => { const c = context(source, 135); c.run(`initializeGame('${map}')`); return c; };
const inventory = c => json(c, 'state.players.map(player=>player.cards.map(card=>card.cardId))');
const cash = c => json(c, 'state.players.map(player=>player.cash)');

for (const humanFirst of [true, false]) {
  const c = fresh(), secondIndex = humanFirst ? 1 : 0, secondId = humanFirst ? 'ai' : 'human';
  assert.deepEqual(inventory(c), [[], []], 'neither player receives a card before initiative');
  assert.equal(c.run('state.openingCompensation'), null);
  assert.equal(c.run(`settleFirstPlayer(${humanFirst})`), true);
  assert.deepEqual(inventory(c), humanFirst ? [[], ['boost']] : [['boost'], []]);
  assert.deepEqual(cash(c), humanFirst ? [1700, 2100] : [2100, 1700], 'cash compensation remains unchanged');
  assert.deepEqual(json(c, 'state.openingCompensation'), { playerId: secondId, amount: 400, cardId: 'boost' });
  assert.equal(c.run(`state.players[${secondIndex}].cards[0].source.type`), 'opening_compensation');
  assert.equal(c.run(`state.players[${secondIndex}].cards[0].source.mapId`), 'harbor');
  assert.deepEqual(json(c, 'state.players.map(player=>player.effects.speedBoost)'), [false, false], 'the card remains optional in the bag');
  const settled = json(c, '({cash:state.players.map(player=>player.cash),cards:state.players.map(player=>player.cards),first:state.firstPlayerIndex})');
  for (const repeatedFirst of [humanFirst, !humanFirst]) assert.equal(c.run(`settleFirstPlayer(${repeatedFirst})`), false);
  assert.deepEqual(json(c, '({cash:state.players.map(player=>player.cash),cards:state.players.map(player=>player.cards),first:state.firstPlayerIndex})'), settled, 'duplicate settlement cannot alter the first player or award again');
  c.run(`state.players[${secondIndex}].cards=[]`);
  assert.equal(c.run(`settleFirstPlayer(${humanFirst})`), false);
  assert.deepEqual(inventory(c), [[], []], 'a consumed compensation card cannot be recovered by replaying settlement');
}
console.log('PASS either initiative outcome gives only the second player one optional double-dice card; cash and replay protection hold');

{
  const c = fresh(), oldSession = c.run('state.sessionId');
  c.run('settleFirstPlayer(false);initializeGame("harbor")');
  assert.notEqual(c.run('state.sessionId'), oldSession);
  assert.deepEqual(inventory(c), [[], []], 'a fresh match cannot inherit a previous bag');
  assert.equal(c.run('state.openingCompensation'), null);
  assert.equal(c.run(`settleFirstPlayer(false,${JSON.stringify(oldSession)})`), false);
  assert.deepEqual(inventory(c), [[], []]); assert.deepEqual(cash(c), [1700, 1700]);
  assert.equal(c.run('state.initiativeResolved'), false, 'a stale callback cannot resolve the new match');
  assert.equal(c.run('settleFirstPlayer(true)'), true);
  assert.deepEqual(inventory(c), [[], ['boost']]);
}
console.log('PASS restarting clears the old reward; stale session callbacks cannot grant cards or resolve initiative');

for (const map of ['classic', 'compact', 'expansion', 'alpine']) for (const humanFirst of [true, false]) {
  const c = fresh(map), before = cash(c), second = humanFirst ? 1 : 0, bonus = c.run('getMapEconomy().secondPlayerBonus');
  c.run(`settleFirstPlayer(${humanFirst})`); before[second] += bonus;
  assert.deepEqual(cash(c), before); assert.deepEqual(inventory(c), [[], []]);
  assert.equal(c.run('state.openingCompensation.cardId'), undefined, 'other maps keep their cash-only opening compensation');
}
console.log('PASS all other maps retain cash-only second-player compensation');
