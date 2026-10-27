'use strict';
const assert = require('node:assert/strict');
const { STORAGE_KEY, PROJECTS, createStore, validProfile } = require('../progression.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(raw) {
  const data = new Map(raw ? [[STORAGE_KEY, raw]] : []); let blocked = false, day = '2026-10-23';
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('QuotaExceededError'); data.set(key, value); } };
  const create = () => createStore(storage, () => '2026-10-23T08:00:00.000Z', () => day);
  return { data, create, store: create(), fail: value => { blocked = value; }, day: value => { day = value; } };
}
const admission = (overrides = {}) => ({ runId: 'run-1', mapId: 'classic', price: 100, collectionId: 'city_stamp', ...overrides });
const input = (overrides = {}) => ({ eligible: true, runId: 'run-1', mapId: 'classic', mapName: '经典环线', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 4000, winnerId: 'human', collectionCount: 2, ...overrides });
function complete(f, id, map, cash = 1000, collectionCount = 3) {
  const price = map === 'harbor' ? 250 : map === 'alpine' ? 350 : 100;
  const collectionId = map === 'harbor' ? 'harbor_shell' : map === 'alpine' ? 'alpine_crystal' : 'city_stamp';
  assert.equal(f.store.enter(admission({ runId: id, mapId: map, price, collectionId })).ok, true);
  const result = f.store.settle(input({ runId: id, mapId: map, humanCash: cash, collectionCount }));
  assert.equal(result.ok, true); return result;
}
test('new vault starts at 1200 once; generic old history does not mint income', () => {
  const f = fixture(); f.data.set('monopoly_history', JSON.stringify([{ players: [{ cash: 999999 }] }]));
  assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.store.read().profile.earned, 0);
  assert.equal(f.store.enter(admission()).ok, true); assert.equal(f.store.read().profile.wallet, 1100);
  assert.equal(f.create().read().profile.wallet, 1100); assert.equal(f.create().read().profile.seedGranted, true);
});
test('ticket is paid exactly once across duplicates and reload, with no abort refund', () => {
  const f = fixture(); f.store.enter(admission());
  assert.equal(f.store.enter(admission()).duplicate, true); assert.equal(f.create().enter(admission()).duplicate, true);
  assert.equal(f.store.enter(admission({ price: 200 })).error, 'conflict'); assert.equal(f.create().read().profile.wallet, 1100);
  f.store.enter(admission({ runId: 'restart' })); assert.equal(f.create().read().profile.wallet, 1000); assert.equal(f.store.read().profile.receipts.length, 0);
});
test('unpaid, mismatched, preview and unconfirmed games cannot settle', () => {
  const f = fixture(); assert.equal(f.store.settle(input()).error, 'unpaid');
  assert.equal(f.store.settle(input({ eligible: false })).skipped, true); assert.equal(f.store.settle(input({ eligible: undefined })).skipped, true);
  f.store.enter(admission()); assert.equal(f.store.settle(input({ mapId: 'harbor' })).error, 'unpaid'); assert.equal(f.store.read().profile.wallet, 1100);
});
test('ticket failure does not admit; insufficient funds never overdraw the vault', () => {
  const f = fixture(); f.fail(true); assert.equal(f.store.enter(admission()).error, 'save_failed');
  assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.store.read().profile.entries.length, 0); f.fail(false);
  const info = f.store.getEntryInfo({ mapId: 'alpine', price: 350 }); assert.equal(info.canEnter, true); assert.equal(info.collectionId, 'alpine_crystal');
  assert.equal(f.store.enter(admission({ price: 1300 })).error, 'entry_funds'); assert.equal(f.store.read().profile.wallet, 1200);
});
test('final human cash and map collectible bank once, including losses and zero-cash endings', () => {
  const f = fixture(); f.store.enter(admission()); const result = f.store.settle(input({ winnerId: 'ai', collectionCount: 1 }));
  assert.equal(result.profile.wallet, 5100); assert.equal(result.profile.earned, 4000); assert.equal(result.profile.collections.city_stamp, 1);
  assert.equal(f.create().settle(input({ winnerId: 'ai', collectionCount: 1 })).duplicate, true); assert.equal(f.create().read().profile.wallet, 5100);
  assert.equal(f.store.settle(input({ winnerId: 'ai', collectionCount: 2 })).error, 'conflict'); f.store.enter(admission({ runId: 'zero' }));
  const zero = f.store.settle(input({ runId: 'zero', humanCash: 0, mode: 'bankruptcy', reason: 'bankruptcy', rounds: 7, winnerId: 'ai', collectionCount: 1 }));
  assert.equal(zero.amount, 0); assert.equal(zero.profile.wallet, 5000); assert.equal(zero.profile.collections.city_stamp, 2);
});
test('failed settlement creates no phantom money or items and retries exactly once', () => {
  const f = fixture(); f.store.enter(admission()); f.fail(true); assert.equal(f.store.settle(input()).error, 'save_failed');
  assert.equal(f.store.read().profile.wallet, 1100); assert.equal(f.store.read().profile.collections.city_stamp, 0);
  f.fail(false); assert.equal(f.store.settle(input()).ok, true); assert.equal(f.create().settle(input()).duplicate, true);
  assert.equal(f.store.read().profile.wallet, 5100); assert.equal(f.store.read().profile.collections.city_stamp, 2);
});
test('three project levels consume both coins and the map-specific collectible', () => {
  const f = fixture(); assert.equal(f.store.buy('garden', 1).error, 'missing_collection');
  complete(f, 'garden-a', 'classic', 4000, 3); complete(f, 'garden-b', 'classic', 4000, 3); const before = f.store.read().profile.wallet;
  for (const level of [1, 2, 3]) { assert.equal(f.store.buy('garden', level).ok, true); assert.equal(f.store.buy('garden', level).duplicate, true); }
  assert.equal(f.store.read().profile.projectLevels.garden, 3); assert.equal(f.store.read().profile.collections.city_stamp, 0);
  assert.equal(f.store.read().profile.wallet, before - PROJECTS[0].coins.reduce((sum, n) => sum + n, 0));
  assert.equal(f.store.buy('waterfront', 1).error, 'missing_collection'); complete(f, 'harbor-a', 'harbor'); assert.equal(f.store.buy('waterfront', 1).ok, true);
  complete(f, 'alpine-a', 'alpine'); assert.equal(f.store.buy('skyline', 1).ok, true);
  assert.equal(f.store.read().profile.collections.harbor_shell, 2); assert.equal(f.store.read().profile.collections.alpine_crystal, 2); assert.equal(validProfile(f.store.read().profile), true);
});
test('failed upgrade preserves coins, items and current level', () => {
  const f = fixture(); complete(f, 'garden-a', 'classic'); const before = f.store.read().profile;
  f.fail(true); assert.equal(f.store.buy('garden', 1).error, 'save_failed'); assert.deepEqual(f.store.read().profile, before);
});
test('emergency stipend is explicit, limited to low vaults and one claim per local date', () => {
  const f = fixture(); assert.equal(f.store.getStipendInfo().eligible, false); assert.equal(f.store.claimStipend().error, 'stipend_not_needed');
  for (let i = 0; i < 12; i++) assert.equal(f.store.enter(admission({ runId: 'empty-' + i })).ok, true);
  assert.equal(f.store.read().profile.wallet, 0); assert.equal(f.store.getStipendInfo().eligible, true);
  f.fail(true); assert.equal(f.store.claimStipend().error, 'save_failed'); assert.equal(f.store.getStipendInfo().eligible, true);
  f.fail(false); assert.equal(f.store.claimStipend().ok, true); assert.equal(f.store.read().profile.wallet, 300); assert.equal(f.create().claimStipend().error, 'stipend_claimed');
  for (let i = 0; i < 3; i++) f.store.enter(admission({ runId: 'after-stipend-' + i }));
  f.day('2026-10-24'); assert.equal(f.store.claimStipend().ok, true); f.day('2026-10-23'); assert.equal(f.store.claimStipend().error, 'stipend_claimed');
});
test('v1 migration preserves exact old balance, purchases and receipts without reseeding', () => {
  const receipt = { runId: 'legacy', mapId: 'classic', mapName: '经典环线', mode: 'rounds', reason: 'rounds', rounds: 30, cash: 4000, winnerId: 'human', completedAt: '2026-10-22T08:00:00.000Z' };
  const old = { version: 1, wallet: 2800, earned: 4000, owned: ['garden'], receipts: [receipt] }; const f = fixture(JSON.stringify(old)); f.fail(true);
  assert.equal(f.store.read().error, 'migration_failed'); assert.deepEqual(JSON.parse(f.data.get(STORAGE_KEY)), old); f.fail(false);
  const migrated = f.store.read(); assert.equal(migrated.migrated, true); assert.equal(migrated.profile.version, 5);
  assert.equal(migrated.profile.wallet, 2800); assert.equal(migrated.profile.seedAmount, 0); assert.equal(migrated.profile.projectLevels.garden, 1); assert.equal(migrated.profile.receipts[0].legacy, true);
  assert.equal(f.create().read().profile.wallet, 2800); assert.equal(f.store.enter(admission({ runId: 'legacy' })).error, 'conflict');
  complete(f, 'after-migration', 'harbor', 500, 1); assert.equal(f.store.read().profile.wallet, 3050);
});
test('leaderboard uses original final cash, separated by map and mode', () => {
  const f = fixture(); complete(f, 'a', 'classic', 4000); complete(f, 'b', 'harbor', 9000); f.store.buy('garden', 1);
  assert.equal(f.store.leaderboard('classic', 'rounds').rows[0].cash, 4000); assert.equal(f.store.leaderboard('harbor', 'rounds').rows[0].cash, 9000); assert.equal(f.store.leaderboard('classic', 'bankruptcy').rows.length, 0);
});
test('bad amounts, excessive items and damaged saves cannot overwrite stored progress', () => {
  const f = fixture(); f.store.enter(admission()); const previous = f.data.get(STORAGE_KEY);
  for (const humanCash of [-1, 2.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '600']) assert.equal(f.store.settle(input({ humanCash })).error, 'invalid');
  for (const collectionCount of [0, 4, -1, 2.5]) assert.equal(f.store.settle(input({ collectionCount })).error, 'invalid');
  assert.equal(f.data.get(STORAGE_KEY), previous);
  for (const bad of ['[]', '{}', '{"version":99}', 'null', '{']) { f.data.set(STORAGE_KEY, bad); assert.equal(f.store.read().ok, false); assert.equal(f.store.enter(admission()).ok, false); assert.equal(f.data.get(STORAGE_KEY), bad); }
});
test('blocked storage is reported without admitting a game', () => {
  const blocked = createStore({ getItem() { throw Error('SecurityError'); }, setItem() { throw Error('SecurityError'); } });
  assert.equal(blocked.getEntryInfo({ mapId: 'classic', price: 100 }).error, 'unavailable'); assert.equal(blocked.enter(admission()).ok, false);
});
test('old paid IDs remain protected after more than 20 leaderboard records', () => {
  const f = fixture(); complete(f, 'first', 'classic', 1000, 1); for (let i = 0; i < 24; i++) complete(f, 'extra-' + i, 'classic', 1000 + i, 1);
  assert.equal(f.store.leaderboard('classic', 'rounds').rows.length, 20); const balance = f.store.read().profile.wallet;
  assert.equal(f.create().settle(input({ runId: 'first', humanCash: 1000, collectionCount: 1 })).duplicate, true); assert.equal(f.store.read().profile.wallet, balance);
});
console.log(`${checks} vault, admission, collection, migration and persistence checks passed.`);
