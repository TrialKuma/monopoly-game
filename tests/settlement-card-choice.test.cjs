'use strict';
const assert = require('node:assert/strict');
const { STORAGE_KEY, BUILDING_CARDS, createStore, validProfile, buildingCardOffers } = require('../progression.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(raw) {
  const data = new Map(raw === undefined ? [] : [[STORAGE_KEY, raw]]); let blocked = false;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('QuotaExceededError'); data.set(key, value); } };
  const create = () => createStore(storage, () => '2026-10-25T08:00:00.000Z', () => '2026-10-25');
  return { data, create, store: create(), fail: value => { blocked = value; }, raw: () => data.get(STORAGE_KEY) };
}
const input = (runId, overrides = {}) => ({ eligible: true, runId, mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', winnerId: 'human', rounds: 30, humanCash: 1500, collectionCount: 2, buildingCardDraft: true, buildingCards: [], ...overrides });
function enter(f, runId) { assert.equal(f.store.enter({ runId, mapId: 'harbor', price: 250 }).ok, true); }
function complete(f, runId, overrides) { enter(f, runId); const result = f.store.settle(input(runId, overrides)); assert.equal(result.ok, true); return result; }
const total = profile => Object.values(profile.town.cards).reduce((sum, card) => sum + (card.unlocked ? 1 : 0) + card.duplicates, 0);
const firstOffer = result => result.receipt.buildingCardDraft.offers[0];

test('settlement needs no target and freezes three distinct random offers without auto-claiming', () => {
  const f = fixture(), result = complete(f, 'offers');
  assert.equal(result.receipt.cardRewardVersion, 3); assert.deepEqual(result.receipt.buildingCards, []);
  const draft = result.receipt.buildingCardDraft;
  assert.deepEqual(Object.keys(draft), ['offers']); assert.equal(draft.offers.length, 3); assert.equal(new Set(draft.offers).size, 3);
  assert.equal(draft.offers.every(id => BUILDING_CARDS.some(card => card.id === id)), true);
  assert.equal(total(result.profile), 0); assert.equal(result.profile.wallet, 2450); assert.equal(result.profile.collections.harbor_shell, 2);
  assert.equal(f.store.getPendingBuildingCards().rows.length, 1); assert.equal(validProfile(result.profile), true);
  const omitted = fixture(); assert.equal(complete(omitted, 'omitted-bonus', { buildingCards: undefined }).receipt.buildingCards.length, 0);
});
test('old targets and explicit target input do not affect new candidates', () => {
  const runs = [];
  for (const targetCardId of ['harbor_villa', 'harbor_onsen', 'harbor_finance']) {
    const seeded = fixture(); const old = seeded.store.read().profile; old.version = 3; delete old.town.landStage;
    old.town.targetCardId = targetCardId; old.town.actions.push({ id: 'old-target', type: 'target', cardId: targetCardId, coins: 0, createdAt: '2026-10-25T07:00:00.000Z' });
    const f = fixture(JSON.stringify(old));
    const result = complete(f, 'same-run', { buildingCardTarget: targetCardId }); runs.push(result.receipt.buildingCardDraft);
    assert.equal(f.store.town.setTarget, undefined); assert.equal(result.receipt.buildingCardDraft.targetCardId, undefined);
    assert.equal(f.store.settle(input('same-run', { buildingCardTarget: 'not-a-card' })).duplicate, true);
  }
  assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[1], runs[2]);
});
test('seeded shuffle samples all seven cards without replacement or game RNG consumption', () => {
  const counts = Object.fromEntries(BUILDING_CARDS.map(card => [card.id, 0])), positionCounts = [0, 1, 2].map(() => ({ ...counts }));
  const original = Math.random; Math.random = () => { throw Error('must not consume dice RNG'); };
  try {
    for (let i = 0; i < 4096; i++) {
      const offers = buildingCardOffers(`distribution-${i}`); assert.equal(new Set(offers).size, 3);
      offers.forEach((id, slot) => { counts[id]++; positionCounts[slot][id]++; });
      assert.deepEqual(buildingCardOffers(`distribution-${i}`), offers);
    }
  } finally { Math.random = original; }
  // A fixed broad distribution regression catches a guaranteed card or rank-sort bias.
  for (const count of Object.values(counts)) assert(count > 1500 && count < 2000, `inclusion count ${count}`);
  for (const slot of positionCounts) for (const count of Object.values(slot)) assert(count > 470 && count < 710, `slot count ${count}`);
});
test('zero to four construction bonuses stay intact and are independent of the random choice', () => {
  const f = fixture(), bonuses = [{ cardId: 'harbor_finance', count: 2 }, { cardId: 'harbor_onsen', count: 2 }];
  const r = complete(f, 'bonuses', { buildingCards: bonuses, buildingCardTarget: 'harbor_finance' });
  assert.deepEqual(r.receipt.buildingCards, bonuses); assert.equal(total(r.profile), 4);
  const claimed = f.store.claimBuildingCard({ runId: 'bonuses', cardId: firstOffer(r) });
  assert.equal(claimed.ok, true); assert.equal(total(claimed.profile), 5);
  assert.equal(claimed.profile.wallet, r.profile.wallet); assert.deepEqual(claimed.profile.collections, r.profile.collections);
});
test('refresh and settlement retry keep the original offers and cannot mint rewards again', () => {
  const f = fixture(), r = complete(f, 'refresh'), before = f.raw();
  assert.deepEqual(f.create().getPendingBuildingCards().rows[0].buildingCardDraft, r.receipt.buildingCardDraft);
  assert.equal(f.create().settle(input('refresh')).duplicate, true); assert.equal(f.raw(), before);
  const same = fixture(); assert.deepEqual(complete(same, 'refresh').receipt.buildingCardDraft, r.receipt.buildingCardDraft);
  assert.equal(f.store.settle(input('refresh', { buildingCards: [{ cardId: 'harbor_villa', count: 1 }] })).error, 'conflict'); assert.equal(f.raw(), before);
});
test('failed settlement writes no money or rewards and retry remains fixed', () => {
  const f = fixture(); enter(f, 'failure'); const before = f.raw(); f.fail(true);
  assert.equal(f.store.settle(input('failure')).error, 'save_failed'); assert.equal(f.raw(), before); assert.equal(f.create().getPendingBuildingCards().rows.length, 0);
  f.fail(false); const result = f.store.settle(input('failure')); assert.equal(result.ok, true); assert.deepEqual(result.receipt.buildingCardDraft.offers, buildingCardOffers('failure'));
  assert.equal(f.create().settle(input('failure')).duplicate, true);
});
test('failed claim stays pending and selected reward can only be credited once', () => {
  const f = fixture(), r = complete(f, 'claim-failure'); const before = f.raw(), request = { runId: 'claim-failure', cardId: firstOffer(r) }; f.fail(true);
  assert.equal(f.store.claimBuildingCard(request).error, 'save_failed'); assert.equal(f.raw(), before); assert.equal(f.create().getPendingBuildingCards().rows.length, 1);
  f.fail(false); const claimed = f.create().claimBuildingCard(request); assert.equal(claimed.ok, true); assert.equal(total(claimed.profile), 1);
  const after = f.raw(); assert.equal(f.create().claimBuildingCard(request).duplicate, true); assert.equal(f.raw(), after); assert.equal(f.store.getPendingBuildingCards().rows.length, 0);
  assert.equal(f.create().settle(input('claim-failure')).duplicate, true); assert.equal(f.raw(), after);
});
test('invalid or changed claims do not consume or replace the saved choice', () => {
  const f = fixture(), r = complete(f, 'validate'); const before = f.raw(), offers = r.receipt.buildingCardDraft.offers;
  const absent = BUILDING_CARDS.find(card => !offers.includes(card.id)).id;
  assert.equal(f.store.claimBuildingCard({ runId: 'validate', cardId: absent }).error, 'invalid_choice');
  assert.equal(f.store.claimBuildingCard({ runId: 'missing', cardId: offers[0] }).error, 'invalid_choice');
  assert.equal(f.store.claimBuildingCard({ runId: 'validate' }).error, 'invalid'); assert.equal(f.raw(), before);
  assert.equal(f.store.claimBuildingCard({ runId: 'validate', cardId: offers[0] }).ok, true); const claimed = f.raw();
  assert.equal(f.store.claimBuildingCard({ runId: 'validate', cardId: offers[1] }).error, 'already_claimed'); assert.equal(f.raw(), claimed);
});
test('old pending v2 offers and historical target actions survive migration and remain claimable', () => {
  const seed = fixture(); complete(seed, 'legacy-target-pending'); const old = seed.store.read().profile;
  old.version = 3; delete old.town.landStage; old.town.targetCardId = 'harbor_onsen';
  old.town.actions.push({ id: 'past-target', type: 'target', coins: 0, cardId: 'harbor_onsen', createdAt: '2026-10-24T12:00:00.000Z' });
  old.receipts[0].cardRewardVersion = 2; old.receipts[0].buildingCardDraft = { targetCardId: 'harbor_finance', offers: ['harbor_hotel', 'harbor_finance', 'harbor_skyscraper'] };
  const f = fixture(JSON.stringify(old)), migrated = f.store.read(); assert.equal(migrated.migrated, true); assert.equal(migrated.profile.wallet, old.wallet);
  assert.deepEqual(f.store.getPendingBuildingCards().rows[0].buildingCardDraft, old.receipts[0].buildingCardDraft);
  assert.equal(f.store.settle(input('legacy-target-pending', { buildingCardTarget: 'harbor_finance', buildingCards: [{ cardId: 'harbor_finance', count: 1 }] })).duplicate, true);
  assert.equal(f.store.claimBuildingCard({ runId: 'legacy-target-pending', cardId: 'harbor_finance' }).ok, true);
  assert.equal(f.create().claimBuildingCard({ runId: 'legacy-target-pending', cardId: 'harbor_finance' }).duplicate, true);
  assert.equal(f.create().read().profile.town.cards.harbor_finance.unlocked, true); assert.equal(f.store.getPendingBuildingCards().rows.length, 0);
});
test('old non-draft receipts remain credited without retroactive choices', () => {
  const f = fixture(); complete(f, 'legacy-v3', { buildingCardDraft: false, buildingCards: [{ cardId: 'harbor_finance', count: 1 }] }); const before = f.raw();
  assert.equal(f.create().read().profile.receipts[0].cardRewardVersion, 1); assert.equal(f.create().getPendingBuildingCards().rows.length, 0); assert.equal(f.raw(), before);
  assert.equal(f.store.claimBuildingCard({ runId: 'legacy-v3', cardId: 'harbor_finance' }).error, 'invalid_choice'); assert.equal(f.store.settle(input('legacy-v3')).error, 'conflict');
});
test('version-two saves migrate without inventing building cards and new drafts remain random', () => {
  const f = fixture(); complete(f, 'old', { buildingCardDraft: false, buildingCards: [{ cardId: 'harbor_finance', count: 1 }] });
  const old = f.store.read().profile; old.version = 2; delete old.town;
  for (const receipt of old.receipts) { delete receipt.buildingCards; delete receipt.cardRewardVersion; }
  const migrated = fixture(JSON.stringify(old)); assert.equal(migrated.store.read().migrated, true); assert.equal(migrated.store.read().profile.wallet, old.wallet);
  assert.equal(migrated.store.getPendingBuildingCards().rows.length, 0); assert.equal(total(migrated.store.read().profile), 0);
  assert.equal(complete(migrated, 'new').receipt.cardRewardVersion, 3);
});
test('multiple pending matches can be claimed in either order and support normal construction', () => {
  const f = fixture(), one = complete(f, 'one'), two = complete(f, 'two');
  assert.equal(f.store.getPendingBuildingCards().rows.length, 2);
  assert.equal(f.store.claimBuildingCard({ runId: 'two', cardId: firstOffer(two) }).ok, true);
  assert.equal(f.store.town.place({ cardId: firstOffer(two), x: 1, y: 1 }).ok, true); assert.equal(f.store.getPendingBuildingCards().rows[0].runId, 'one');
  assert.equal(f.create().claimBuildingCard({ runId: 'one', cardId: firstOffer(one) }).ok, true); assert.equal(f.store.getPendingBuildingCards().rows.length, 0);
});
test('randomly claimed duplicates still feed the existing merge ledger without changing coins', () => {
  const cardId = buildingCardOffers('merge')[0], f = fixture(); complete(f, 'merge', { buildingCards: [{ cardId, count: 2 }] });
  const claimed = f.store.claimBuildingCard({ runId: 'merge', cardId }); assert.equal(claimed.profile.town.cards[cardId].duplicates, 2);
  const merged = f.store.town.merge({ cardId, expectedStar: 2 }); assert.equal(merged.ok, true); assert.equal(merged.profile.town.cards[cardId].star, 2);
  assert.equal(merged.profile.wallet, claimed.profile.wallet); assert.equal(f.create().read().ok, true);
});
test('invalid bonuses never change the ledger', () => {
  const f = fixture(); enter(f, 'invalid'); const before = f.raw();
  for (const buildingCards of [[{ cardId: 'unknown', count: 1 }], [{ cardId: 'harbor_finance', count: 5 }], [{ cardId: 'harbor_finance', count: 0 }], [{ cardId: 'harbor_finance', count: 1.5 }]]) {
    assert.equal(f.store.settle(input('invalid', { buildingCards })).error, 'invalid'); assert.equal(f.raw(), before);
  }
});
test('tampered offers, reintroduced targets and claim ledgers cannot replace the stored save', () => {
  const f = fixture(), result = complete(f, 'tamper'), cardId = firstOffer(result); f.store.claimBuildingCard({ runId: 'tamper', cardId }); const good = f.store.read().profile;
  const mutations = [p => p.receipts[0].buildingCardDraft.offers.reverse(), p => p.receipts[0].buildingCardDraft.targetCardId = 'harbor_villa', p => p.receipts[0].buildingCards.push({ cardId, count: 5 }), p => p.town.actions.push({ ...p.town.actions[0], id: 'other' }), p => p.town.actions[0].runId = 'missing', p => p.town.actions[0].coins = 1, p => p.town.cards[cardId].duplicates++];
  for (const mutate of mutations) {
    const broken = structuredClone(good); mutate(broken); const raw = JSON.stringify(broken), restored = fixture(raw);
    assert.equal(validProfile(broken), false); assert.equal(restored.store.read().error, 'corrupt'); assert.equal(restored.raw(), raw);
  }
});
console.log(`${checks} random settlement draft, compatibility and atomicity checks passed.`);
