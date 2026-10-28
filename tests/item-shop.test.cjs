'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
function setup({ map = 'classic', ai = false, cash = 500 } = {}) {
  const c = context(source, 96), dialogs = [], notices = [];
  c.choose = cfg => { dialogs.push(cfg); return 'skip'; };
  c.notice = cfg => notices.push(cfg);
  c.run(`initializeGame('${map}');startScreenEl.classList.contains=()=>true;
    state.currentPlayerIndex=${ai ? 1 : 0};var shopper=currentPlayer();
    var shopTile=state.board.find(t=>t.special?.type==='chance');shopper.position=shopTile.index;shopper.cash=${cash};
    showModal=cfg=>choose(cfg);showContinueModal=async cfg=>notice(cfg);`);
  return { c, dialogs, notices, open: () => c.run('resolveChance(shopper,shopTile,state.sessionId)') };
}
function offers(c, ids = ['shield', 'boost', 'combo']) {
  c.run(`drawItemShopOffers=()=>${JSON.stringify(ids)}.map(id=>CARD_POOL.find(c=>c.id===id))`);
}
(async () => {
  await test('all five maps replace opportunity destinations with named paid item shops', () => {
    const c = context(source);
    for (const map of ['classic','compact','expansion','harbor','alpine']) {
      c.run(`initializeGame('${map}')`);
      const shops = json(c, `state.board.filter(t=>t.special?.type==='chance').map(t=>({name:t.name,label:t.special.label,description:t.special.description}))`);
      assert(shops.length); shops.forEach(shop => { assert.match(shop.name,/道具商店|集市/); assert.match(shop.label,/道具商店|集市/); assert.match(shop.description,/现金/); });
      assert(c.run(`state.board.some(t=>t.special?.type==='card_draw')`),'free draw stations remain');
    }
  });
  await test('maps that allow it stock a 400-coin motorcycle as regular random stock; compact never sells one', () => {
    for (const map of ['classic','compact','expansion','harbor','alpine']) {
      const { c } = setup({ map });
      let motorcycles = 0;
      for (let i=0;i<300;i++) {
        const stock=json(c,'drawItemShopOffers().map(c=>({id:c.id,price:ITEM_SHOP_PRICES[c.id]}))');
        assert.equal(stock.length,3);assert.equal(new Set(stock.map(c=>c.id)).size,3);
        motorcycles+=stock.filter(c=>c.id==='motorcycle').length;
        stock.forEach(card=>card.id==='motorcycle' ? assert.equal(card.price,400) : assert(card.price>=80&&card.price<=240));
      }
      if (map === 'compact') assert.equal(motorcycles,0,map);
      else assert(motorcycles>30&&motorcycles<105,`${map} motorcycle appears like other stock: ${motorcycles}/300`);
    }
  });
  await test('a motorcycle already in the bag or installed is replaced with regular stock', () => {
    for (const state of ['bag','installed']) {
      const { c } = setup();
      c.run(state==='bag' ? `GameCards.grant('human','motorcycle',{type:'test'})` : `shopper.vehicle='motorcycle'`);
      for (let i=0;i<20;i++) {
        const ids=json(c,'drawItemShopOffers().map(c=>c.id)');
        assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert(!ids.includes('motorcycle'),state);
      }
    }
  });
  await test('free card destinations do not offer the shop-only motorcycle', () => {
    const { c } = setup();
    for(let i=0;i<100;i++) assert(!json(c,'drawInventoryCardOffers().map(c=>c.id)').includes('motorcycle'));
  });
  await test('a bought motorcycle stays in the bag until installed and then persists between turns', async () => {
    const { c, open } = setup(); offers(c, ['motorcycle', 'shield', 'boost']); c.choose=()=>'motorcycle';
    await open();
    assert.equal(c.run('shopper.cash'),100);
    assert.equal(c.run('shopper.cards.length'),1);
    assert.equal(c.run('shopper.cards[0].cardId'),'motorcycle');
    assert.equal(c.run('shopper.cards[0].source.type'),'shop');
    assert.notEqual(c.run('shopper.vehicle'),'motorcycle');
    const installed=await c.run(`GameCards.use(shopper.cards[0].instanceId)`);
    assert.equal(installed.ok,true);
    assert.equal(c.run('shopper.vehicle'),'motorcycle');assert.equal(c.run('shopper.vehicleDiceCount'),1);
    assert.equal(c.run('shopper.cash'),100);assert.equal(c.run('shopper.cards.length'),0);
    assert.equal(c.run('state.currentPlayerIndex'),0);assert.equal(c.run('state.phase'),'await_roll');
    c.run('endTurn();endTurn()');
    assert.equal(c.run('shopper.vehicle'),'motorcycle');assert.equal(c.run('shopper.vehicleDiceCount'),1);
    c.run(`initializeGame('compact')`);assert.notEqual(c.run('state.players[0].vehicle'),'motorcycle');
  });
  await test('buy one card debits exact price, retains provenance, and never auto uses it', async () => {
    const { c, open } = setup(); offers(c); c.choose=()=>'shield';
    const before=json(c,'shopper.effects');await open();
    assert.equal(c.run('shopper.cash'),360);assert.equal(c.run('shopper.cards.length'),1);
    assert.deepEqual(json(c,'shopper.effects'),before);
    assert.equal(c.run('shopper.cards[0].source.type'),'shop');assert.equal(c.run('shopper.cards[0].source.tileIndex'),13);
    assert.match(c.run('shopper.cards[0].source.reference'),/:shop:1$/);assert.equal(c.run('state.itemShopVisit'),null);
  });
  await test('skip is free and does not mutate the city or card inventory', async () => {
    const { c, open, dialogs }=setup();const before=json(c,'state.board');await open();
    assert.equal(c.run('shopper.cash'),500);assert.equal(c.run('shopper.cards.length'),0);assert.deepEqual(json(c,'state.board'),before);
    assert.equal(dialogs[0].buttons.at(-1).id,'skip');assert.equal(dialogs[0].itemShop,true);
  });
  await test('unaffordable choices are disabled and even a forged click cannot overdraw',async()=>{
    const {c,open,dialogs}=setup({cash:79});offers(c);c.choose=cfg=>{dialogs.push(cfg);return 'shield';};await open();
    assert(dialogs[0].buttons.slice(0,3).every(b=>b.disabled));assert.equal(c.run('shopper.cash'),79);assert.equal(c.run('shopper.cards.length'),0);
  });
  await test('a card outside the current offer cannot be bought',async()=>{
    const {c,open}=setup();offers(c);c.choose=()=>'launch';await open();assert.equal(c.run('shopper.cash'),500);assert.equal(c.run('shopper.cards.length'),0);
  });
  await test('double commit grants and charges once, and a concurrent resolver cannot reroll',async()=>{
    const {c,open}=setup();offers(c);let release,requests=0;c.choose=()=>{requests++;return new Promise(r=>release=r);};
    const pending=open();await Promise.resolve();c.run('var visit=state.itemShopVisit');
    assert.equal(c.run(`commitItemShopPurchase(visit,'shield').ok`),true);
    assert.equal(c.run(`commitItemShopPurchase(visit,'boost').ok`),false);await open();assert.equal(requests,1);
    release('shield');await pending;assert.equal(c.run('shopper.cards.length'),1);assert.equal(c.run('shopper.cash'),360);
  });
  await test('read-only shop snapshot copies cannot alter stock or prices',async()=>{
    const {c,open}=setup();offers(c);let release;c.choose=()=>new Promise(r=>release=r);const pending=open();
    c.run(`var copy=GameCards.getShopSnapshot();copy.offers[0].id='launch';copy.offers[0].price=0;`);
    assert.equal(c.run('GameCards.getShopSnapshot().offers[0].id'),'shield');assert.equal(c.run('GameCards.getShopSnapshot().offers[0].price'),140);
    release('skip');await pending;assert.equal(c.run('GameCards.getShopSnapshot()'),null);
  });
  for(const [name,change] of [['restart',`initializeGame('harbor')`],['game over','state.gameOver=true'],['player moved','shopper.position=0'],['turn changed','state.currentPlayerIndex=1']]) {
    await test(`${name} while shop waits makes its selection stale`,async()=>{
      const {c,open}=setup();offers(c);let release;c.choose=()=>new Promise(r=>release=r);const pending=open();
      c.run(change);const before=json(c,'state.players.map(p=>({cash:p.cash,cards:p.cards}))');release('shield');await pending;
      assert.deepEqual(json(c,'state.players.map(p=>({cash:p.cash,cards:p.cards}))'),before);
    });
  }
  await test('cash changing while a choice waits is revalidated at purchase',async()=>{
    const {c,open}=setup();offers(c);let release;c.choose=()=>new Promise(r=>release=r);const pending=open();c.run('shopper.cash=20');release('shield');await pending;
    assert.equal(c.run('shopper.cash'),20);assert.equal(c.run('shopper.cards.length'),0);
  });
  await test('AI buys one useful affordable card while reserving at least 150 coins',async()=>{
    const {c,open,notices}=setup({ai:true,cash:270});offers(c,['boost','combo','launch']);await open();
    assert.equal(c.run('shopper.cash'),150);assert.equal(c.run('shopper.cards[0].cardId'),'boost');assert.equal(c.run('shopper.effects.speedBoost'),false);assert.equal(notices.length,1);
  });
  await test('AI with insufficient reserve or already stocked cards passes',async()=>{
    for(const stocked of [false,true]){const {c,open}=setup({ai:true,cash:stocked?500:229});offers(c);
      if(stocked)c.run(`['shield','boost','combo'].forEach(id=>grantInventoryCard('ai',id))`);
      const before=json(c,'({cash:shopper.cash,cards:shopper.cards})');await open();assert.deepEqual(json(c,'({cash:shopper.cash,cards:shopper.cards})'),before);
    }
  });
  await test('AI purchase remains exactly once even while its notice awaits',async()=>{
    const {c,open}=setup({ai:true});offers(c);let release;c.run('showContinueModal=cfg=>notice(cfg)');c.notice=()=>new Promise(r=>release=r);
    const pending=open();await Promise.resolve();await open();assert.equal(c.run('shopper.cards.length'),1);release();await pending;
  });
  const offerSequence = (c, sets) => c.run(`var drawCount=0;drawItemShopOffers=()=>${JSON.stringify(sets)}[Math.min(drawCount++,${sets.length - 1})].map(id=>CARD_POOL.find(c=>c.id===id))`);
  const ads = (c, outcomes) => c.run(`var adCalls=[];GameAds={isAvailable:placement=>placement==='shop_refresh',showRewarded:async request=>{adCalls.push(request);const outcome=${JSON.stringify(outcomes)}[adCalls.length-1];if(outcome==='throw')throw Error('no fill');return outcome}}`);
  await test('without an ad adapter the shop shows no refresh and a forged refresh does nothing', async () => {
    const { c, open, dialogs } = setup(); offerSequence(c, [['shield', 'boost', 'combo'], ['motorcycle', 'freeze', 'launch']]);
    let snapshot; c.choose = cfg => { dialogs.push(cfg); snapshot ??= json(c, 'GameCards.getShopSnapshot()'); return dialogs.length === 1 ? 'refresh' : 'skip'; };
    await open();
    assert.equal(dialogs.length, 2); dialogs.forEach(d => assert(!d.buttons.some(b => b.id === 'refresh')));
    assert.equal(snapshot.canRefresh, false); assert.equal(c.run('drawCount'), 1); assert.equal(c.run('shopper.cash'), 500);
  });
  await test('a watched ad redraws the stock once per visit and the new stock can be bought', async () => {
    const { c, open, dialogs } = setup(); offerSequence(c, [['shield', 'boost', 'combo'], ['motorcycle', 'freeze', 'launch']]); ads(c, [true]);
    c.choose = cfg => { dialogs.push(cfg); return dialogs.length === 1 ? 'refresh' : 'motorcycle'; };
    await open();
    assert.deepEqual(Array.from(dialogs[0].buttons, b => b.id), ['shield', 'boost', 'combo', 'refresh', 'skip']);
    assert.deepEqual(Array.from(dialogs[1].buttons, b => b.id), ['motorcycle', 'freeze', 'launch', 'skip']);
    assert.deepEqual(json(c, 'adCalls.map(r=>r.placement)'), ['shop_refresh']); assert.match(c.run('adCalls[0].reference'), /:shop:1$/);
    assert.equal(c.run('drawCount'), 2); assert.equal(c.run('shopper.cards[0].cardId'), 'motorcycle'); assert.equal(c.run('shopper.cash'), 100);
  });
  await test('stock replaced by a refresh can no longer be bought', async () => {
    const { c, open, dialogs } = setup(); offerSequence(c, [['shield', 'boost', 'combo'], ['motorcycle', 'freeze', 'launch']]); ads(c, [true]);
    c.choose = cfg => { dialogs.push(cfg); return dialogs.length === 1 ? 'refresh' : 'shield'; };
    await open();
    assert.equal(c.run('shopper.cards.length'), 0); assert.equal(c.run('shopper.cash'), 500);
  });
  await test('a cancelled or failed ad keeps the same stock and the refresh can be retried', async () => {
    const { c, open, dialogs } = setup(); offerSequence(c, [['shield', 'boost', 'combo'], ['motorcycle', 'freeze', 'launch']]); ads(c, [false, 'throw']);
    c.choose = cfg => { dialogs.push(cfg); return dialogs.length < 3 ? 'refresh' : 'skip'; };
    await open();
    assert.equal(dialogs.length, 3); assert.equal(c.run('adCalls.length'), 2); assert.equal(c.run('drawCount'), 1);
    dialogs.forEach(d => assert.deepEqual(Array.from(d.buttons, b => b.id), ['shield', 'boost', 'combo', 'refresh', 'skip']));
    assert.equal(c.run('shopper.cash'), 500); assert.equal(c.run('shopper.cards.length'), 0);
  });
  await test('a shop visit that ends while the ad plays is neither refreshed nor reopened', async () => {
    const { c, open, dialogs } = setup(); offerSequence(c, [['shield', 'boost', 'combo'], ['motorcycle', 'freeze', 'launch']]);
    c.run(`var adCalls=[];GameAds={isAvailable:()=>true,showRewarded:async request=>{adCalls.push(request);initializeGame('harbor');return true}}`);
    c.choose = cfg => { dialogs.push(cfg); return 'refresh'; };
    await open();
    assert.equal(dialogs.length, 1); assert.equal(c.run('adCalls.length'), 1); assert.equal(c.run('drawCount'), 1);
  });
  await test('AI shoppers never request an ad refresh', async () => {
    const { c, open } = setup({ ai: true }); offers(c); ads(c, [true]); await open();
    assert.equal(c.run('adCalls.length'), 0); assert.equal(c.run('shopper.cards.length'), 1);
  });
  console.log(`PASS ${checks} item shop groups`);
})().catch(error=>{console.error(error);process.exitCode=1;});
