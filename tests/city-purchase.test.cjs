'use strict';
// Exercise the real municipal choice/transfer and rent rules. Only presentation
// answers and inert browser services are supplied by this harness.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {context} = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const checks = [];
async function test(name, work) { await work(); checks.push(name); }
const value = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const balances = c => value(c, '[...state.players.map(p=>p.cash),state.bankPool]');
const totalCash = c => balances(c).reduce((sum, cash) => sum + cash, 0);
function setup(map = 'compact', large = false) {
  const c = context(source, 137), menus = [], events = [], answers = [];
  c.answer = cfg => {
    menus.push(cfg);
    const answer = answers.shift();
    return typeof answer === 'function' ? answer(cfg) : answer;
  };
  c.capture = cfg => events.push(cfg);
  c.run(`initializeGame('${map}');showModal=async cfg=>answer(cfg);showContinueModal=async cfg=>capture(cfg);
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});
    var buyer=state.players[0],seller=state.players[1];buyer.cash=1000;seller.cash=700;state.bankPool=93;
    var target=state.board.find(t=>t.lot && !t.isLargeSecondary && ${large ? 't.lot.isLarge' : '!t.lot.isLarge'});
    target.lot.ownerId=seller.id;target.lot.level=2;`);
  return {c, menus, events, answers};
}
const select = c => `seize_${c.run('target.index')}`;
const resolve = c => c.run('resolveStartTakeover(buyer,state.sessionId)');

