'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {context,mulberry32}=require('./simulation-context.cjs');
const {runner}=require('./economy-simulation.cjs');
const {createStore}=require('../progression.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','game.js'),'utf8');
const checks=[];
const maps=['classic','compact','expansion','harbor','alpine'];
async function test(name,work){await work();checks.push(name)}
const json=(c,code)=>JSON.parse(c.run('JSON.stringify('+code+')'));
function withProgression(c){
 const storage=new Map();let sequence=0;
 const store=createStore({getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)});
 c.GameProgression={...store,getProfile:store.read,createRunId:()=>`opening-check-${++sequence}`,resetResult(){}};
 return c;
}
function fresh(map='classic'){
 const c=withProgression(context(source,11)),events=[];c.capture=cfg=>events.push(cfg);
 c.run(`initializeGame('${map}');showContinueModal=async cfg=>capture(cfg);`);
 return{c,events};
}
async function start(map,first,mode='rounds'){
 const h=fresh(map),{c,events}=h,order=[];
 c.run(`selectedMapId='${map}';state.gameMode='${mode}';`);
 c.checkPrompt=cfg=>{order.push(cfg.label);if(cfg.label==='先手决定'){assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),[c.run('getMapEconomy().startCash'),c.run('getMapEconomy().startCash')]);assert.equal(c.run('state.initiativeResolved'),false);return'flip'}return mode};
 c.capture=cfg=>{events.push(cfg);if(cfg.label==='先手决定'){assert.equal(c.run('state.firstPlayerIndex'),first);const expected=[c.run('getMapEconomy().startCash'),c.run('getMapEconomy().startCash')];assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),expected);assert.deepEqual(json(c,'state.players.map(p=>p.cards.map(card=>card.cardId))'),first===0?[[],['boost']]:[['boost'],[]]);assert.equal(c.run('state.openingCompensation.amount'),0)}};
 c.Math.random=()=>first===0?.25:.75;
 c.run('showModal=async cfg=>checkPrompt(cfg);');await c.run('startNewGame()');
 return {...h,order};
}
// Chance tiles now offer item-card shops. Transaction, inventory, AI and
// cancellation coverage lives in tests/item-shop.test.cjs. This script keeps
// real entry, turn accounting, cash and seeded full-game economy checks.
(async()=>{
 for(const map of maps)for(const first of [0,1])await test(`${map} seat${first}: real startNewGame grants only the second player a card before the result display`,async()=>{const {c,events}=await start(map,first);assert.equal(c.run('state.currentPlayerIndex'),first);assert.equal(c.run('state.openingCompensation.playerId'),first===0?'ai':'human');assert.equal(events.find(e=>e.label==='先手决定').message,`${first===0?'对手':'你'}获后手补偿 双骰卡 ×1`);const before=json(c,'state.players.map(p=>({cash:p.cash,cards:p.cards}))');assert.equal(c.run(`settleFirstPlayer(${first===0})`),false);assert.deepEqual(json(c,'state.players.map(p=>({cash:p.cash,cards:p.cards}))'),before);const counts=[0,0];while(!c.run('state.gameOver')){counts[c.run('state.currentPlayerIndex')]++;c.run('endTurn()')}assert.deepEqual(counts,[c.run('getMaxRounds()'),c.run('getMaxRounds()')]);});
 await test('new start after a legacy bankruptcy state uses the map round cap',async()=>{const {c}=await start('expansion',1,'bankruptcy');assert.equal(c.run('state.gameMode'),'rounds');assert.equal(c.run('getMaxRounds()'),40)});
 await test('equal startup cash and unchanged map lap income through actual entry points',async()=>{for(const [map,initial,lap]of [['classic',1600,300],['compact',1000,450],['expansion',2000,450],['harbor',1700,320],['alpine',1900,350]])for(const first of [0,1]){const {c,events}=fresh(map);c.run(`selectedMapId='${map}';showModal=async cfg=>cfg.label==='先手决定'?'flip':'rounds'`);c.Math.random=()=>first===0?.25:.75;await c.run('startNewGame()');assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),[initial,initial]);assert.equal(c.run('state.openingCompensation.amount'),0);if(map!=='harbor')c.run('state.players[0].position=state.board.length-1');await c.run(`animateMovement(state.players[0],${map==='harbor'?40:1},state.sessionId)`);assert.equal(c.run('state.players[0].cash'),initial+lap);assert.equal(events.find(e=>e.label==='市政府补给').drama.amount,lap)}});
 await test('restart while coin prompt awaits cannot pay or select starter in new session',async()=>{const {c}=fresh();let release,ready;const reached=new Promise(resolve=>ready=resolve);c.prompt=cfg=>{if(cfg.label==='先手决定'){ready();return new Promise(resolve=>release=resolve)}return Promise.resolve('rounds')};c.run('showModal=cfg=>prompt(cfg)');const pending=c.run('startNewGame()');await reached;c.run('initializeGame("compact")');const before=json(c,'state.players.map(p=>p.cash)');release('flip');await pending;assert.equal(c.run('state.initiativeResolved'),false);assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),before);assert.equal(c.run('state.openingCompensation'),null)});
 await test('restart during the coin reveal clears the old card and ignores old continuation',async()=>{const {c}=fresh();let release,ready;const reached=new Promise(resolve=>ready=resolve);c.run('showModal=async cfg=>cfg.label==="先手决定"?"flip":"rounds"');c.hold=()=>{ready();return new Promise(resolve=>release=resolve)};c.run('showContinueModal=cfg=>hold()');const pending=c.run('startNewGame()');await reached;assert.equal(c.run('state.initiativeResolved'),true);assert.equal(c.run('state.players.reduce((n,p)=>n+p.cards.length,0)'),1);c.run('initializeGame("classic")');release();await pending;assert.equal(c.run('state.openingCompensation'),null);assert.deepEqual(json(c,'state.players.map(p=>p.cash)'),[1600,1600]);assert.deepEqual(json(c,'state.players.map(p=>p.cards)'),[[],[]])});
 await test('dice extras stay inside one normal turn; relief rest consumes one normal turn',async()=>{const {c}=fresh();c.run('animateDiceRoll=async()=>6;animateMovement=async()=>{};resolveLanding=async()=>{}');await c.run('processTurn(currentPlayer())');assert.equal(c.run('state.currentPlayerIndex'),1);assert.equal(c.run('state.round'),1);await c.run('processTurn(currentPlayer())');assert.equal(c.run('state.round'),2);c.run('currentPlayer().effects.bankruptcyRelief=true');await c.run('processTurn(currentPlayer())');assert.equal(c.run('state.currentPlayerIndex'),1);assert.equal(c.run('state.round'),2)});
 await test('map economy returns independent values and preserves classic defaults',async()=>{const {c}=fresh();assert.equal(c.run('getMapEconomy("classic").startCash'),1600);assert.equal(c.run('getMapEconomy("classic").startBonus'),300);assert.equal(c.run('getMapEconomy("compact").startCash'),1000);assert.equal(c.run('getMapEconomy("expansion").startBonus'),450);c.run('getMapEconomy().startCash=99');assert.equal(c.run('getMapEconomy().startCash'),1600)});
 await test('real-start fast runner repeats exactly and mirrors both starter roles with card compensation',async()=>{for(const map of ['classic','compact','expansion']){const run=runner(source,map);for(const seed of [93101,93102]){const a=await run(seed,0),b=await run(seed,1),again=await run(seed,0);assert.deepEqual(a,again);assert.deepEqual(a.cash,[...b.cash].reverse());assert.equal(a.score,b.score);assert.equal(a.randomCalls,b.randomCalls);assert.deepEqual(a.base,b.base)}}});
 await test('instrumented reused VM matches fresh uninstrumented real-start games and RNG counts',async()=>{for(const map of ['classic','compact','expansion'])for(const first of [0,1]){const seed=94201,c=withProgression(context(source,seed)),random=mulberry32(seed);let forceCoin=false,randomCalls=0;c.coin=()=>{forceCoin=true};c.Math.random=()=>{const value=random();randomCalls++;if(forceCoin){forceCoin=false;return first===0?.25:.75}return value};c.run(`PLAYER_DEFS.forEach(p=>p.isAi=true);selectedMapId='${map}';showModal=async cfg=>{if(cfg.label==='先手决定'){coin();return 'flip'}return 'rounds'}`);await c.run('startNewGame()');const turns=[0,0];while(!c.run('state.gameOver')){turns[c.run('state.currentPlayerIndex')]++;await c.run('playAiTurn()')}const fast=await runner(source,map)(seed,first);assert.deepEqual(fast.cash,json(c,'state.players.map(p=>p.cash)'));assert.deepEqual(fast.base,turns);assert.equal(fast.randomCalls,randomCalls)}});
 console.log('PASS',checks.length,'targeted real-start, turn, cash, session and repeatable economy checks');
})().catch(error=>{console.error(error);process.exitCode=1});
