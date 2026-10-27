'use strict';
const assert = require('node:assert/strict');
const { STORAGE_KEY, BUILDING_CARDS, TOWN_DISTRICTS, createStore, validProfile, footprint, payoutFor } = require('../progression.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(raw) {
  const data = new Map(raw === undefined ? [] : [[STORAGE_KEY, raw]]); let blocked = false;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('QuotaExceededError'); data.set(key, value); } };
  const create = () => createStore(storage, () => '2026-10-25T08:00:00.000Z', () => '2026-10-25');
  return { data, create, store: create(), fail: value => { blocked = value; }, raw: () => data.get(STORAGE_KEY) };
}
const result = (id, buildingCards, overrides = {}) => ({ eligible: true, runId: id, mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', winnerId: 'human', rounds: 30, humanCash: 1500, collectionCount: 2, buildingCards, ...overrides });
function complete(f, id = 'first', cards = [{ cardId: 'harbor_villa', count: 1 }], overrides = {}) {
  assert.equal(f.store.enter({ runId: id, mapId: 'harbor', price: 250 }).ok, true);
  const settled = f.store.settle(result(id, cards, overrides)); assert.equal(settled.ok, true); return settled;
}
function v2From(profile) {
  const old = JSON.parse(JSON.stringify(profile)); old.version = 2; delete old.town;
  for (const receipt of old.receipts) { delete receipt.buildingCards; delete receipt.cardRewardVersion; }
  return old;
}

test('fresh town uses all five regional series and no passive currency or free cards', () => {
  const f = fixture(), p = f.store.read().profile;
  assert.equal(p.version, 5); assert.equal(p.wallet, 1200); assert.equal(p.town.size, 6);
  assert.equal(p.town.targetCardId, 'harbor_villa'); assert.equal(BUILDING_CARDS.length, 35);
  assert.deepEqual([...new Set(BUILDING_CARDS.map(card => card.region))], ['classic', 'compact', 'expansion', 'harbor', 'alpine']);
  assert.equal(new Set(BUILDING_CARDS.map(card => card.name)).size, 35);
  assert.equal(BUILDING_CARDS.every(card => card.modelKeys.length === 3 && card.previewPaths.length === 3), true);
  assert.equal(Object.values(p.town.cards).every(card => !card.unlocked && card.star === 0 && card.duplicates === 0), true);
  assert.equal(validProfile(p), true); assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0 }).error, 'card_locked');
});

test('v2 migration preserves exact vault, earned, tickets, projects and collections atomically', () => {
  const seed = fixture(); complete(seed, 'old-harbor');
  seed.store.enter({ runId: 'old-city', mapId: 'classic', price: 100 });
  seed.store.settle(result('old-city', [], { mapId: 'classic', mapName: '经典环线', humanCash: 2000, collectionCount: 3 }));
  seed.store.buy('garden', 1); seed.store.enter({ runId: 'unfinished', mapId: 'harbor', price: 250 });
  const old = v2From(seed.store.read().profile), raw = JSON.stringify(old), f = fixture(raw);
  f.fail(true); assert.equal(f.store.read().error, 'migration_failed'); assert.equal(f.raw(), raw);
  f.fail(false); const migrated = f.store.read(); assert.equal(migrated.migrated, true);
  for (const field of ['wallet', 'earned', 'seedAmount', 'entries', 'purchases', 'stipends', 'collections', 'projectLevels', 'legacyBalance', 'legacyEarned', 'legacyLevels']) assert.deepEqual(migrated.profile[field], old[field], field);
  assert.equal(migrated.profile.town.cards.harbor_villa.unlocked, false, 'old receipts do not mint retroactive cards');
  assert.equal(migrated.profile.receipts.every(receipt => receipt.cardRewardVersion === 0 && receipt.buildingCards.length === 0), true);
  const settled = f.store.settle(result('unfinished', [{ cardId: 'harbor_onsen', count: 1 }]));
  assert.equal(settled.ok, true); assert.equal(settled.profile.town.cards.harbor_onsen.unlocked, true);
  assert.equal(f.create().read().profile.version, 5);
});

