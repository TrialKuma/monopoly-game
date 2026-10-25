'use strict';
const assert = require('node:assert/strict');
const { STORAGE_KEY, PROJECTS, TOWN_DISTRICTS, TownPlan, createStore, validProfile } = require('../progression.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(raw) {
  let value = raw ?? null, blocked = false;
  const storage = { getItem: () => value, setItem(key, next) { assert.equal(key, STORAGE_KEY); if (blocked) throw Error('QuotaExceededError'); value = next; } };
  const create = () => createStore(storage, () => '2026-10-25T12:00:00.000Z');
  return { store: create(), create, raw: () => value, fail: flag => { blocked = flag; } };
}
function complete(f, id, mapId, cash = 5000) {
  const price = mapId === 'harbor' ? 250 : mapId === 'alpine' ? 350 : 100;
  assert.equal(f.store.enter({ runId: id, mapId, price }).ok, true);
  const settled = f.store.settle({ eligible: true, runId: id, mapId, mapName: mapId, mode: 'rounds', reason: 'rounds', winnerId: 'human', rounds: 30, humanCash: cash, collectionCount: 3,
    buildingCards: mapId === 'harbor' ? [{ cardId: 'harbor_villa', count: 3 }, { cardId: 'harbor_finance', count: 1 }] : [] });
  assert.equal(settled.ok, true); return settled;
}
function funded() {
  const f = fixture(); complete(f, 'harbor', 'harbor');
  complete(f, 'city-1', 'classic'); complete(f, 'city-2', 'classic');
  complete(f, 'alpine-1', 'alpine'); complete(f, 'alpine-2', 'alpine'); return f;
}
test('shared plan opens one contiguous outward district at a time', () => {
  const dimensions = [[6, 6], [8, 6], [8, 8], [10, 8], [10, 10]];
  let previous = new Set();
  dimensions.forEach(([width, height], stage) => {
    const land = TownPlan.getLand({ landStage: stage, size: Math.max(width, height) });
    assert.equal(land.stage, stage); assert.equal(land.width, width); assert.equal(land.height, height);
    assert.equal(land.cells.length, width * height); assert.equal(land.size, Math.max(width, height));
    const cells = new Set(land.cells.map(cell => `${cell.x},${cell.y}`));
    for (const cell of previous) assert.ok(cells.has(cell), 'existing land must stay open');
    if (stage) {
      const district = TOWN_DISTRICTS[stage - 1]; assert.equal(cells.size - previous.size, district.w * district.h);
      for (let y = district.y; y < district.y + district.h; y++) for (let x = district.x; x < district.x + district.w; x++) assert.ok(!previous.has(`${x},${y}`) && cells.has(`${x},${y}`));
    }
    assert.equal(land.next?.stage ?? null, stage < 4 ? stage + 1 : null); previous = cells;
  });
  assert.equal(TownPlan.getLand({ size: 8 }).stage, 2);
  assert.equal(TownPlan.isCellOpen({ landStage: 1, size: 8 }, 7, 5), true);
  assert.equal(TownPlan.isCellOpen({ landStage: 1, size: 8 }, 7, 6), false);
  assert.equal(TownPlan.isRectOpen({ landStage: 1 }, 7, 0, 2, 1), false);
});
test('all four expansions debit exact shared resources once, without shifting existing buildings', () => {
  const f = funded(), made = f.store.town.place({ cardId: 'harbor_villa', x: 5, y: 5 });
  const before = made.profile, buildings = structuredClone(before.town.buildings);
  let spent = 0, used = { city_stamp: 0, harbor_shell: 0, alpine_crystal: 0 };
  for (const district of TOWN_DISTRICTS) {
    const result = f.store.town.expand({ expectedStage: district.stage }); assert.equal(result.ok, true);
    spent += district.coins; used[district.collectionId] += district.count;
    assert.equal(result.profile.wallet, before.wallet - spent);
    assert.equal(result.profile.town.landStage, district.stage);
    assert.deepEqual(result.profile.town.buildings, buildings);
    for (const id of Object.keys(used)) assert.equal(result.profile.collections[id], before.collections[id] - used[id]);
    const raw = f.raw();
    assert.equal(f.create().town.expand({ expectedStage: district.stage }).duplicate, true);
    assert.equal(f.create().town.expand({ expectedStage: district.stage, actionId: 'repeat-' + district.stage }).duplicate, true);
    assert.equal(f.raw(), raw); assert.equal(validProfile(result.profile), true);
  }
  assert.equal(f.create().town.getLand(f.create().read().profile.town).next, null);
  assert.equal(f.store.town.expand({ expectedStage: 5 }).error, 'invalid');
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 9, y: 9 }).ok, true);
});
test('new expansion requires a current explicit stage, sufficient materials and sufficient cash', () => {
  const f = fixture(), raw = f.raw();
  assert.equal(f.store.town.expand().error, 'invalid');
  assert.equal(f.store.town.expand({ expectedSize: 8 }).error, 'invalid');
  assert.equal(f.store.town.expand({ expectedStage: 2 }).error, 'conflict');
  const missing = f.store.town.expand({ expectedStage: 1 });
  assert.equal(missing.error, 'missing_collection'); assert.equal(missing.collectionId, 'harbor_shell'); assert.equal(missing.shortfall, 2); assert.equal(f.raw(), raw);
  complete(f, 'poor', 'harbor', 0);
  f.store.enter({ runId: 'spend', mapId: 'classic', price: 500 });
  const before = f.raw(); assert.equal(f.store.town.expand({ expectedStage: 1 }).error, 'insufficient'); assert.equal(f.raw(), before);
});
test('placement, rotation and restore cannot use unopened southern or eastern cells', () => {
  const f = funded(); f.store.town.expand({ expectedStage: 1 });
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 6 }).error, 'out_of_bounds');
  assert.equal(f.store.town.place({ cardId: 'harbor_finance', x: 7, y: 4, rotation: 0 }).error, 'out_of_bounds');
  const built = f.store.town.place({ cardId: 'harbor_finance', x: 7, y: 4, rotation: 1 }); assert.equal(built.ok, true);
  assert.equal(f.store.town.move({ buildingId: built.building.id, x: 7, y: 5, rotation: 1 }).error, 'out_of_bounds');
  f.store.town.store({ buildingId: built.building.id });
  assert.equal(f.store.town.restore({ buildingId: built.building.id, x: 0, y: 6 }).error, 'out_of_bounds');
  f.store.town.expand({ expectedStage: 2 }); assert.equal(f.store.town.restore({ buildingId: built.building.id, x: 0, y: 6 }).ok, true);
  f.store.town.expand({ expectedStage: 3 });
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 9, y: 7 }).ok, true);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 9, y: 8 }).error, 'out_of_bounds');
});
test('public landscapes and land spend the same inventory while retaining their existing prices', () => {
  const f = funded(), before = f.store.read().profile;
  for (const project of PROJECTS) {
    const bought = f.store.town.buyLandscape({ projectId: project.id, expectedLevel: 1 });
    assert.equal(bought.ok, true); assert.equal(bought.profile.projectLevels[project.id], 1);
    assert.equal(f.store.town.buyLandscape({ projectId: project.id, expectedLevel: 1 }).duplicate, true);
  }
  for (const district of TOWN_DISTRICTS) assert.equal(f.store.town.expand({ expectedStage: district.stage }).ok, true);
  const after = f.store.read().profile;
  assert.equal(after.wallet, before.wallet - PROJECTS.reduce((sum, p) => sum + p.coins[0], 0) - TOWN_DISTRICTS.reduce((sum, d) => sum + d.coins, 0));
  assert.deepEqual(after.collections, { city_stamp: 0, harbor_shell: 0, alpine_crystal: 2 });
  assert.equal(f.store.town.buyLandscape({ projectId: 'waterfront', expectedLevel: 2 }).error, 'missing_collection');
  assert.equal(f.store.town.buyLandscape({ projectId: 'waterfront' }).error, 'invalid');
  assert.equal(validProfile(after), true);
});
test('failed writes roll back land, coins and materials, then safely retry once', () => {
  const f = funded();
  for (const operation of [() => f.store.town.expand({ expectedStage: 1 }), () => f.store.town.buyLandscape({ projectId: 'garden', expectedLevel: 1 })]) {
    const before = f.raw(); f.fail(true); assert.equal(operation().error, 'save_failed'); assert.equal(f.raw(), before);
    f.fail(false); assert.equal(operation().ok, true); const saved = f.raw(); assert.equal(operation().duplicate, true); assert.equal(f.raw(), saved);
  }
});
test('v3 expanded saves preserve the paid 8×8 land, all balances, layouts and landscape levels', () => {
  const seed = funded(); complete(seed, 'harbor-extra', 'harbor'); seed.store.town.place({ cardId: 'harbor_villa', x: 5, y: 5 });
  for (const project of PROJECTS) for (const expectedLevel of [1, 2, 3]) assert.equal(seed.store.town.buyLandscape({ projectId: project.id, expectedLevel }).ok, true);
  complete(seed, 'city-extra', 'classic');
  const old = seed.store.read().profile; old.version = 3; delete old.town.landStage;
  old.wallet -= 800 + 120; old.town.size = 8;
  old.town.actions.push({ id: 'historic-land', type: 'expand', coins: 800, size: 8, createdAt: '2026-10-24T12:00:00.000Z' });
  old.town.actions.push({ id: 'historic-build', type: 'place', coins: 120, cardId: 'harbor_villa', buildingId: 'building_historic-build', x: 7, y: 7, rotation: 0, createdAt: '2026-10-24T12:01:00.000Z' });
  old.town.buildings.push({ id: 'building_historic-build', cardId: 'harbor_villa', x: 7, y: 7, rotation: 0, stored: false });
  assert.equal(validProfile(old), true);
  const raw = JSON.stringify(old), f = fixture(raw); f.fail(true); assert.equal(f.store.read().error, 'migration_failed'); assert.equal(f.raw(), raw);
  f.fail(false); const migrated = f.store.read(); assert.equal(migrated.migrated, true); assert.equal(migrated.profile.version, 4); assert.equal(migrated.profile.town.landStage, 2);
  for (const key of ['wallet', 'collections', 'projectLevels', 'purchases', 'receipts', 'entries']) assert.deepEqual(migrated.profile[key], old[key], key);
  for (const key of ['buildings', 'actions', 'cards', 'targetCardId']) assert.deepEqual(migrated.profile.town[key], old.town[key], key);
  assert.equal(f.store.town.expand({ expectedStage: 1 }).duplicate, true); assert.equal(f.store.town.expand({ expectedStage: 2 }).duplicate, true);
  const expanded = f.store.town.expand({ expectedStage: 3 }); assert.equal(expanded.ok, true); assert.equal(expanded.profile.wallet, old.wallet - 1200);
  assert.equal(f.create().read().profile.town.landStage, 3);
});
test('v3 base land migration keeps cards and inventory without granting land', () => {
  const seed = funded(), old = seed.store.read().profile; old.version = 3; delete old.town.landStage;
  const f = fixture(JSON.stringify(old)), migrated = f.store.read();
  assert.equal(migrated.migrated, true); assert.equal(migrated.profile.town.landStage, 0);
  assert.deepEqual(migrated.profile.town.cards, old.town.cards); assert.deepEqual(migrated.profile.collections, old.collections);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 6, y: 0 }).error, 'out_of_bounds');
});
test('ledger replay rejects forged place, move and restore actions inside unopened land', () => {
  for (const type of ['place', 'move', 'restore']) {
    const f = funded(); f.store.town.expand({ expectedStage: 1 });
    const built = f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0 });
    if (type === 'move') assert.equal(f.store.town.move({ buildingId: built.building.id, x: 1, y: 1 }).ok, true);
    if (type === 'restore') { f.store.town.store({ buildingId: built.building.id }); assert.equal(f.store.town.restore({ buildingId: built.building.id, x: 1, y: 1 }).ok, true); }
    const broken = f.store.read().profile, action = broken.town.actions.at(-1);
    assert.equal(action.type, type); action.x = 7; action.y = 6;
    Object.assign(broken.town.buildings[0], { x: 7, y: 6 });
    const raw = JSON.stringify(broken), corrupt = fixture(raw);
    assert.equal(validProfile(broken), false); assert.equal(corrupt.store.read().error, 'corrupt'); assert.equal(corrupt.raw(), raw);
  }
});
test('tampered unlocked bounds, material counts and expansion prices leave stored bytes intact', () => {
  const f = funded(); f.store.town.expand({ expectedStage: 1 }); const original = f.store.read().profile;
  for (const mutate of [p => p.town.landStage = 2, p => p.town.size = 10, p => p.collections.harbor_shell++, p => p.town.actions.at(-1).coins--, p => p.town.actions.at(-1).count--, p => p.town.actions.at(-1).districtId = 'garden', p => p.town.actions.at(-1).stage = 2]) {
    const broken = structuredClone(original); mutate(broken); const raw = JSON.stringify(broken), corrupt = fixture(raw);
    assert.equal(validProfile(broken), false); assert.equal(corrupt.store.read().error, 'corrupt'); assert.equal(corrupt.raw(), raw);
  }
});
console.log(`${checks} shared land, district ledger, landscape and migration checks passed.`);
