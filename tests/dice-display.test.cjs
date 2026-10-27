'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {context}=require('../tools/simulation-context.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const json=(c,code)=>JSON.parse(c.run(`JSON.stringify(${code})`));
function fresh(){const c=context(source,135);c.run(`initializeGame('harbor');state.players.forEach(player=>grantInventoryCard(player.id,'boost',{type:'test_fixture'}));startScreenEl.classList.contains=()=>true;resolveLanding=async()=>{};rollDice=()=>2`);return c;}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name)}
(async()=>{
  await test('AI uses its actual double card, then ordinary human waits and rolls exactly one die',async()=>{
    const c=fresh(),frames=[];c.record=()=>frames.push(json(c,'getDiceDisplay()'));
    c.run('state.currentPlayerIndex=1;setAiTurnStatus();render=()=>{renderStatus();record()}');
    await c.run('playAiTurn()');
    assert.equal(c.run('state.players[1].position'),4);assert.equal(c.run('state.players[1].effects.speedBoost'),false);
    assert.equal(c.run('state.players[0].effects.speedBoost'),false);assert.equal(c.run('state.players[0].cards[0].cardId'),'boost');
    const ready=json(c,'getDiceDisplay()');assert.equal(ready.actorId,'human');assert.equal(ready.count,1);assert.equal(ready.stage,'ready');assert.deepEqual(ready.faces,[]);
    assert.equal(c.run('state.lastDice'),null);assert.deepEqual(json(c,'state.lastDiceFaces'),[]);
    assert.equal(c.run('centerDiceEl.dataset.diceActor'),'human');assert(!c.run('centerDiceValueEl.innerHTML').includes('dice-pair'));
    await c.run('playHumanTurn()');assert.equal(c.run('state.players[0].position'),2);
    assert(frames.some(frame=>frame.actorId==='ai'&&frame.stage==='result'&&frame.count===2&&frame.total===4));
    assert(frames.filter(frame=>frame.actorId==='human'&&frame.stage==='rolling').every(frame=>frame.count===1));
  });
  await test('only applying the human double card changes ready display to two blank dice',async()=>{
    const c=fresh();c.run('render=()=>renderStatus();showModal=async()=>"self"');
    assert.equal(c.run('getDiceDisplay().count'),1);
    const id=c.run('state.players[0].cards[0].instanceId');assert.equal((await c.run(`GameCards.use(${JSON.stringify(id)})`)).ok,true);
    assert.equal(c.run('getDiceDisplay().count'),2);assert.deepEqual(json(c,'getDiceDisplay().faces'),[]);
    assert.equal((c.run('centerDiceValueEl.innerHTML').match(/dice-pair-face/g)||[]).length,2);
    assert.equal((c.run('centerDiceValueEl.innerHTML').match(/dice-ready-mark/g)||[]).length,2);
    await c.run('playHumanTurn()');assert.equal(c.run('state.players[0].position'),4);assert.equal(c.run('state.players[0].effects.speedBoost'),false);
  });
  await test('boosting the opponent does not change the current player ready count',async()=>{
    const c=fresh();c.run('render=()=>renderStatus();showModal=async()=>"opponent"');
    const id=c.run('state.players[0].cards[0].instanceId');await c.run(`GameCards.use(${JSON.stringify(id)})`);
    assert.equal(c.run('getDiceDisplay().count'),1);assert.equal(c.run('state.players[1].effects.speedBoost'),true);
    c.run('endTurn()');assert.equal(c.run('getDiceDisplay().count'),2);assert.equal(c.run('getDiceDisplay().actorId'),'ai');
  });
  await test('a bonus action clears a consumed double result before its ordinary single die',async()=>{
    const c=fresh(),frames=[];c.record=()=>frames.push(json(c,'getDiceDisplay()'));
    c.run('state.players[0].effects.speedBoost=true;state.players[0].effects.extraTurn=true;render=()=>record()');
    await c.run('processTurn(state.players[0])');
    assert.equal(c.run('state.players[0].position'),4);assert.equal(c.run('state.extraTurnPending'),true);
    await c.run('playHumanTurn()');
    assert.equal(c.run('state.players[0].position'),6);
    const results=frames.filter(frame=>frame.actorId==='human'&&frame.stage==='result');
    assert(results.some(frame=>frame.count===2&&frame.total===4));assert(results.some(frame=>frame.count===1&&frame.total===2));
    const firstSingle=frames.findIndex(frame=>frame.actorId==='human'&&frame.stage==='rolling'&&frame.count===1);
    assert(firstSingle>0);assert(frames.slice(0,firstSingle).some(frame=>frame.actorId==='human'&&frame.stage==='ready'&&frame.count===1&&frame.faces.length===0));
  });
  await test('rest clears old faces while preserving an unused personal double effect',async()=>{
    const c=fresh();await c.run('animateDiceRoll(state.sessionId,"turn",2)');
    c.run('state.players[0].effects.speedBoost=true;state.players[0].effects.hotSpringRest=true');
    await c.run('processTurn(state.players[0])');assert.equal(c.run('state.currentPlayerIndex'),1);
    assert.equal(c.run('state.players[0].effects.speedBoost'),true);assert.equal(c.run('getDiceDisplay().count'),1);assert.deepEqual(json(c,'getDiceDisplay().faces'),[]);
    c.run('endTurn()');assert.equal(c.run('getDiceDisplay().count'),2);assert.deepEqual(json(c,'getDiceDisplay().faces'),[]);
  });
  await test('bank displays one die in the correct actor color and preserves a pending movement double',async()=>{
    const c=fresh();c.run('state.currentPlayerIndex=1;setAiTurnStatus();state.players[1].effects.speedBoost=true;render=()=>renderStatus()');
    assert.equal(await c.run('animateDiceRoll(state.sessionId,"bank",2)'),2);
    let display=json(c,'getDiceDisplay()');assert.equal(display.purpose,'bank');assert.equal(display.actorId,'ai');assert.equal(display.count,1);assert.deepEqual(display.faces,[2]);
    assert.equal(c.run('state.players[1].effects.speedBoost'),true);assert.equal(c.run('centerDiceEl.dataset.diceActor'),'ai');assert(!c.run('centerDiceValueEl.innerHTML').includes('dice-pair'));
    c.run('setAiTurnStatus()');display=json(c,'getDiceDisplay()');assert.equal(display.purpose,'turn');assert.equal(display.count,2);assert.deepEqual(display.faces,[]);
  });
  await test('old async dice cannot write faces after a turn change or session restart',async()=>{
    for(const change of ['endTurn()','initializeGame("harbor")']){
      const c=fresh();let release;c.pause=()=>new Promise(resolve=>release=resolve);c.run('sleep=()=>pause()');
      const roll=c.run('animateDiceRoll(state.sessionId,"turn",2)');await Promise.resolve();c.run(change);
      const after=json(c,'getDiceDisplay()');release();assert.equal(await roll,null);
      assert.deepEqual(json(c,'getDiceDisplay()'),after);assert.deepEqual(json(c,'state.lastDiceFaces'),[]);assert.equal(c.run('state.lastDice'),null);
    }
  });
  await test('display snapshots cannot mutate actual dice or another actor state',async()=>{
    const c=fresh();await c.run('animateDiceRoll(state.sessionId,"turn",2)');
    c.run('var copy=getDiceDisplay();copy.actorId="ai";copy.faces[0]=6;copy.count=1;state.currentPlayerIndex=1');
    assert.equal(c.run('getDiceDisplay().stage'),'ready');assert.equal(c.run('getDiceDisplay().count'),1);assert.deepEqual(json(c,'getDiceDisplay().faces'),[]);
    assert.equal(c.run('state.diceDisplay.actorId'),'human');assert.deepEqual(json(c,'state.diceDisplay.faces'),[2,2]);
  });
  console.log(`${checks} dice display ownership/lifecycle checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