test('v4 town saves gain the other regions locked while harbor progress, buildings and pending drafts stay', () => {
  const seed = fixture(); complete(seed, 'v4-built', [{ cardId: 'harbor_villa', count: 3 }]);
  assert.equal(seed.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0, actionId: 'v4-place' }).ok, true);
  assert.equal(seed.store.town.merge({ cardId: 'harbor_villa', expectedStar: 2, actionId: 'v4-merge' }).ok, true);
  seed.store.enter({ runId: 'v4-draft', mapId: 'harbor', price: 250 });
  assert.equal(seed.store.settle(result('v4-draft', [], { buildingCardDraft: true })).ok, true);
  const current = seed.store.read().profile, old = JSON.parse(JSON.stringify(current));
  old.version = 4; old.town.cards = Object.fromEntries(BUILDING_CARDS.filter(card => card.mapId === 'harbor').map(card => [card.id, current.town.cards[card.id]]));
  const f = fixture(JSON.stringify(old)), migrated = f.store.read();
  assert.equal(migrated.ok, true); assert.equal(migrated.migrated, true); assert.equal(migrated.profile.version, 5);
  assert.deepEqual(migrated.profile.town.cards, current.town.cards); assert.deepEqual(migrated.profile.town.buildings, current.town.buildings);
  assert.equal(migrated.profile.wallet, current.wallet); assert.equal(validProfile(migrated.profile), true);
  const offers = migrated.profile.receipts.find(receipt => receipt.runId === 'v4-draft').buildingCardDraft.offers;
  assert.equal(offers.every(id => id.startsWith('harbor_')), true); assert.equal(f.store.claimBuildingCard({ runId: 'v4-draft', cardId: offers[0] }).ok, true);
});

test('every map settles into a three-card draft from its own region', () => {
  const f = fixture();
  for (const [mapId, mapName] of [['classic', '经典环线'], ['compact', '紧凑冲突'], ['expansion', '都市大环线'], ['alpine', '云岭温泉']]) {
    assert.equal(f.store.enter({ runId: `draft-${mapId}`, mapId, price: 100 }).ok, true);
    const settled = f.store.settle(result(`draft-${mapId}`, [], { mapId, mapName, buildingCardDraft: true }));
    const offers = settled.receipt.buildingCardDraft.offers;
    assert.equal(settled.receipt.cardRewardVersion, 3); assert.equal(new Set(offers).size, 3); assert.equal(offers.every(id => id.startsWith(`${mapId}_`)), true);
    assert.equal(f.store.claimBuildingCard({ runId: `draft-${mapId}`, cardId: offers[0] }).ok, true);
    assert.equal(f.store.town.place({ cardId: offers[0], x: ['classic', 'compact', 'expansion', 'alpine'].indexOf(mapId), y: 0 }).ok, true);
  }
  assert.equal(validProfile(f.create().read().profile), true);
  assert.equal(f.store.settle(result('wrong-region', [{ cardId: 'harbor_villa', count: 1 }], { mapId: 'alpine', mapName: '云岭温泉', buildingCardDraft: true })).ok, false);
});

test('a migrated receipt remains idempotent and cannot be reissued with new cards', () => {
  const seed = fixture(); complete(seed, 'old'); const old = v2From(seed.store.read().profile), f = fixture(JSON.stringify(old));
  assert.equal(f.store.settle(result('old', undefined)).duplicate, true);
  assert.equal(f.store.settle(result('old', [{ cardId: 'harbor_villa', count: 1 }])).error, 'conflict');
  assert.equal(f.store.read().profile.wallet, old.wallet); assert.equal(f.store.read().profile.town.cards.harbor_villa.unlocked, false);
});

