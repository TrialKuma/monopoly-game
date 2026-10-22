'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { runner } = require('../tools/economy-simulation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const fresh = map => { const c = context(source, 2087); c.run(`initializeGame('${map}')`); return c; };
const maps = {
  harbor: { columns: 5, steps: 22, lots: 13, cash: 1700, bonus: 320, second: 400, bank: 240, ticket: 250, pairs: [[5, 6, [[5, 2], [5, 3]]], [7, 8, [[5, 4], [5, 5]]], [14, 15, [[2, 8], [1, 8]]]] },
  alpine: { columns: 6, steps: 24, lots: 14, cash: 1900, bonus: 350, second: 450, bank: 250, ticket: 350, pairs: [[7, 8, [[6, 3], [6, 4]]], [10, 11, [[6, 6], [6, 7]]], [14, 15, [[4, 8], [3, 8]]]] },
};
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  for (const [id, expected] of Object.entries(maps)) {
    await test(id + ' is a complete tall connected loop with usable lots at every regular stop', () => {
      const c = fresh(id), map = json(c, 'getMapConfig()'), board = json(c, 'state.board');
      assert.equal(map.id, id); assert.equal(map.grid.columns, expected.columns); assert.equal(map.grid.rows, 8);
      assert.equal(board.length, expected.steps); assert.equal(map.tileNames.length, expected.steps);
      assert.equal(new Set(board.map(t => `${t.x},${t.y}`)).size, expected.steps);
      assert.equal(board.filter(t => t.isStart).length, 1);
      assert.equal(board.filter(t => t.lot && !t.isLargeSecondary).length, expected.lots);
      for (const tile of board) {
        assert(tile.x >= 1 && tile.x <= expected.columns && tile.y >= 1 && tile.y <= 8);
        assert(tile.x === 1 || tile.x === expected.columns || tile.y === 1 || tile.y === 8);
        const next = board[map.navigation.next[tile.index]], previous = board[map.navigation.prev[tile.index]];
        assert.equal(Math.abs(next.x - tile.x) + Math.abs(next.y - tile.y), 1);
        assert.equal(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y), 1);
        assert.equal(map.navigation.prev[next.index], tile.index);
        assert(tile.name && (tile.isStart || tile.isSpecial || tile.lot), 'every step has a playable role');
        if (tile.lot) {
          assert(map.districtColors[tile.lot.district], 'every district has a color');
          assert.equal(tile.lot.tolls.length, 4); assert.equal(tile.lot.buildCosts.length, 4);
          assert(tile.lot.price > 0 && tile.lot.tolls.every(n => n > 0));
        }
      }
    });
    await test(id + ' preserves three shared double properties on adjacent straight cells', () => {
      const c = fresh(id);
      for (const [primary, secondary, positions] of expected.pairs) {
        assert.equal(c.run(`state.board[${primary}].lot === state.board[${secondary}].lot`), true);
        assert.equal(c.run(`state.board[${secondary}].largePrimaryIndex`), primary);
        assert.equal(c.run(`state.board[${primary}].lot.isLarge`), true);
        assert.deepEqual(json(c, `[state.board[${primary}],state.board[${secondary}]].map(t=>[t.x,t.y])`), positions);
        assert.equal(c.run(`state.board[${primary}].name===state.board[${secondary}].name`), true);
      }
    });
    await test(id + ' forward and reverse movement visits all steps from every origin', () => {
      const c = fresh(id);
      for (let start = 0; start < expected.steps; start++) for (const direction of [-1, 1]) {
        const preview = json(c, `previewMovement(state.players[0],${expected.steps},{startingIndex:${start},direction:${direction}})`);
        assert.equal(preview.index, start); assert.equal(new Set(preview.path).size, expected.steps);
        assert.equal(preview.path[0], (start + direction + expected.steps) % expected.steps);
        assert.equal(c.run('state.players[0].position'), 0);
      }
    });
    await test(id + ' has its own 30-round economy and explicit collection/ticket metadata', () => {
      const c = fresh(id), map = json(c, 'getMapConfig()');
      assert.deepEqual(json(c, 'getMapEconomy()'), { startCash: expected.cash, startBonus: expected.bonus, secondPlayerBonus: expected.second, bankThreshold: expected.bank });
      assert.equal(c.run('getMaxRounds()'), 30);
      assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), [expected.cash, expected.cash]);
      assert.equal(map.ticketPrice, expected.ticket); assert(map.collectionId && map.collectionName);
      assert.deepEqual(json(c, 'state.openingLots'), []);
      for (const first of [true, false]) {
        c.run(`initializeGame('${id}');settleFirstPlayer(${first});`);
        assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), first ? [expected.cash, expected.cash + expected.second] : [expected.cash + expected.second, expected.cash]);
      }
    });
    await test(id + ' real movement crossing start pays one correct supply in either direction', async () => {
      for (const reverse of [false, true]) {
        const c = fresh(id);
        c.run(`state.players[0].position=${reverse ? 1 : expected.steps - 1};state.players[0].effects.reversed=${reverse};`);
        await c.run('animateMovement(state.players[0],2,state.sessionId)');
        assert.equal(c.run('state.players[0].position'), reverse ? expected.steps - 1 : 1);
        assert.equal(c.run('state.players[0].cash'), expected.cash + expected.bonus);
      }
    });
  }
  await test('old maps retain their original economies while new maps have different costs and public stops', () => {
    const c = fresh('harbor');
    assert.deepEqual(json(c, 'getMapEconomy("classic")'), { startCash: 1600, startBonus: 300, secondPlayerBonus: 500, bankThreshold: 200 });
    assert.deepEqual(json(c, 'getMapEconomy("compact")'), json(c, 'getMapEconomy("classic")'));
    assert.deepEqual(json(c, 'getMapEconomy("expansion")'), { startCash: 2000, startBonus: 450, secondPlayerBonus: 300, bankThreshold: 200 });
    assert.equal(c.run('MAP_PRESETS.classic.lotConfigs[14].price'), 280);
    assert.notDeepEqual(json(c, 'Object.keys(MAP_PRESETS.harbor.specialTiles)'), json(c, 'Object.keys(MAP_PRESETS.alpine.specialTiles)'));
    assert.notEqual(c.run('MAP_PRESETS.harbor.lotConfigs[14].price'), c.run('MAP_PRESETS.alpine.lotConfigs[14].price'));
    assert.notEqual(c.run('MAP_PRESETS.harbor.collectionId'), c.run('MAP_PRESETS.alpine.collectionId'));
  });
  await test('harbor double-property district is billed once at its secondary lighthouse stop', () => {
    const c = fresh('harbor'); c.run('state.board[5].lot.ownerId="ai";state.board[7].lot.ownerId="ai";');
    assert.equal(c.run('getDistrictOwnerLots(state.board[7].lot.district,"ai").length'), 2);
    const collected = json(c, 'collectToll(state.players[0],state.players[1],state.board[8])');
    assert.equal(collected.toll, 132); // (58 + 52) × 1.2, not four billable lots.
    assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), [1568, 1832]);
  });
  await test('all alpine cable-car outcomes move in the current direction and settle once', async () => {
    for (const reversed of [false, true]) for (const steps of [2, 3, 4]) {
      const c = fresh('alpine'), landed = [];
      c.captureLanding = index => landed.push(index);
      c.Math.random = () => (steps - 2 + .2) / 3;
      c.run(`state.players[0].position=23;state.players[0].effects.reversed=${reversed};resolveLanding=async(p,t)=>captureLanding(t.index);`);
      await c.run('resolveSpecialTile(state.players[0],state.board[23],state.sessionId)');
      const destination = (23 + (reversed ? -steps : steps) + 24) % 24;
      assert.deepEqual(landed, [destination]); assert.equal(c.run('state.players[0].position'), destination);
      assert.equal(c.run('state.players[0].cash'), reversed ? 1900 : 2250);
    }
  });
  await test('32 real-start games finish with a reconciled ledger and equal 30-turn allocations', async () => {
    for (const id of Object.keys(maps)) {
      const run = runner(source, id);
      for (let seed = 31041; seed < 31049; seed++) {
        const first = await run(seed, 0), second = await run(seed, 1);
        assert.deepEqual(first.base, [30, 30]); assert.deepEqual(second.base, [30, 30]);
        assert.deepEqual(first.cash, [...second.cash].reverse());
        assert.equal(first.randomCalls, second.randomCalls);
        assert(first.cash.every(n => Number.isFinite(n) && n >= 0));
        if (seed === 31041) assert.deepEqual(await run(seed, 0), first);
      }
    }
  });
  console.log(`${checks} new-map checks passed; 32 games plus two repeatability reruns.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
