'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {context}=require('../tools/simulation-context.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const json=(c,code)=>JSON.parse(c.run(`JSON.stringify(${code})`));
function fresh(actor=0){const c=context(source,912);c.run(`initializeGame('harbor');state.currentPlayerIndex=${actor};state.players.forEach(p=>p.cards=[]);var actor=currentPlayer();`);return c;}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name)}
(async()=>{
  await test('the central corridor alternates three buildable deeds with a functional stop in both directions',()=>{
    const c=fresh(),board=json(c,'state.board'),nav=json(c,'getMapNavigation()');
    const countRuns=route=>{const runs=[];let deeds=[];for(const index of route){const t=board[index];if(t.lot&&!t.isLargeSecondary)deeds.push(index);else if(!t.isLargeSecondary){if(deeds.length)runs.push(deeds);deeds=[];}}if(deeds.length)runs.push(deeds);return runs;};
    assert.deepEqual(countRuns(nav.shared),[[29,30,32],[1,2,4],[6,7,9]]);
    assert.deepEqual(countRuns(nav.shared.toReversed()),[[9,7,6],[4,2,1],[32,30,29]]);
    for(const [index,type,name] of [[5,'construction','主港建设局'],[10,'card_draw','主港补给站'],[33,'chance','主港道具商店']]){
      assert.equal(board[index].special.type,type);assert.equal(board[index].name,name);assert.equal(board[index].lot,null);
      assert.equal(c.run(`Object.hasOwn(HARBOR_LOT_CONFIGS,${index})||Object.hasOwn(HARBOR_DISTRICT_CONFIG,${index})`),false);
    }
    assert.equal(board.filter(t=>t.lot&&!t.isLargeSecondary).length,13);
    assert.equal(new Set(board.filter(t=>t.lot).map(t=>t.lot.landmarkKey||t.lot.theme.key)).size,7);
    assert.equal(nav.cycle.length,70);assert.equal(c.run('getMaxRounds()'),40);
  });
  await test('either player landing at the central construction bureau upgrades its building for free',async()=>{
    for(const actor of [0,1]){
      const c=fresh(actor);c.run(`actor.position=5;state.board[2].lot.ownerId=actor.id;state.board[2].lot.level=1;showModal=async()=>"build"`);
      const before=json(c,'state.players.map(p=>p.cash)');await c.run('resolveLanding(actor,state.board[5],state.sessionId)');
      assert.equal(c.run('state.board[2].lot.level'),2);assert.equal(c.run('state.board[3].lot.level'),2);
      assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),before);
    }
  });
  await test('either player can demolish a rival large building one level at the bureau',async()=>{
    for(const actor of [0,1]){
      const c=fresh(actor);c.run(`actor.position=5;state.board[30].lot.ownerId=getOpponent(actor).id;state.board[30].lot.level=3;showModal=async()=>"demolish"`);
      const before=json(c,'state.players.map(p=>p.cash)');await c.run('resolveLanding(actor,state.board[5],state.sessionId)');
      assert.equal(c.run('state.board[30].lot.level'),2);assert.equal(c.run('state.board[31].lot.level'),2);
      assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),before);
    }
  });
  await test('only the central supply station guarantees a unique optional boost among its three cards',()=>{
    const c=fresh();
    for(let n=0;n<200;n++){
      const offers=json(c,'drawInventoryCardOffers(state.board[10])');
      assert.equal(offers.length,3);assert.equal(offers.filter(card=>card.id==='boost').length,1);assert.equal(new Set(offers.map(card=>card.id)).size,3);
    }
    let outer=0,forged=0;
    for(let n=0;n<500;n++){
      outer+=json(c,'drawInventoryCardOffers(state.board[18])').some(card=>card.id==='boost');
      forged+=json(c,'drawInventoryCardOffers({...state.board[10]})').some(card=>card.id==='boost');
    }
    assert(outer>200&&outer<350,`outer boost frequency ${outer}/500`);
    assert(forged>200&&forged<350,`copied tile must not gain guarantee ${forged}/500`);
  });
  await test('real supply-station landings put the chosen double die in either bag without activating it',async()=>{
    for(const actor of [0,1]){
      const c=fresh(actor),dialogs=[];c.capture=cfg=>{dialogs.push(cfg);return 'boost';};c.Math.random=()=>0;
      c.run('actor.position=10;showModal=async cfg=>capture(cfg)');const cash=c.run('actor.cash');
      await c.run('resolveLanding(actor,state.board[10],state.sessionId)');
      assert.equal(c.run('actor.cards.length'),1);assert.equal(c.run('actor.cards[0].cardId'),'boost');
      assert.equal(c.run('actor.cards[0].source.tileIndex'),10);assert.equal(c.run('actor.effects.speedBoost'),false);assert.equal(c.run('actor.cash'),cash);
      if(actor===0){assert.equal(dialogs[0].cardDraw,true);assert.equal(dialogs[0].buttons.length,3);assert(dialogs[0].buttons.some(b=>b.id==='boost'));}
    }
  });
  await test('supply cards remain selectable rather than forcing the guaranteed double die',async()=>{
    const c=fresh();let chosen;c.choose=cfg=>{chosen=cfg.buttons.find(b=>b.id!=='boost').id;return chosen;};
    c.run('actor.position=10;showModal=async cfg=>choose(cfg)');await c.run('resolveLanding(actor,state.board[10],state.sessionId)');
    assert.equal(c.run('actor.cards[0].cardId'),chosen);assert.notEqual(chosen,'boost');assert.equal(c.run('actor.effects.speedBoost'),false);
  });
  await test('either player can buy one double-dice card at the central shop with the normal price',async()=>{
    for(const actor of [0,1]){
      const c=fresh(actor);c.Math.random=()=>0;c.run('actor.position=33;actor.cash=270;showModal=async()=>"boost"');
      await c.run('resolveLanding(actor,state.board[33],state.sessionId)');
      assert.equal(c.run('actor.cash'),150);assert.equal(c.run('actor.cards.length'),1);assert.equal(c.run('actor.cards[0].cardId'),'boost');
      assert.equal(c.run('actor.cards[0].source.tileIndex'),33);assert.equal(c.run('actor.effects.speedBoost'),false);
    }
  });
  console.log(`${checks} harbor central gameplay checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