test('card settlement combines order-independent rewards once and rejects changed retry rewards', () => {
  const f = fixture(), cards = [{ cardId: 'harbor_onsen', count: 1 }, { cardId: 'harbor_villa', count: 1 }, { cardId: 'harbor_villa', count: 2 }];
  const first = complete(f, 'one', cards);
  assert.deepEqual(first.receipt.buildingCards, [{ cardId: 'harbor_onsen', count: 1 }, { cardId: 'harbor_villa', count: 3 }]);
  assert.deepEqual(first.profile.town.cards.harbor_villa, { unlocked: true, star: 1, duplicates: 2 });
  const raw = f.raw();
  assert.equal(f.create().settle(result('one', [...cards].reverse())).duplicate, true); assert.equal(f.raw(), raw);
  assert.equal(f.store.settle(result('one', [{ cardId: 'harbor_villa', count: 4 }])).error, 'conflict'); assert.equal(f.raw(), raw);
});

test('failed settlement banks neither money nor cards, and a retry grants both exactly once', () => {
  const f = fixture(); f.store.enter({ runId: 'retry', mapId: 'harbor', price: 250 }); const before = f.raw();
  const input = result('retry', [{ cardId: 'harbor_finance', count: 2 }]);
  f.fail(true); assert.equal(f.store.settle(input).error, 'save_failed'); assert.equal(f.raw(), before);
  assert.equal(f.store.read().profile.town.cards.harbor_finance.unlocked, false);
  f.fail(false); assert.equal(f.store.settle(input).ok, true); assert.equal(f.create().settle(input).duplicate, true);
  const p = f.store.read().profile; assert.equal(p.wallet, 2450); assert.equal(p.town.cards.harbor_finance.duplicates, 1);
});

test('reward schema rejects unknown families, nonintegers, zero rewards and more than five cards', () => {
  const f = fixture(); f.store.enter({ runId: 'invalid', mapId: 'harbor', price: 250 }); const before = f.raw();
  for (const cards of [[], [{ cardId: 'alpine_villa', count: 1 }], [{ cardId: 'harbor_villa', count: 6 }], [{ cardId: 'harbor_villa', count: -1 }], [{ cardId: 'harbor_villa', count: 1.5 }], [{ cardId: 'harbor_villa', count: '1' }], null, {}]) {
    assert.equal(f.store.settle(result('invalid', cards)).error, 'invalid', JSON.stringify(cards)); assert.equal(f.raw(), before);
  }
  f.store.enter({ runId: 'nonharbor', mapId: 'classic', price: 100 });
  assert.equal(f.store.settle(result('nonharbor', [{ cardId: 'harbor_villa', count: 1 }], { mapId: 'classic' })).error, 'invalid');
});

test('one completion unlocks permanent construction and construction charges only coins', () => {
  const f = fixture(); complete(f); const before = f.store.read().profile;
  const a = f.store.town.place({ cardId: 'harbor_villa', x: 1, y: 2, rotation: 0, actionId: 'villa-a' });
  const b = f.store.town.place({ cardId: 'harbor_villa', x: 2, y: 2, rotation: 1, actionId: 'villa-b' });
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.notEqual(a.building.id, b.building.id);
  assert.equal(b.profile.wallet, before.wallet - 240); assert.deepEqual(b.profile.town.cards.harbor_villa, before.town.cards.harbor_villa);
  const raw = f.raw(); assert.equal(f.create().town.place({ cardId: 'harbor_villa', x: 1, y: 2, rotation: 0, actionId: 'villa-a' }).duplicate, true);
  assert.equal(f.raw(), raw); assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 4, y: 2, actionId: 'villa-a' }).error, 'conflict');
});