(async () => {
  for (const map of ['classic', 'compact', 'expansion']) {
    await test(`${map}: purchase conserves money, keeps building, and redirects next rent`, async () => {
      const {c, menus, events, answers} = setup(map);
      c.run('target.lot.price=201');
      const before = totalCash(c);
      answers.push(select(c), 'acquire');
      await resolve(c);
      assert.deepEqual(balances(c), [748, 901, 144]);
      assert.equal(totalCash(c), before);
      assert.equal(c.run('target.lot.ownerId'), 'human');
      assert.equal(c.run('target.lot.level'), 2);
      assert.match(menus[1].message, /¥252/);
      assert.match(menus[1].message, /¥201/);
      assert.match(menus[1].message, /¥51/);
      assert.equal(menus[1].buttons.find(b => b.id === 'acquire').label, '接手房产 · 支付 ¥252');
      const event = events.at(-1).drama;
      assert.equal(event.type, 'seize');
      assert.equal(event.from.id, 'ai');
      assert.equal(event.to.id, 'human');
      assert.equal(event.amount, 252);
      assert.equal(event.acquisition, true);
      assert.equal(event.purchasePrice, 252);
      assert.equal(event.refund, 201);
      assert.equal(event.premium, 51);
      assert.deepEqual(Array.from(event.tiles), [c.run('target.index')]);
      assert.equal(event.tileName, c.run('target.name'));
      const beforeRent = balances(c);
      const toll = value(c, 'collectToll(seller,buyer,target)');
      assert(toll.actualPayment > 0);
      assert.deepEqual(balances(c), [beforeRent[0]+toll.actualPayment,beforeRent[1]-toll.actualPayment,beforeRent[2]]);
      assert.equal(totalCash(c), before);
    });
    await test(`${map}: a double lot has one purchase and two updated landing halves`, async () => {
      const {c, menus, events, answers} = setup(map, true);
      const price = c.run('Math.ceil(target.lot.price*1.25)');
      const originalCash = c.run('buyer.cash');
      answers.push(select(c), 'acquire');
      await resolve(c);
      assert.equal(menus[0].buttons.filter(b => /^seize_/.test(b.id)).length, 1);
      assert.equal(c.run('state.board.find(t=>t.isLargeSecondary && t.largePrimaryIndex===target.index).lot===target.lot'), true);
      assert.equal(c.run('state.board.find(t=>t.isLargeSecondary && t.largePrimaryIndex===target.index).lot.ownerId'), 'human');
      assert.equal(c.run('state.board.find(t=>t.isLargeSecondary && t.largePrimaryIndex===target.index).lot.level'), 2);
      assert.equal(c.run('buyer.cash'), originalCash-price);
      assert.equal(c.run('getDistrictOwnerLots(target.lot.district,buyer.id).length'), 1);
      assert.deepEqual(Array.from(events.at(-1).drama.tiles), [c.run('target.index')]);
    });
  }

  await test('free seizure preserves prior compensation and creates no purchase charge', async () => {
    const {c, events, answers} = setup();
    const price = c.run('target.lot.price');
    answers.push(select(c), 'release');
    await resolve(c);
    assert.deepEqual(balances(c), [1000,700+price,93]);
    assert.equal(c.run('target.lot.ownerId'), null);
    assert.equal(c.run('target.lot.level'), 2);
    assert.equal(events.at(-1).drama.to.id, 'city');
    assert.equal(events.at(-1).drama.amount, 0);
    assert.equal(events.at(-1).drama.refund, price);
    assert.equal(events.at(-1).drama.acquisition, undefined);
  });

  for (const step of ['target', 'confirmation']) for (const action of ['skip','cancel']) {
    await test(`${action} at ${step} leaves every balance and property unchanged`, async () => {
      const {c, events, answers} = setup();
      if (step === 'confirmation') answers.push(select(c));
      answers.push(action);
      await resolve(c);
      assert.deepEqual(balances(c), [1000,700,93]);
      assert.equal(c.run('target.lot.ownerId'), 'ai');
      assert.equal(events.length, 0);
    });
  }

  await test('poor player still gets free seizure but cannot submit a purchase', async () => {
    const {c, menus, answers} = setup();
    c.run('buyer.cash=1');
    answers.push(select(c), 'acquire');
    await resolve(c);
    assert(!menus[1].buttons.some(b => b.id === 'acquire'));
    assert(menus[1].buttons.some(b => b.id === 'release'));
    assert.match(menus[1].message, /仍可免费征用/);
    assert.deepEqual(balances(c), [1,700,93]);
    assert.equal(c.run('target.lot.ownerId'), 'ai');
  });

  await test('cash is checked again after the confirmation menu resolves', async () => {
    const {c, events, answers} = setup();
    answers.push(select(c), () => {c.run('buyer.cash=0');return 'acquire';});
    await resolve(c);
    assert.deepEqual(balances(c), [0,700,93]);
    assert.equal(c.run('target.lot.ownerId'), 'ai');
    assert.match(events.at(-1).title, /现金不足/);
  });

  for (const step of ['target', 'confirmation']) {
    await test(`ownership is checked again after ${step} selection`, async () => {
      const {c, menus, events, answers} = setup();
      if (step === 'confirmation') answers.push(select(c));
      answers.push(() => {c.run('target.lot.ownerId=null');return step === 'target' ? select(c) : 'acquire';});
      await resolve(c);
      assert.deepEqual(balances(c), [1000,700,93]);
      assert.equal(c.run('target.lot.ownerId'), null);
      assert.equal(events.length, 0);
      assert.equal(menus.length, step === 'target' ? 1 : 2);
    });
    await test(`restarting while ${step} menu is open cannot mutate the new game`, async () => {
      const {c, events, answers} = setup();
      let release;
      const oldSelection = select(c);
      if (step === 'confirmation') answers.push(oldSelection);
      answers.push(() => new Promise(resolve => {release=resolve;}));
      const pending = resolve(c);
      for(let i=0;i<8 && !release;i++) await Promise.resolve();
      assert.equal(typeof release, 'function');
      c.run('initializeGame("expansion")');
      const newBalances = balances(c);
      const newOwners = value(c, 'state.board.map(t=>t.lot?.ownerId??null)');
      release(step === 'target' ? oldSelection : 'acquire');
      await pending;
      assert.deepEqual(balances(c), newBalances);
      assert.deepEqual(value(c, 'state.board.map(t=>t.lot?.ownerId??null)'), newOwners);
      assert.equal(events.length, 0);
    });
  }

  for(const invalid of ['seize_0','seize_1junk','acquire',undefined]) {
    await test(`invalid target ${String(invalid)} does not alter any property`, async () => {
      const {c, answers} = setup();
      answers.push(invalid);
      await resolve(c);
      assert.deepEqual(balances(c), [1000,700,93]);
      assert.equal(c.run('target.lot.ownerId'), 'ai');
    });
  }

  await test('AI considers a cheaper affordable target instead of seizing the expensive one', async () => {
    const {c, events} = setup();
    c.run(`buyer.isAi=true;buyer.cash=230;target.lot.price=400;target.lot.level=3;
      var cheap=state.board.find(t=>t.lot && !t.isLargeSecondary && t!==target);
      cheap.lot.ownerId=seller.id;cheap.lot.price=100;cheap.lot.level=1;`);
    const before = totalCash(c);
    await resolve(c);
    assert.equal(c.run('target.lot.ownerId'), 'ai');
    assert.equal(c.run('cheap.lot.ownerId'), 'human');
    assert.deepEqual(balances(c), [105,800,118]);
    assert.equal(totalCash(c), before);
    assert.equal(events.at(-1).drama.purchasePrice, 125);
  });

  for(const cash of [204,205]) {
    await test(`AI ${cash === 205 ? 'buys with exactly 80 reserve' : 'uses free seizure below 80 reserve'}`, async () => {
      const {c, events} = setup();
      c.run(`buyer.isAi=true;buyer.cash=${cash};target.lot.price=100;`);
      await resolve(c);
      assert.equal(c.run('target.lot.ownerId'), cash === 205 ? 'human' : null);
      assert.deepEqual(balances(c), cash === 205 ? [80,800,118] : [204,800,93]);
      assert.equal(events.at(-1).drama.amount, cash === 205 ? 125 : 0);
    });
  }

  await test('no targets retains the existing 100 subsidy', async () => {
    const {c, menus} = setup();
    c.run('target.lot.ownerId=null');
    await resolve(c);
    assert.deepEqual(balances(c), [1100,700,93]);
    assert.equal(menus.length, 0);
  });

  await test('stale session entry does not grant a subsidy or open menus', async () => {
    const {c, menus, events} = setup();
    c.run('var oldSid=state.sessionId;initializeGame("classic")');
    const before = balances(c);
    await c.run('resolveStartTakeover(buyer,oldSid)');
    assert.deepEqual(balances(c), before);
    assert.equal(menus.length, 0);
    assert.equal(events.length, 0);
  });

  console.log('PASS',checks.length,'municipal purchase / compensation / ownership / cancellation checks');
})().catch(error => {console.error(error);process.exitCode=1;});
