'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { createStore } = require('../progression.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
function setup(map = 'classic') {
  const data = new Map(), prompts = [], errors = []; let sequence = 0, failWrite = false;
  const store = createStore({ getItem: key => data.get(key) ?? null, setItem(key, value) { if (failWrite) throw Error('Storage full'); data.set(key, value); } });
  const c = context(source, 7001);
  c.GameProgression = { ...store, getProfile: store.read, createRunId: () => 'actual-' + ++sequence, resetResult() {}, showEntryError: error => errors.push(error) };
  c.answer = cfg => { prompts.push({ label: cfg.label, wallet: store.read().profile?.wallet, buttons: Array.from(cfg.buttons, b => b.id) }); if (cfg.buttons.some(b => b.id === 'flip')) return 'flip'; throw Error('Unexpected modal: ' + cfg.title); };
  c.entryError = error => { if (error) errors.push(error); };
  c.Math.random = () => .1;
  c.run(`selectedMapId='${map}';showModal=async cfg=>answer(cfg);setEntryError=result=>entryError(result);`);
  return { c, store, prompts, errors, fail: value => { failWrite = value; } };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await test('all five maps start directly with fixed rounds, even after a legacy bankruptcy game', async () => {
    for (const [map, limit] of [['classic', 30], ['compact', 26], ['expansion', 40], ['harbor', 40], ['alpine', 30]]) {
      const f = setup(map); f.c.run('initializeGame();state.gameMode="bankruptcy";');
      await f.c.run('startNewGame()');
      assert.equal(f.c.run('state.gameMode'), 'rounds'); assert.equal(f.c.run('getMaxRounds()'), limit);
      assert.deepEqual(f.prompts.map(p => p.label), ['先手决定']);
      assert.deepEqual(f.prompts[0].buttons, ['flip']);
      assert.equal(f.store.read().profile.entries.length, 1);
    }
  });
  await test('overlapping start requests admit only the active session and charge one ticket', async () => {
    const f = setup(); const answer = f.c.answer; let release, coinCount = 0;
    f.c.answer = cfg => {
      if (cfg.buttons.some(b => b.id === 'flip') && ++coinCount === 1) return new Promise(resolve => { release = resolve; });
      return answer(cfg);
    };
    const staleStart = f.c.run('startNewGame()'); await f.c.run('startNewGame()');
    release('flip'); await staleStart;
    assert.equal(f.store.read().profile.wallet, 1100); assert.equal(f.store.read().profile.entries.length, 1);
    assert.equal(f.store.read().profile.entries[0].runId, f.c.run('state.runId'));
    assert.equal(f.c.run('state.isFormalRun'), true);
  });
  await test('each map ends after both seats finish its fixed normal-round limit', async () => {
    for (const [map, limit] of [['classic', 30], ['compact', 26], ['expansion', 40], ['harbor', 40], ['alpine', 30]]) {
      for (const first of [0, 1]) {
        const f = setup(map); f.c.Math.random = () => first === 0 ? .1 : .9; await f.c.run('startNewGame()');
        const turns = [0, 0];
        for (let turn = 0; turn < limit * 2; turn++) {
          assert.equal(f.c.run('state.gameOver'), false);
          turns[f.c.run('state.currentPlayerIndex')]++;
          f.c.run('endTurn()');
        }
        assert.deepEqual(turns, [limit, limit]); assert.equal(f.c.run('state.gameOver'), true);
        const profile = f.store.read().profile, record = profile.receipts[0];
        assert.equal(record.rounds, limit); assert.equal(record.mode, 'rounds'); assert.equal(record.reason, 'rounds');
        f.c.run('endTurn()'); assert.equal(f.store.read().profile.wallet, profile.wallet);
        assert.equal(f.store.read().profile.receipts.length, 1);
      }
    }
  });
  await test('real startup pays before coin flip and only then becomes formal', async () => {
    const f = setup('harbor'); await f.c.run('startNewGame()');
    assert.equal(f.store.read().profile.wallet, 950); assert.equal(f.c.run('state.ticketPaid'), true); assert.equal(f.c.run('state.isFormalRun'), true);
    assert.equal(f.prompts.find(p => p.label === '先手决定').wallet, 950);
    const entry = f.store.read().profile.entries[0]; assert.equal(entry.mapId, 'harbor'); assert.equal(entry.collectionId, 'harbor_shell');
    assert.equal(f.c.run('state.players[0].cash'), 1700, 'vault ticket does not reduce the match starting cash');
  });
  await test('failed ticket persistence leaves the existing board intact and cannot reach the coin flip', async () => {
      const f = setup(); f.c.run('initializeGame("harbor")'); const before = f.c.run('state'); f.fail(true);
      await f.c.run('startNewGame()');
      assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.c.run('state.isFormalRun'), false);
      assert.equal(f.prompts.some(p => p.label === '先手决定'), false); assert.equal(f.store.read().profile.entries.length, 0);
      assert.equal(f.errors[0].error, 'save_failed'); assert.equal(f.c.run('state'), before);
  });
  await test('ticket debit occurs while the old board still exists, before initializing the paid session', async () => {
    const f = setup('harbor'); f.c.run('initializeGame("classic");selectedMapId="harbor";');
    const before = f.c.run('state'), realEnter = f.c.GameProgression.enter;
    f.c.GameProgression.enter = input => { assert.equal(f.c.run('state'), before); return realEnter(input); };
    await f.c.run('startNewGame()'); assert.notEqual(f.c.run('state'), before);
    assert.equal(f.c.run('state.currentMapId'), 'harbor');
  });
  await test('insufficient funds and cancelled map browsing leave the existing session untouched', async () => {
    const f = setup('harbor'); f.c.run('initializeGame("harbor")'); const before = f.c.run('state');
    const wallet = f.store.read().profile.wallet; f.c.run('showStartScreen();setSelectedMap("alpine");setSelectedMap("harbor");');
    assert.equal(f.store.read().profile.wallet, wallet); assert.equal(f.c.run('state'), before);
    f.store.enter({runId:'spent',mapId:'classic',price:1200});
    await f.c.run('startNewGame()'); assert.equal(f.c.run('state'), before);
    assert.equal(f.errors[0].canEnter, false); assert.equal(f.prompts.length, 0); assert.equal(f.store.read().profile.entries.length, 1);
  });
  await test('reset does not refund a paid unfinished run and another start pays a fresh ticket', async () => {
    const f = setup(); await f.c.run('startNewGame()'); const first = f.c.run('state.runId');
    f.c.run('initializeGame("classic");showStartScreen()'); assert.equal(f.store.read().profile.wallet, 1100); assert.equal(f.c.run('state.isFormalRun'), false);
    await f.c.run('startNewGame()'); assert.notEqual(f.c.run('state.runId'), first); assert.equal(f.store.read().profile.wallet, 1000);
    assert.equal(f.store.read().profile.entries.length, 2);
  });
  await test('real finish banks exact final cash and rewards completion, victory and a max-level large lot', async () => {
    const f = setup('alpine'); await f.c.run('startNewGame()');
    f.c.run('state.round=31;state.players[0].cash=700;state.players[1].cash=300;state.board[14].lot.ownerId="human";state.board[14].lot.level=3;finishGame("rounds");finishGame("rounds");');
    const p = f.store.read().profile; assert.equal(p.wallet, 1940); assert.equal(p.earned, 1090); assert.equal(p.receipts.length, 1);
  assert.equal(p.receipts[0].cash, 700); assert.equal(p.receipts[0].opponentCash, 300); assert.equal(p.receipts[0].coins, 1090);
    assert.equal(p.collections.alpine_crystal, 3); assert.equal(p.receipts[0].collectionCount, 3); assert.equal(f.c.run('loadHistory().length'), 1);
  });
