'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { createStore } = require('../progression.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
function setup(map = 'classic') {
  const data = new Map(), prompts = [], errors = []; let sequence = 0, failWrite = false, cancelEntry = false;
  const store = createStore({ getItem: key => data.get(key) ?? null, setItem(key, value) { if (failWrite) throw Error('Storage full'); data.set(key, value); } });
  const c = context(source, 7001);
  c.GameProgression = { ...store, getProfile: store.read, createRunId: () => 'actual-' + ++sequence, resetResult() {}, showEntryError: error => errors.push(error) };
  c.answer = cfg => { prompts.push({ label: cfg.label, wallet: store.read().profile?.wallet }); if (cfg.buttons.some(b => b.id === 'rounds')) return 'rounds'; if (cfg.buttons.some(b => b.id === 'enter')) return cancelEntry ? 'cancel' : 'enter'; if (cfg.buttons.some(b => b.id === 'flip')) return 'flip'; throw Error('Unexpected modal: ' + cfg.title); };
  c.Math.random = () => .1;
  c.run(`selectedMapId='${map}';showModal=async cfg=>answer(cfg);`);
  return { c, store, prompts, errors, fail: value => { failWrite = value; }, cancel: value => { cancelEntry = value; } };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await test('real startup pays before coin flip and only then becomes formal', async () => {
    const f = setup('harbor'); await f.c.run('startNewGame()');
    assert.equal(f.store.read().profile.wallet, 950); assert.equal(f.c.run('state.ticketPaid'), true); assert.equal(f.c.run('state.isFormalRun'), true);
    assert.equal(f.prompts.find(p => p.label === '先手决定').wallet, 950);
    const entry = f.store.read().profile.entries[0]; assert.equal(entry.mapId, 'harbor'); assert.equal(entry.collectionId, 'harbor_shell');
    assert.equal(f.c.run('state.players[0].cash'), 1700, 'vault ticket does not reduce the match starting cash');
  });
  await test('cancel before payment and failed ticket persistence cannot reach the coin flip', async () => {
    for (const failure of ['cancel', 'storage']) {
      const f = setup(); if (failure === 'cancel') f.cancel(true); else f.fail(true);
      await f.c.run('startNewGame()');
      assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.c.run('state.isFormalRun'), false);
      assert.equal(f.prompts.some(p => p.label === '先手决定'), false); assert.equal(f.store.read().profile.entries.length, 0);
      if (failure === 'storage') assert.equal(f.errors[0].error, 'save_failed');
    }
  });
  await test('reset does not refund a paid unfinished run and another start pays a fresh ticket', async () => {
    const f = setup(); await f.c.run('startNewGame()'); const first = f.c.run('state.runId');
    f.c.run('initializeGame("classic")'); assert.equal(f.store.read().profile.wallet, 1100); assert.equal(f.c.run('state.isFormalRun'), false);
    await f.c.run('startNewGame()'); assert.notEqual(f.c.run('state.runId'), first); assert.equal(f.store.read().profile.wallet, 1000);
    assert.equal(f.store.read().profile.entries.length, 2);
  });
  await test('real finish banks exact final cash and rewards completion, victory and a max-level large lot', async () => {
    const f = setup('alpine'); await f.c.run('startNewGame()');
    f.c.run('state.round=31;state.players[0].cash=700;state.players[1].cash=300;state.board[14].lot.ownerId="human";state.board[14].lot.level=3;finishGame("rounds");finishGame("rounds");');
    const p = f.store.read().profile; assert.equal(p.wallet, 1550); assert.equal(p.earned, 700); assert.equal(p.receipts.length, 1);
    assert.equal(p.collections.alpine_crystal, 3); assert.equal(p.receipts[0].collectionCount, 3); assert.equal(f.c.run('loadHistory().length'), 1);
  });
  await test('a loss still banks its cash and exactly one completion collectible', async () => {
    const f = setup('harbor'); await f.c.run('startNewGame()');
    f.c.run('state.round=31;state.players[0].cash=200;state.players[1].cash=900;finishGame("rounds");');
    assert.equal(f.store.read().profile.wallet, 1150); assert.equal(f.store.read().profile.collections.harbor_shell, 1);
  });
  await test('an initialized preview or unpaid scenario cannot mint cash or collectibles', () => {
    const f = setup(); f.c.run('initializeGame("harbor");state.players[0].cash=10000;finishGame("rounds");');
    assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.store.read().profile.receipts.length, 0); assert.equal(f.c.run('state.citySettlement.skipped'), true);
  });
  console.log(`${checks} actual admission and finish-game integration checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