test('two-cell buildings rotate, collide on either cell, and cannot extend outside owned land', () => {
  const f = fixture(); complete(f, 'large', [{ cardId: 'harbor_finance', count: 1 }, { cardId: 'harbor_villa', count: 1 }]);
  assert.deepEqual(footprint('harbor_finance', 0), [2, 1]); assert.deepEqual(footprint('harbor_finance', 1), [1, 2]);
  assert.deepEqual(footprint('harbor_finance', 2), [2, 1]); assert.deepEqual(footprint('harbor_finance', 3), [1, 2]);
  assert.equal(f.store.town.place({ cardId: 'harbor_finance', x: 5, y: 5 }).error, 'out_of_bounds');
  const a = f.store.town.place({ cardId: 'harbor_finance', x: 4, y: 3, rotation: 1, actionId: 'large' }); assert.equal(a.ok, true);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 4, y: 4 }).error, 'occupied');
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 4, y: 3 }).error, 'occupied');
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: -1, y: 3 }).error, 'invalid');
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 1, y: 1, rotation: 90 }).error, 'invalid');
  const moved = f.store.town.move({ buildingId: a.building.id, x: 3, y: 3, rotation: 0 }); assert.equal(moved.ok, true);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 4, y: 4 }).ok, true, 'moving frees all former cells');
  assert.equal(f.store.town.move({ buildingId: a.building.id, x: 3, y: 3, rotation: 2 }).ok, true);
  assert.equal(f.store.town.move({ buildingId: a.building.id, x: 4, y: 3, rotation: 3 }).error, 'occupied');
  assert.equal(f.store.town.move({ buildingId: a.building.id, x: 3, y: 3, rotation: 3 }).ok, true);
  assert.equal(f.create().read().profile.town.buildings[0].rotation, 3);
});

test('store and restore preserve instance and card ownership without another building charge', () => {
  const f = fixture(); complete(f); const made = f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0 });
  const wallet = made.profile.wallet, id = made.building.id;
  assert.equal(f.store.town.store({ buildingId: id, actionId: 'store-villa' }).ok, true);
  assert.equal(f.create().town.store({ buildingId: id, actionId: 'store-villa' }).duplicate, true);
  assert.equal(f.store.town.move({ buildingId: id, x: 1, y: 1 }).error, 'building_missing');
  assert.equal(f.store.town.restore({ buildingId: id, x: 4, y: 4, rotation: 1 }).ok, true);
  const p = f.create().read().profile; assert.equal(p.wallet, wallet); assert.equal(p.town.buildings.length, 1);
  assert.deepEqual(p.town.buildings[0], { id, cardId: 'harbor_villa', x: 4, y: 4, rotation: 1, stored: false });
  assert.equal(p.town.cards.harbor_villa.unlocked, true); assert.equal(p.town.cards.harbor_villa.duplicates, 0);
});

test('merge consumes two then four duplicates and upgrades the family for every placed and stored copy', () => {
  const f = fixture(); complete(f, 'first', [{ cardId: 'harbor_villa', count: 3 }]);
  const one = f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0 }), two = f.store.town.place({ cardId: 'harbor_villa', x: 1, y: 0 });
  f.store.town.store({ buildingId: two.building.id }); const wallet = f.store.read().profile.wallet;
  const merge = f.store.town.merge({ cardId: 'harbor_villa', expectedStar: 2, actionId: 'merge-two' });
  assert.equal(merge.ok, true); assert.equal(merge.profile.wallet, wallet); assert.deepEqual(merge.profile.town.cards.harbor_villa, { unlocked: true, star: 2, duplicates: 0 });
  assert.equal(f.create().town.merge({ cardId: 'harbor_villa', expectedStar: 2, actionId: 'merge-two' }).duplicate, true);
  assert.equal(f.store.town.merge({ cardId: 'harbor_villa', expectedStar: 3 }).error, 'missing_cards');
  complete(f, 'second', [{ cardId: 'harbor_villa', count: 4 }]); const final = f.store.town.merge({ cardId: 'harbor_villa', expectedStar: 3, actionId: 'merge-three' });
  assert.equal(final.ok, true); assert.equal(final.profile.town.cards.harbor_villa.star, 3); assert.equal(final.profile.town.cards.harbor_villa.duplicates, 0);
  assert.equal(final.profile.town.buildings[0].id, one.building.id); assert.equal(final.profile.town.buildings[1].stored, true);
  assert.equal(f.store.town.merge({ cardId: 'harbor_villa' }).error, 'max_star'); assert.equal(validProfile(final.profile), true);
});