await test('a loss banks the scaled consolation payout and exactly one completion collectible', async () => {
  const f = setup('harbor'); await f.c.run('startNewGame()');
  f.c.run('state.round=31;state.players[0].cash=200;state.players[1].cash=900;finishGame("rounds");');
  assert.equal(f.store.read().profile.wallet, 1075); assert.equal(f.store.read().profile.collections.harbor_shell, 1);
  });
  await test('an initialized preview or unpaid scenario cannot mint cash or collectibles', () => {
    const f = setup(); f.c.run('initializeGame("harbor");state.players[0].cash=10000;finishGame("rounds");');
    assert.equal(f.store.read().profile.wallet, 1200); assert.equal(f.store.read().profile.receipts.length, 0); assert.equal(f.c.run('state.citySettlement.skipped'), true);
  });
  await test('home cancellation preserves the paid run and puts the primary action on the right', async () => {
    const f = setup(); await f.c.run('startNewGame()');
    f.c.run('showModal=realShowModal;render=()=>{updateControls();renderModal();};');
    const before = f.c.run('state'), wallet = f.store.read().profile.wallet;
    const pending = f.c.run('returnToStartScreen()');
    assert.equal(f.c.run('restartBtn.disabled'), true);
    assert.equal(f.c.run('rollBtn.disabled'), true);
    const buttons = f.c.run('state.modal.buttons');
    assert.deepEqual(Array.from(buttons, b => b.id), ['cancel', 'home']); assert.equal(buttons[1].variant, 'primary');
    assert.match(f.c.run('eventActionsEl.innerHTML'), /data-action="cancel".*data-action="home"/);
    await f.c.run('returnToStartScreen()'); // A second click must not replace or resolve the first prompt.
    f.c.run('hideModal(true,"cancel")'); await pending;
    assert.equal(f.c.run('state'), before); assert.equal(f.c.run('state.phase'), 'await_roll');
    assert.equal(f.c.run('state.modal.visible'), false); assert.equal(f.c.run('rollBtn.disabled'), false);
    assert.equal(f.c.run('restartBtn.disabled'), false); assert.equal(f.store.read().profile.wallet, wallet);
  });
  await test('home cancellation resumes an unresolved gameplay choice', async () => {
    const f = setup(); await f.c.run('startNewGame()'); f.c.run('showModal=realShowModal;');
    let resolved = false;
    const choice = f.c.run('showModal({label:"购买地块",title:"购买？",message:"当前地块",buttons:[{id:"buy",label:"购买",variant:"primary"}]})');
    choice.then(() => { resolved = true; }); const modal = f.c.run('state.modal');
    const pending = f.c.run('returnToStartScreen()');
    f.c.run('hideModal(true,"cancel")'); await pending;
    assert.equal(resolved, false); assert.equal(f.c.run('state.modal'), modal); assert.equal(f.c.run('state.phase'), 'await_modal');
    f.c.run('hideModal(true,"buy")'); assert.equal(await choice, 'buy');
  });
  await test('confirmed home cancels the suspended choice without refund or settlement', async () => {
    const f = setup(); await f.c.run('startNewGame()'); f.c.run('showModal=realShowModal;');
    const sid = f.c.run('state.sessionId');
    const choice = f.c.run('showModal({title:"购买？",message:"当前地块",buttons:[{id:"buy",label:"购买"}]})');
    const pending = f.c.run('returnToStartScreen()'); f.c.run('hideModal(true,"home")'); await pending;
    assert.equal(await choice, 'cancel'); assert.notEqual(f.c.run('state.sessionId'), sid); assert.equal(f.c.run('state.isFormalRun'), false);
    assert.equal(f.store.read().profile.wallet, 1100); assert.equal(f.store.read().profile.receipts.length, 0);
  });
  await test('home waits for movement or a presentation boundary but preview can still exit', async () => {
    const f = setup(); await f.c.run('startNewGame()'); f.c.run('showModal=realShowModal;state.busy=true;state.phase="presenting";updateControls();');
    const sid = f.c.run('state.sessionId'); assert.equal(f.c.run('restartBtn.disabled'), true);
    await f.c.run('returnToStartScreen()'); assert.equal(f.c.run('state.sessionId'), sid); assert.equal(f.c.run('state.modal.visible'), false);
    f.c.run('initializeGame();state.busy=true;state.phase="locked";updateControls();');
    assert.equal(f.c.run('restartBtn.disabled'), false);
    const preview = f.c.run('state.sessionId'); await f.c.run('returnToStartScreen()'); assert.notEqual(f.c.run('state.sessionId'), preview);
  });
  await test('an independent reset cannot restore a stale home or gameplay choice', async () => {
    const f = setup(); await f.c.run('startNewGame()'); f.c.run('showModal=realShowModal;');
    const choice = f.c.run('showModal({title:"购买？",message:"当前地块",buttons:[{id:"buy",label:"购买"}]})');
    const pending = f.c.run('returnToStartScreen()'); f.c.run('initializeGame("harbor")'); const fresh = f.c.run('state');
    await pending; assert.equal(await choice, 'cancel'); assert.equal(f.c.run('state'), fresh);
    assert.equal(f.c.run('state.currentMapId'), 'harbor'); assert.equal(f.c.run('state.modal.visible'), false); assert.equal(f.c.run('restartBtn.disabled'), false);
  });
  await test('a finished game returns home without another confirmation or duplicated reward', async () => {
    const f = setup(); await f.c.run('startNewGame()'); f.c.run('state.round=31;finishGame("rounds");showModal=realShowModal;');
    const wallet = f.store.read().profile.wallet, sid = f.c.run('state.sessionId');
    await f.c.run('returnToStartScreen()'); assert.notEqual(f.c.run('state.sessionId'), sid);
    assert.equal(f.store.read().profile.wallet, wallet); assert.equal(f.store.read().profile.receipts.length, 1);
  });
  console.log(`${checks} actual admission and finish-game integration checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
