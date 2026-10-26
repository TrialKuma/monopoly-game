'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const fresh = (map = 'harbor') => { const c = context(source, 135); c.run(`initializeGame('${map}')`); return c; };
const inventory = c => json(c, 'state.players.map(player=>player.cards.map(card=>card.cardId))');
const cash = c => json(c, 'state.players.map(player=>player.cash)');
const maps = ['classic', 'compact', 'expansion', 'harbor', 'alpine'];

for (const map of maps) for (const humanFirst of [true, false]) {
  const c = fresh(map), before = cash(c), secondIndex = humanFirst ? 1 : 0, secondId = humanFirst ? 'ai' : 'human';
  assert.equal(c.run('getMapEconomy().secondPlayerBonus'), 0, `${map}: no opening cash bonus remains`);
  assert.equal(before[0], before[1]);
  assert.deepEqual(inventory(c), [[], []], 'neither player receives a card before initiative');
  assert.equal(c.run('state.openingCompensation'), null);
  assert.equal(c.run(`settleFirstPlayer(${humanFirst})`), true);
  assert.deepEqual(inventory(c), humanFirst ? [[], ['boost']] : [['boost'], []]);
  assert.deepEqual(cash(c), before, `${map}: neither player receives opening cash`);
  assert.deepEqual(json(c, 'state.openingCompensation'), { playerId: secondId, amount: 0, cardId: 'boost' });
  assert.equal(c.run(`state.players[${secondIndex}].cards[0].source.type`), 'opening_compensation');
  assert.equal(c.run(`state.players[${secondIndex}].cards[0].source.mapId`), map);
  assert.deepEqual(json(c, 'state.players.map(player=>player.effects.speedBoost)'), [false, false], 'the card remains optional in the bag');
  const settled = json(c, '({cash:state.players.map(player=>player.cash),cards:state.players.map(player=>player.cards),first:state.firstPlayerIndex})');
  for (const repeatedFirst of [humanFirst, !humanFirst]) assert.equal(c.run(`settleFirstPlayer(${repeatedFirst})`), false);
  assert.deepEqual(json(c, '({cash:state.players.map(player=>player.cash),cards:state.players.map(player=>player.cards),first:state.firstPlayerIndex})'), settled, 'duplicate settlement cannot alter the first player or award again');
  c.run(`state.players[${secondIndex}].cards=[]`);
  assert.equal(c.run(`settleFirstPlayer(${humanFirst})`), false);
  assert.deepEqual(inventory(c), [[], []], 'a consumed compensation card cannot be recovered by replaying settlement');
}
console.log('PASS all five maps and both initiative outcomes: equal starting cash, one optional second-player card, no duplicate rewards');

for (const [index, map] of maps.entries()) for (const humanFirst of [true, false]) {
  const c = fresh(map), oldSession = c.run('state.sessionId'), nextMap = maps[(index + 1) % maps.length];
  c.run(`settleFirstPlayer(${humanFirst});initializeGame('${nextMap}')`);
  const before = cash(c);
  assert.notEqual(c.run('state.sessionId'), oldSession);
  assert.deepEqual(inventory(c), [[], []], 'a fresh match cannot inherit a previous bag');
  assert.equal(c.run('state.openingCompensation'), null);
  assert.equal(c.run(`settleFirstPlayer(false,${JSON.stringify(oldSession)})`), false);
  assert.deepEqual(inventory(c), [[], []]); assert.deepEqual(cash(c), before);
  assert.equal(c.run('state.initiativeResolved'), false, 'a stale callback cannot resolve the new match');
  assert.equal(c.run(`settleFirstPlayer(${!humanFirst})`), true);
  assert.deepEqual(inventory(c), humanFirst ? [['boost'], []] : [[], ['boost']]);
  assert.deepEqual(cash(c), before, 'the new match gives a card without adding cash');
}
console.log('PASS every map and starter role can restart onto another map without inheriting cards or stale initiative callbacks');
