'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {context}=require('../tools/simulation-context.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const fresh=(map='classic')=>{const c=context(source,135);c.run(`initializeGame('${map}');startScreenEl.classList.contains=()=>true`);return c};
const json=(c,code)=>JSON.parse(c.run(`JSON.stringify(${code})`));
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name)};
(async()=>{
  await test('double dice samples two independent faces once, renders both, and returns their sum',async()=>{
    const c=fresh(),frames=[];let i=0;c.nextFace=()=>[1,6,2,5,3,4][i++%6];c.capture=()=>frames.push(json(c,'({faces:state.lastDiceFaces,total:state.lastDice})'));
    c.run('rollDice=()=>nextFace();render=()=>capture()');
    assert.equal(await c.run('animateDiceRoll(state.sessionId,"turn",2)'),7);
    assert.deepEqual(json(c,'state.lastDiceFaces'),[1,6]);assert.equal(c.run('state.lastDice'),7);
    assert.equal(i,22);assert(frames.filter(f=>f.faces.length).every(f=>f.faces.length===2&&f.total===f.faces[0]+f.faces[1]));
  });
  await test('double six-total has no single-die-six extra turn; slow halves the summed result',async()=>{
    for(const slow of [false,true]){
      const c=fresh();c.run(`state.players[0].effects.speedBoost=true;state.players[0].effects.speedSlow=${slow};rollDice=()=>3;resolveLanding=async()=>{}`);
      await c.run('playHumanTurn()');
      assert.equal(c.run('state.players[0].position'),slow?3:6);assert.equal(c.run('state.currentPlayerIndex'),1);
      assert.equal(c.run('state.players[0].effects.speedBoost'),false);assert.equal(c.run('state.players[0].effects.speedSlow'),false);
    }
  });
  await test('ordinary six still grants its existing extra action',async()=>{
    const c=fresh();let i=0;c.nextFace=()=>i++<11?6:2;c.run('rollDice=()=>nextFace();resolveLanding=async()=>{}');
    await c.run('playHumanTurn()');assert.equal(c.run('state.players[0].position'),8);assert.equal(c.run('state.currentPlayerIndex'),1);
  });
  await test('bank dice stays a single die and cannot consume the next movement double',async()=>{
    const c=fresh();c.run('state.players[0].effects.speedBoost=true;rollDice=()=>4');
    assert.equal(await c.run('animateDiceRoll(state.sessionId,"bank",2)'),4);
    assert.deepEqual(json(c,'state.lastDiceFaces'),[4]);assert.equal(c.run('state.players[0].effects.speedBoost'),true);
  });
  await test('harbor waits for initiative before granting cards and always stocks one double-dice card in shops',()=>{
    const c=fresh('harbor');assert.deepEqual(json(c,'state.players.map(p=>p.cards.map(c=>c.cardId))'),[[],[]]);
    assert.deepEqual(json(c,'state.players.map(p=>p.effects.speedBoost)'),[false,false]);
    for(let i=0;i<100;i++){const offers=json(c,'drawItemShopOffers()');assert.equal(offers.length,3);assert.equal(offers.filter(c=>c.id==='boost').length,1);assert.equal(new Set(offers.map(c=>c.id)).size,3)}
    c.run('initializeGame("classic")');assert.deepEqual(json(c,'state.players.map(p=>p.cards.length)'),[0,0]);
  });
  await test('harbor card rewards increase double-dice availability without duplicate offers',()=>{
    const c=fresh('harbor');let count=0;
    for(let i=0;i<1000;i++){const cards=json(c,'drawInventoryCardOffers()');assert.equal(new Set(cards.map(c=>c.id)).size,3);count+=cards.some(c=>c.id==='boost')}
    assert(count>450&&count<650,`offered ${count}/1000`);
  });
  console.log(`${checks} double-dice and harbor card supply checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
