'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {context}=require('../tools/simulation-context.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const json=(c,code)=>JSON.parse(c.run(`JSON.stringify(${code})`));
function fresh(map='classic'){
 const c=context(source,135);c.run(`initializeGame('${map}');startScreenEl.classList.contains=()=>true;var human=state.players[0],ai=state.players[1];showModal=async()=> 'self';`);return c;
}
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
(async()=>{
 await test('chosen face never samples a random die, ignores double count, and bank stays random',async()=>{
  const c=fresh();c.run('rollDice=()=>{throw Error("Fixed dice must not sample RNG")};human.effects.fixedDiceFace=6;');
  assert.equal(await c.run('animateDiceRoll(state.sessionId,"turn",2,human,6)'),6);
  assert.deepEqual(json(c,'state.lastDiceFaces'),[6]);assert.equal(c.run('state.diceDisplay.fixed'),true);
  assert.equal(c.run('state.statusDescription'),'');
  c.run('rollDice=()=>3;resetDiceDisplay()');
  assert.equal(await c.run('animateDiceRoll(state.sessionId,"bank",2,human,6)'),3);
  assert.equal(c.run('human.effects.fixedDiceFace'),6);
 });
 await test('fixed die obeys slow and reversed harbor route and resolves exactly one landing',async()=>{
  const c=fresh('harbor');let landings=0;c.land=()=>landings++;
  c.run('human.effects.fixedDiceFace=5;human.effects.speedSlow=true;human.effects.reversed=true;var expected=previewMovement(human,3).index;rollDice=()=>{throw Error("unexpected random roll")};resolveLanding=async()=>land();');
  await c.run('playHumanTurn()');
  assert.equal(c.run('human.position'),c.run('expected'));assert.equal(landings,1);
  assert.equal(c.run('human.effects.fixedDiceFace'),null);assert.equal(c.run('human.effects.speedSlow'),false);
  assert.equal(c.run('state.currentPlayerIndex'),1);
 });
 await test('a fixed die survives a forced rest and freeze without being spent',async()=>{
  for(const effect of ['hotSpringRest','bankruptcyRelief','frozen']){
   const c=fresh();c.run(`human.effects.fixedDiceFace=4;human.effects.${effect}=true;resolveLanding=async()=>{};rollDice=()=>{throw Error('rest must not roll')};`);
   await c.run('playHumanTurn()');assert.equal(c.run('human.effects.fixedDiceFace'),4);
   c.run('endTurn()');await c.run('playHumanTurn()');assert.equal(c.run('human.position'),4);assert.equal(c.run('human.effects.fixedDiceFace'),null);
  }
 });
 await test('motorcycle preference persists, produces independent faces, and never spends a boost',async()=>{
  const c=fresh();c.run('human.vehicle="motorcycle";resolveLanding=async()=>{};');
  assert.equal(c.run('GameVehicle.setDiceCount(2)'),true);
  let i=0;c.nextFace=()=>[1,4][i++%2];c.run('rollDice=()=>nextFace()');
  await c.run('playHumanTurn()');assert.equal(c.run('human.position'),5);assert.equal(c.run('human.vehicleDiceCount'),2);
  c.run('endTurn()');assert.equal(c.run('getDiceDisplay().count'),2);
  assert.equal(c.run('GameVehicle.setDiceCount(1)'),true);c.run('rollDice=()=>2');
  await c.run('playHumanTurn()');assert.equal(c.run('human.position'),7);assert.equal(c.run('human.vehicle'),'motorcycle');assert.equal(c.run('human.vehicleDiceCount'),1);
 });
 await test('vehicle selector cannot mutate another turn, a pending modal, or a forced dice result',()=>{
  const c=fresh();assert.equal(c.run('GameVehicle.setDiceCount(2)'),false);
  c.run('human.vehicle="motorcycle";state.currentPlayerIndex=1');assert.equal(c.run('GameVehicle.setDiceCount(2)'),false);
  c.run('state.currentPlayerIndex=0;state.modal.visible=true');assert.equal(c.run('GameVehicle.setDiceCount(2)'),false);
  c.run('state.modal.visible=false;human.effects.fixedDiceFace=3');assert.equal(c.run('GameVehicle.setDiceCount(2)'),false);
  assert.equal(c.run('GameVehicle.setDiceCount(1)'),true);
  c.run('human.effects.fixedDiceFace=null;human.effects.speedBoost=true');assert.equal(c.run('GameVehicle.setDiceCount(1)'),false);assert.equal(c.run('getDiceDisplay().count'),2);
  c.run('human.effects.speedBoost=false;state.busy=true');assert.equal(c.run('GameVehicle.setDiceCount(2)'),false);
 });
 await test('launch and current double choice are mutually exclusive without consuming a rejected card',async()=>{
  for(const setup of ['human.effects.speedBoost=true','human.vehicle="motorcycle";human.vehicleDiceCount=2']){
   const c=fresh();c.run(`${setup};grantInventoryCard('human','launch');showModal=async()=> '6';`);
   const rejected=await c.run('GameCards.use("launch")');assert.equal(rejected.ok,false);assert.equal(c.run('human.cards.length'),1);
   c.run('human.effects.speedBoost=false;human.vehicleDiceCount=1');
   assert.equal((await c.run('GameCards.use("launch")')).ok,true);assert.equal(c.run('human.effects.fixedDiceFace'),6);assert.equal(c.run('getDiceDisplay().count'),1);
  }
 });
 await test('boost preserves opponent targeting but cannot replace a chosen die or waste itself on own motorcycle',async()=>{
  const c=fresh();c.run('human.vehicle="motorcycle";grantInventoryCard("human","boost");showModal=async()=>"self";');
  assert.equal((await c.run('GameCards.use("boost")')).ok,false);assert.equal(c.run('human.cards.length'),1);
  c.run('showModal=async()=>"opponent";ai.vehicle="motorcycle";ai.vehicleDiceCount=1;');
  assert.equal((await c.run('GameCards.use("boost")')).ok,true);assert.equal(c.run('ai.effects.speedBoost'),true);
  c.run('endTurn();resolveLanding=async()=>{};rollDice=()=>2');await c.run('processTurn(ai)');
  assert.equal(c.run('ai.position'),4);assert.equal(c.run('ai.effects.speedBoost'),false);assert.equal(c.run('ai.vehicleDiceCount'),1);
  c.run('human.cardUsedThisTurn=false;ai.effects.fixedDiceFace=4;grantInventoryCard("human","boost")');
  assert.equal((await c.run('GameCards.use("boost")')).ok,false);assert.equal(c.run('ai.effects.fixedDiceFace'),4);
 });
 await test('AI motorcycle selection evaluates both distributions and honors fixed die override',async()=>{
  const c=fresh();c.run('state.currentPlayerIndex=1;ai.vehicle="motorcycle";state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;t.lot.price=99999;}});');
  assert([1,2].includes(c.run('chooseAiVehicleDiceCount(ai)')));
  c.run('ai.effects.fixedDiceFace=4;ai.vehicleDiceCount=2;rollDice=()=>{throw Error("AI chosen die must not roll")};resolveLanding=async()=>{};');
  await c.run('processTurn(ai)');assert.equal(c.run('ai.position'),4);assert.equal(c.run('ai.effects.fixedDiceFace'),null);
 });
 console.log(`${checks} fixed dice / motorcycle lifecycle checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
