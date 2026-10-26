'use strict';
// Exercise real municipal rewards, arrivals, inventory and property transfers.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
let checks = 0;
async function test(name, work) { await work(); checks++; }
const json = (c, code) => JSON.parse(c.run('JSON.stringify(' + code + ')'));
const money = c => json(c, '[...state.players.map(p=>p.cash),state.bankPool]');
function setup(map = 'classic', large = false) {
  const c = context(source, 137), events = [], menus = [];
  c.capture = cfg => events.push(cfg);
  c.answer = cfg => {menus.push(cfg);return 'confirm';};
  c.run('initializeGame(' + JSON.stringify(map) + ');startScreenEl.classList.contains=()=>true;showModal=async cfg=>answer(cfg);showContinueModal=async cfg=>capture(cfg);' +
    'state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});' +
    'var buyer=state.players[0],seller=state.players[1];buyer.cash=5000;seller.cash=700;state.bankPool=93;' +
    'var target=state.board.find(t=>t.lot&&!t.isLargeSecondary&&' + (large ? 't.lot.isLarge' : '!t.lot.isLarge') + ');' +
    'target.lot.ownerId=seller.id;target.lot.level=2;target.lot.price=201;target.lot.buildCosts=[0,40,70,110];buyer.position=target.index;');
  return { c, events, menus };
}
const grant = (c, card='buyProperty', who='human') => c.run('grantInventoryCard(' + JSON.stringify(who) + ',' + JSON.stringify(card) + ',{type:"municipal"}).instanceId');
const use = (c, id) => c.run('GameCards.use(' + JSON.stringify(id) + ')');
const settle = c => c.run('resolveLanding(buyer,state.board[buyer.position],state.sessionId)');
const nextTurn = c => c.run('endTurn();endTurn()');
async function ready(c, card='buyProperty') {const id=grant(c,card);await settle(c);nextTurn(c);return id;}
(async()=>{
  for(const map of ['classic','compact','expansion','harbor','alpine']) {
    for(const random of [0,.499999,.5,.999999]) await test(map+': city hall grants one random card without changing assets/cash ('+random+')',async()=>{
      const {c,events,menus}=setup(map);const before=money(c);c.Math.random=()=>random;
      c.run('buyer.position=0');await c.run('resolveLanding(buyer,state.board[0],state.sessionId)');
      assert.deepEqual(money(c),before);assert.equal(c.run('target.lot.ownerId'),'ai');assert.equal(c.run('target.lot.level'),2);
      assert.equal(c.run('buyer.cards.length'),1);assert.equal(c.run('buyer.cards[0].cardId'),random<.5?'buyProperty':'sellProperty');
      assert.equal(c.run('buyer.cards[0].source.type'),'municipal');assert.equal(menus.length,0);assert.equal(events.length,1);
    });
    for(const large of [false,true]) await test(map+': settled '+(large?'double':'single')+' property bought at complete cost on next normal turn',async()=>{
      const {c,events,menus}=setup(map,large);if(large)c.run('buyer.position=state.board.find(t=>t.isLargeSecondary&&t.lot===target.lot).index');
      const id=grant(c),initial=money(c);assert.equal((await use(c,id)).ok,false);
      await settle(c);const paid=money(c);assert(paid[0]<initial[0]);assert.equal(paid[1]-initial[1],initial[0]-paid[0]);
      assert.equal((await use(c,id)).ok,false);assert.equal(c.run('buyer.cards.length'),1);
      assert.match(c.run('cardEffectBlock(buyer,CARD_POOL.find(c=>c.id==="buyProperty"))'),/下回合/);
      nextTurn(c);assert.equal((await use(c,id)).ok,true);
      assert.deepEqual(money(c),[paid[0]-311,paid[1]+311,93]);assert.equal(c.run('target.lot.ownerId'),'human');assert.equal(c.run('target.lot.level'),2);
      assert.equal(c.run('buyer.cards.length'),0);assert.equal(menus.at(-1).propertyOffer.action,'municipalBuy');
      assert.equal(menus.at(-1).propertyOffer.tileIndex,c.run('target.index'));assert.equal(menus.at(-1).boardTargets,undefined);
      assert.equal(events.at(-1).drama.type,'buy');assert.equal(events.at(-1).drama.amount,311);assert.equal(events.at(-1).drama.refund,undefined);
      if(large)assert.equal(c.run('state.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===target.index).lot.ownerId'),'human');
      assert.equal((await use(c,id)).ok,false);assert.deepEqual(money(c),[paid[0]-311,paid[1]+311,93]);
    });
    await test(map+': sell card pays old owner full cost; resale keeps architecture and includes its cost',async()=>{
      const {c,events,menus}=setup(map,true);const id=await ready(c,'sellProperty'),before=money(c);
      assert.equal((await use(c,id)).ok,true);assert.deepEqual(money(c),[before[0],before[1]+311,93]);
      assert.equal(c.run('target.lot.ownerId'),null);assert.equal(c.run('target.lot.level'),2);assert.equal(c.run('getLotPurchasePrice(target.lot)'),311);
      assert.equal(menus.at(-1).propertyOffer.action,'municipalSell');assert.equal(events.at(-1).drama.type,'notice');assert.equal(events.at(-1).drama.amount,0);
      c.run('buyer.cash=201');assert.equal(c.run('buyLot(buyer,target,false)'),false);assert.equal(c.run('shouldAiBuy(buyer,target.lot)'),false);
      c.run('buyer.cash=1000');assert.equal(c.run('buyLot(buyer,target,false)'),true);assert.equal(c.run('buyer.cash'),689);assert.equal(c.run('target.lot.level'),2);
    });
  }
  await test('no opponent property still grants a card; stale session grants nothing',async()=>{
    const {c}=setup();c.run('target.lot.ownerId=null;buyer.position=0');const before=money(c);
    await c.run('resolveStartTakeover(buyer,state.sessionId)');assert.deepEqual(money(c),before);assert.equal(c.run('buyer.cards.length'),1);
    c.run('var oldSid=state.sessionId;initializeGame("classic")');await c.run('resolveStartTakeover(buyer,oldSid)');assert.equal(c.run('state.players[0].cards.length'),0);
  });
  await test('normal draws, shops and loadouts cannot supply municipal cards',()=>{
    const {c}=setup();for(let i=0;i<80;i++)assert.equal(c.run('drawInventoryCardOffers().some(c=>c.municipalOnly)||drawItemShopOffers(buyer).some(c=>c.municipalOnly)'),false);
    assert.deepEqual(json(c,'GameCards.applyLoadout("human",["buyProperty"])'),[]);assert.equal(c.run('buyer.cards.length'),0);
  });
  await test('free opening buildings keep the original sale price',()=>{
    const {c}=setup('expansion');c.run('initializeGame("expansion")');assert(c.run('state.openingLots.length')>0);
    assert(c.run('state.openingLots.every(i=>getLotPurchasePrice(state.board[i].lot)===state.board[i].lot.price)'));
  });
  await test('shield is a settled rent visit without charging the visitor',async()=>{
    const {c}=setup();c.run('buyer.effects.shield=true');const before=money(c),id=await ready(c);assert.deepEqual(money(c),before);assert.equal((await use(c,id)).ok,true);
    assert.deepEqual(money(c),[before[0]-311,before[1]+311,93]);
  });
  for(const mutate of ['buyer.cash=0','target.lot.ownerId=null','buyer.position=0','clearPropertySettlement(buyer)','target.lot.level=3','endTurn()','state.gameOver=true']) {
    await test('pending confirmation revalidates '+mutate,async()=>{
      const {c}=setup(),id=await ready(c);let changed;
      c.answer=()=>{c.run(mutate);changed=money(c);return 'confirm';};
      assert.equal((await use(c,id)).ok,false);assert.deepEqual(money(c),changed);assert.equal(c.run('buyer.cards.length'),1);assert.equal(c.run('buyer.cardUsedThisTurn'),false);
    });
  }
  for(const level of [0,1,2,3])await test('level '+level+' purchase includes exactly completed building stages',async()=>{
    const {c}=setup();c.run('target.lot.level='+level);const cost=201+[0,40,110,220][level];
    assert.equal(c.run('getCityTakeoverQuote(target.lot).purchasePrice'),cost);
    const id=await ready(c),before=money(c);assert.equal((await use(c,id)).ok,true);
    assert.deepEqual(money(c),[before[0]-cost,before[1]+cost,93]);assert.equal(c.run('target.lot.level'),level);
  });
  for(const answer of ['cancel','skip',undefined])await test('cancel leaves card and balances intact: '+answer,async()=>{
    const {c}=setup(),id=await ready(c),before=money(c);c.answer=()=>answer;
    assert.equal((await use(c,id)).ok,false);assert.deepEqual(money(c),before);assert.equal(c.run('buyer.cards.length'),1);assert.equal(c.run('buyer.cardUsedThisTurn'),false);
  });
  await test('a restart during confirmation never consumes or transfers in the new match',async()=>{
    const {c}=setup(),id=await ready(c);let release;c.answer=()=>new Promise(resolve=>{release=resolve;});const pending=use(c,id);
    for(let i=0;i<8&&!release;i++)await Promise.resolve();assert.equal(typeof release,'function');
    c.run('initializeGame("harbor")');const before=money(c);release('confirm');assert.equal((await pending).ok,false);assert.deepEqual(money(c),before);assert.equal(c.run('state.players[0].cards.length'),0);
  });
  for(const kind of ['teleport','rewind','swap','walk'])await test(kind+' invalidates the visit even if moved back before next action',async()=>{
    const {c}=setup(),id=await ready(c);c.run('var oldIndex=buyer.position');
    if(kind==='walk')await c.run('animateMovement(buyer,1,state.sessionId,{payStart:false})');
    else await c.run('executeCardEffect(seller,CARD_POOL.find(c=>c.id==='+JSON.stringify(kind)+'),state.sessionId,{target:"opponent"})');
    c.run('buyer.position=oldIndex');assert.equal((await use(c,id)).ok,false);assert.equal(c.run('buyer.cards.length'),1);
  });
  await test('property exchange away and back invalidates its settled visit',async()=>{
    const {c}=setup(),id=await ready(c);c.run('var own=state.board.find(t=>t.lot&&!t.isLargeSecondary&&t!==target);own.lot.ownerId=buyer.id;');
    await c.run('executeCardEffect(buyer,CARD_POOL.find(c=>c.id==="propertySwap"),state.sessionId,{giveIdx:own.index})');
    c.run('target.lot.ownerId=seller.id');assert.equal((await use(c,id)).ok,false);assert.equal(c.run('buyer.propertySettlement'),null);
  });
  await test('another landing within the same normal turn does not mature a card',async()=>{
    const {c}=setup(),id=grant(c);await settle(c);await settle(c);assert.equal(c.run('buyer.completedTurns'),0);assert.equal((await use(c,id)).ok,false);
    nextTurn(c);assert.equal((await use(c,id)).ok,true);
  });
  for(const bonus of ['six','combo'])await test(bonus+' bonus action cannot mature the visit and moving again clears it',async()=>{
    const {c,events}=setup(),id=grant(c);const observed=[];
    c.capture=cfg=>{events.push(cfg);if(cfg.label==='骰6再动')observed.push(json(c,'({turns:buyer.completedTurns,blocked:municipalCardBlock(buyer,CARD_POOL.find(c=>c.id==="buyProperty"))})'));};
    c.run('buyer.position=(target.index-'+(bonus==='six'?6:1)+'+getBoardLength())%getBoardLength();var diceQueue=['+(bonus==='six'?6:1)+',1];animateDiceRoll=async()=>diceQueue.shift();buyer.effects.extraTurn='+(bonus==='combo')+';');
    await c.run('processTurn(buyer)');assert.deepEqual(observed,[{turns:0,blocked:'下回合可使用'}]);
    assert.equal(c.run('buyer.completedTurns'),1);assert.equal(c.run('buyer.propertySettlement'),null);
    c.run('endTurn()');assert.equal((await use(c,id)).ok,false);assert.equal(c.run('buyer.cards.length'),1);
  });
  for(const settleArrival of [false,true])await test('portal '+(settleArrival?'with':'without')+' arrival rent cannot use an old matured visit',async()=>{
    const {c}=setup(),id=await ready(c),before=money(c);c.Math.random=()=>0;
    await c.run('resolveTeleportTile(buyer,state.sessionId,{name:"传送测试",special:{settleArrival:'+settleArrival+'}})');
    assert.equal((await use(c,id)).ok,false);assert.equal(c.run('buyer.cards.length'),1);
    if(settleArrival){assert(money(c)[0]<before[0]);assert.match(c.run('municipalCardBlock(buyer,CARD_POOL.find(c=>c.id==="buyProperty"))'),/下回合/);}
    else {assert.deepEqual(money(c),before);assert.equal(c.run('buyer.propertySettlement'),null);}
    nextTurn(c);assert.equal((await use(c,id)).ok,settleArrival);
  });
  await test('AI follows the same rent-first next-turn rule and local target',async()=>{
    const {c}=setup();c.run('buyer.isAi=true');const id=grant(c),before=money(c);
    await c.run('useAiInventoryCard(buyer)');assert.deepEqual(money(c),before);assert.equal(c.run('buyer.cards.length'),1);
    await settle(c);await c.run('useAiInventoryCard(buyer)');assert.equal(c.run('buyer.cards.length'),1);nextTurn(c);
    const settled=money(c);await c.run('useAiInventoryCard(buyer)');assert.deepEqual(money(c),[settled[0]-311,settled[1]+311,93]);assert.equal(c.run('target.lot.ownerId'),'human');
  });
  console.log('PASS',checks,'municipal card grant, timing, rent, local purchase, resale and cancellation checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
