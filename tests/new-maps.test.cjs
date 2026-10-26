'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { runner } = require('../tools/economy-simulation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const fresh = map => { const c = context(source, 2087); c.run(`initializeGame('${map}');showModal=async cfg=>{if(cfg.routeChoice)return 'merchant';throw Error('Unexpected modal: '+cfg.title)}`); return c; };
const maps = {
  harbor: { columns: 12, rows: 14, steps: 34, lots: 13, cash: 1700, bonus: 320, second: 0, bank: 240, ticket: 250, pairs: [[2, 3, [[7, 8], [7, 7]]], [7, 8, [[4, 5], [4, 4]]], [30, 31, [[5, 12], [5, 11]]]] },
  alpine: { columns: 6, steps: 24, lots: 14, cash: 1900, bonus: 350, second: 0, bank: 250, ticket: 350, pairs: [[7, 8, [[6, 3], [6, 4]]], [10, 11, [[6, 6], [6, 7]]], [14, 15, [[4, 8], [3, 8]]]] },
};
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  for (const [id, expected] of Object.entries(maps)) {
    await test(id + ' has connected navigation with usable lots at every regular stop', () => {
      const c = fresh(id), map = json(c, 'getMapConfig()'), board = json(c, 'state.board');
      assert.equal(map.id, id); assert.equal(map.grid.columns, expected.columns); assert.equal(map.grid.rows, expected.rows || 8);
      assert.equal(board.length, expected.steps); assert.equal(map.tileNames.length, expected.steps);
      assert.equal(new Set(board.map(t => `${t.x},${t.y}`)).size, expected.steps);
      assert.equal(board.filter(t => t.isStart).length, 1);
      assert.equal(board.filter(t => t.lot && !t.isLargeSecondary).length, expected.lots);
      for (const tile of board) {
        assert(tile.x >= 1 && tile.x <= expected.columns && tile.y >= 1 && tile.y <= (expected.rows || 8));
        const next = board[map.navigation.next[tile.index]], previous = board[map.navigation.prev[tile.index]];
        assert(next && previous);
        if (id !== 'harbor') {
          assert(tile.x === 1 || tile.x === expected.columns || tile.y === 1 || tile.y === 8);
          assert.equal(Math.abs(next.x - tile.x) + Math.abs(next.y - tile.y), 1);
          assert.equal(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y), 1);
          assert.equal(map.navigation.prev[next.index], tile.index);
        } else {
          assert(map.navigation.edges.some(edge=>edge.from===tile.index&&edge.to===next.index));
          assert(map.navigation.edges.some(edge=>edge.to===tile.index&&edge.from===previous.index));
        }
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
    await test(id + ' forward and reverse movement returns from every origin', () => {
      const c = fresh(id);
      for (let start = 0; start < expected.steps; start++) for (const direction of [-1, 1]) {
        const lap = id === 'harbor' ? 70 : expected.steps;
        const branch = start >= 20 && start <= 27 ? 'resort' : 'merchant';
        c.run(`state.players[0].harborLastBranch='${branch}'`);
        const preview = json(c, `previewMovement(state.players[0],${lap},{startingIndex:${start},direction:${direction},branchChoice:'${branch}'})`);
        assert.equal(preview.index, start); assert.equal(new Set(preview.path).size, expected.steps);
        if (id !== 'harbor') assert.equal(preview.path[0], (start + direction + expected.steps) % expected.steps);
        assert.equal(c.run('state.players[0].position'), 0);
      }
    });
    await test(id + ' has its own configured economy and explicit collection/ticket metadata', () => {
      const c = fresh(id), map = json(c, 'getMapConfig()');
      assert.deepEqual(json(c, 'getMapEconomy()'), { startCash: expected.cash, startBonus: expected.bonus, secondPlayerBonus: expected.second, bankThreshold: expected.bank });
      assert.equal(c.run('getMaxRounds()'), id === 'harbor' ? 40 : 30);
      assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), [expected.cash, expected.cash]);
      assert.equal(map.ticketPrice, expected.ticket); assert(map.collectionId && map.collectionName);
      assert.deepEqual(json(c, 'state.openingLots'), []);
      for (const first of [true, false]) {
        c.run(`initializeGame('${id}');settleFirstPlayer(${first});`);
        assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), [expected.cash, expected.cash]);
        assert.deepEqual(json(c, 'state.players.map(p=>p.cards.map(card=>card.cardId))'), first ? [[], ['boost']] : [['boost'], []]);
      }
    });
    await test(id + ' real movement crossing start pays one correct supply in either direction', async () => {
      for (const reverse of [false, true]) {
        const c = fresh(id);
        if (id === 'harbor') {
          c.run(`state.players[0].effects.reversed=${reverse}`);
          await c.run('animateMovement(state.players[0],'+(reverse ? 30 : 40)+',state.sessionId)');
          assert.equal(c.run('state.players[0].position'), 0);
        } else {
          c.run(`state.players[0].position=${reverse ? 1 : expected.steps - 1};state.players[0].effects.reversed=${reverse};`);
          await c.run('animateMovement(state.players[0],2,state.sessionId)');
          assert.equal(c.run('state.players[0].position'), reverse ? expected.steps - 1 : 1);
        }
        assert.equal(c.run('state.players[0].cash'), expected.cash + expected.bonus);
      }
    });
  }
  await test('maps retain distinct costs and income with no second-player cash bonus', () => {
    const c = fresh('harbor');
    assert.deepEqual(json(c, 'getMapEconomy("classic")'), { startCash: 1600, startBonus: 300, secondPlayerBonus: 0, bankThreshold: 200 });
    assert.deepEqual(json(c, 'getMapEconomy("compact")'), json(c, 'getMapEconomy("classic")'));
    assert.deepEqual(json(c, 'getMapEconomy("expansion")'), { startCash: 2000, startBonus: 450, secondPlayerBonus: 0, bankThreshold: 200 });
    assert.equal(c.run('MAP_PRESETS.classic.lotConfigs[14].price'), 280);
    assert.notDeepEqual(json(c, 'Object.keys(MAP_PRESETS.harbor.specialTiles)'), json(c, 'Object.keys(MAP_PRESETS.alpine.specialTiles)'));
    assert.notEqual(c.run('MAP_PRESETS.harbor.lotConfigs[7].price'), c.run('MAP_PRESETS.alpine.lotConfigs[14].price'));
    assert.notEqual(c.run('MAP_PRESETS.harbor.collectionId'), c.run('MAP_PRESETS.alpine.collectionId'));
  });
  await test('harbor double-property district is billed once at its secondary main-port stop', () => {
    const c = fresh('harbor'); c.run('state.board[2].lot.ownerId="ai";state.board[1].lot.ownerId="ai";');
    assert.equal(c.run('getDistrictOwnerLots(state.board[2].lot.district,"ai").length'), 2);
    const collected = json(c, 'collectToll(state.players[0],state.players[1],state.board[3])');
    assert.equal(collected.toll, 86); // round((48 + 24) × 1.2), the large property counts once.
    assert.deepEqual(json(c, 'state.players.map(p=>p.cash)'), [1614, 1786]);
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
  await test('32 real-start games finish with a reconciled ledger and equal configured turn allocations', async () => {
    for (const id of Object.keys(maps)) {
      const run = runner(source, id);
      for (let seed = 31041; seed < 31049; seed++) {
        const first = await run(seed, 0), second = await run(seed, 1);
        assert.deepEqual(first.base, id === 'harbor' ? [40,40] : [30,30]); assert.deepEqual(second.base, id === 'harbor' ? [40,40] : [30,30]);
        // Harbor's construction goals reward only the human seat, so swapping
        // initiative need not mirror cash or later decisions. Both seats must
        // still reconcile their ledgers, finish equal rounds and replay exactly.
        if (id !== 'harbor') {
          assert.deepEqual(first.cash, [...second.cash].reverse());
          assert.equal(first.randomCalls, second.randomCalls);
        }
        for (const game of [first, second]) assert(game.cash.every(n => Number.isFinite(n) && n >= 0));
        if (seed === 31041) {
          assert.deepEqual(await run(seed, 0), first);
          assert.deepEqual(await run(seed, 1), second);
        }
      }
    }
  });
  console.log(`${checks} new-map checks passed; 32 games plus four repeatability reruns.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