test('the first district is paid once, opens only the eastern cells, and retains existing layout', () => {
  const f = fixture(); complete(f); const first = f.store.town.place({ cardId: 'harbor_villa', x: 5, y: 5 });
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 6, y: 6 }).error, 'out_of_bounds');
  const expanded = f.store.town.expand({ expectedStage: 1, actionId: 'expand' }); assert.equal(expanded.ok, true);
  assert.equal(expanded.profile.wallet, first.profile.wallet - TOWN_DISTRICTS[0].coins); assert.equal(expanded.profile.town.size, 8);
  assert.deepEqual(expanded.profile.town.buildings[0], first.building);
  assert.equal(f.create().town.expand({ expectedStage: 1, actionId: 'expand' }).duplicate, true);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 7, y: 5 }).ok, true);
  assert.equal(f.store.town.place({ cardId: 'harbor_villa', x: 7, y: 7 }).error, 'out_of_bounds');
  assert.equal(f.store.town.expand({ expectedStage: 1 }).duplicate, true);
});

test('saving failures roll back build, merge and expansion together with their costs', () => {
  const f = fixture(); complete(f, 'rollback', [{ cardId: 'harbor_villa', count: 3 }]);
  const operations = [() => f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0, actionId: 'rollback-build' }), () => f.store.town.merge({ cardId: 'harbor_villa', expectedStar: 2, actionId: 'rollback-merge' }), () => f.store.town.expand({ expectedStage: 1, actionId: 'rollback-expand' })];
  for (const operation of operations) {
    const before = f.raw(); f.fail(true); assert.equal(operation().error, 'save_failed'); assert.equal(f.raw(), before);
    f.fail(false); assert.equal(operation().ok, true); assert.equal(operation().duplicate, true);
  }
  assert.equal(f.store.town.setTarget, undefined);
});

test('insufficient construction money never takes cards and blocked storage is not reset', () => {
  const f = fixture(); complete(f, 'low', [{ cardId: 'harbor_skyscraper', count: 1 }], { humanCash: 0 });
  f.store.town.expand({ expectedStage: 1 });
  f.store.enter({ runId: 'spend-low-a', mapId: 'classic', price: 100 });
  f.store.enter({ runId: 'spend-low-b', mapId: 'classic', price: 100 });
  const before = f.raw();
  assert.equal(f.store.town.place({ cardId: 'harbor_skyscraper', x: 0, y: 0 }).error, 'insufficient'); assert.equal(f.raw(), before);
  const inaccessible = createStore({ getItem() { throw Error('SecurityError'); }, setItem() { throw Error('unexpected'); } });
  assert.equal(inaccessible.town.place({ cardId: 'harbor_villa', x: 0, y: 0 }).error, 'unavailable');
});

test('tampered snapshots and ledgers are rejected without overwriting the original bytes', () => {
  const f = fixture(); complete(f, 'secure', [{ cardId: 'harbor_villa', count: 3 }]);
  f.store.town.place({ cardId: 'harbor_villa', x: 0, y: 0, actionId: 'owned' }); f.store.town.merge({ cardId: 'harbor_villa', expectedStar: 2 });
  const original = f.store.read().profile;
  const mutations = [p => p.wallet++, p => p.town.cards.harbor_villa.duplicates++, p => p.town.cards.harbor_villa.star++, p => p.town.size = 8, p => p.town.targetCardId = 'harbor_onsen', p => p.town.buildings[0].x++, p => p.town.actions[0].coins = 0, p => p.town.actions.push(p.town.actions[0]), p => p.receipts[0].buildingCards[0].count = 4, p => p.town.buildings.push({ ...p.town.buildings[0], id: 'unpaid' })];
  for (const mutation of mutations) {
    const broken = JSON.parse(JSON.stringify(original)); mutation(broken); const raw = JSON.stringify(broken), corrupt = fixture(raw);
    assert.equal(validProfile(broken), false); assert.equal(corrupt.store.read().error, 'corrupt');
    assert.equal(corrupt.store.town.expand({ expectedStage: 1 }).error, 'corrupt'); assert.equal(corrupt.raw(), raw);
  }
});

test('payout receipts bank result coins scaled by ticket while final cash still ranks the run', () => {
  const outcome = (winnerId, cash, opponentCash) => ({ winnerId, cash, opponentCash });
  assert.deepEqual(payoutFor(outcome('human', 3200, 1300), 100), { base: 300, lead: 190, coins: 490 });
  assert.deepEqual(payoutFor(outcome('human', 9000, 0), 100), { base: 300, lead: 300, coins: 600 });
  assert.deepEqual(payoutFor(outcome('ai', 800, 3000), 100), { base: 50, lead: 0, coins: 50 });
  assert.deepEqual(payoutFor(outcome('draw', 2000, 2000), 100), { base: 150, lead: 0, coins: 150 });
  assert.deepEqual(payoutFor(outcome('human', 9000, 0), 350), { base: 1050, lead: 900, coins: 1950 });
  assert.deepEqual(payoutFor(outcome('ai', 800, 3000), 250), { base: 125, lead: 0, coins: 125 });

  const f = fixture(), paid = (runId, mapId, price, winnerId, humanCash, opponentCash) => {
    assert.equal(f.store.enter({ runId, mapId, price }).ok, true);
    return f.store.settle(result(runId, [], { mapId, mapName: mapId, winnerId, humanCash, opponentCash, payoutVersion: 1, buildingCardDraft: true }));
  };
  const won = paid('payout-win', 'compact', 100, 'human', 3200, 1300);
  assert.equal(won.ok, true); assert.equal(won.amount, 490); assert.equal(won.receipt.coins, 490); assert.equal(won.receipt.cash, 3200);
  assert.equal(won.profile.wallet, 1200 - 100 + 490); assert.equal(won.profile.earned, 490);
  const lost = paid('payout-loss', 'alpine', 350, 'ai', 4800, 5200);
  assert.equal(lost.amount, 175); assert.equal(lost.profile.wallet, 1590 - 350 + 175);
  const again = f.store.settle(result('payout-win', [], { mapId: 'compact', mapName: 'compact', humanCash: 3200, opponentCash: 1300, payoutVersion: 1, buildingCardDraft: true }));
  assert.equal(again.duplicate, true); assert.equal(again.amount, 490); assert.equal(f.store.read().profile.wallet, 1415);
  assert.equal(f.store.settle(result('payout-win', [], { mapId: 'compact', mapName: 'compact', humanCash: 3200, opponentCash: 100, payoutVersion: 1, buildingCardDraft: true })).error, 'conflict');
  assert.deepEqual(f.store.leaderboard('alpine', 'rounds').rows.map(row => row.cash), [4800]);
  f.store.enter({ runId: 'payout-bad', mapId: 'classic', price: 100 });
  assert.equal(f.store.settle(result('payout-bad', [], { mapId: 'classic', mapName: 'classic', payoutVersion: 1, buildingCardDraft: true })).error, 'invalid', 'opponent cash is required');
  const saved = f.store.read().profile; assert.equal(validProfile(saved), true);
  for (const mutate of [p => { p.receipts[0].coins++; p.wallet++; p.earned++; }, p => { p.receipts[0].opponentCash = 0; }, p => { p.receipts[1].payoutVersion = 2; }]) {
    const broken = JSON.parse(JSON.stringify(saved)); mutate(broken); assert.equal(validProfile(broken), false);
  }
});

console.log(`${checks} town collection, migration, settlement, building, merge and persistence checks passed.`);
