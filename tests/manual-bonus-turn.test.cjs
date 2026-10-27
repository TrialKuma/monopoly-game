'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {context} = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, expression) => JSON.parse(c.run(`JSON.stringify(${expression})`));
function fresh(map = 'classic') {
  const c = context(source, 135), notices = [];
  c.notice = cfg => notices.push(cfg);
  c.run(`initializeGame('${map}');startScreenEl.classList.contains=()=>true;
    var human=state.players[0],ai=state.players[1];
    resolveLanding=async()=>{};rollDice=()=>6;showContinueModal=async cfg=>notice(cfg);
    render=()=>{renderStatus();updateControls()};showModal=async()=> 'self';`);
  return {c, notices};
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await test('all maps stop after a natural six with a usable bag and reward-roll button', async () => {
    for (const map of ['classic','compact','expansion','harbor','alpine']) {
      const {c, notices} = fresh(map);
      c.run('human.cardUsedThisTurn=true;grantInventoryCard("human","shield")');
      await c.run('playHumanTurn()');
      assert.deepEqual(json(c, '({pending:state.extraTurnPending,index:state.currentPlayerIndex,busy:state.busy,phase:state.phase,round:state.round,turns:human.completedTurns})'),
        {pending:true,index:0,busy:false,phase:'await_roll',round:1,turns:0});
      assert.equal(c.run('rollBtn.textContent'), '掷奖励骰'); assert.equal(c.run('rollBtn.disabled'), false);
      assert.equal(c.run('state.statusTitle'), '奖励行动'); assert.equal(c.run('GameCards.getSnapshot().canUse'), true);
      assert.equal(c.run('human.cardUsedThisTurn'), false); assert.equal(notices.length, 0, 'no blocking bonus dialog');
      assert.deepEqual(json(c, 'getDiceDisplay().faces'), []);
    }
  });
  await test('second natural six does not chain and counts one normal turn only after confirmation', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()'); const first = c.run('human.position');
    await Promise.resolve(); assert.equal(c.run('human.position'), first, 'no asynchronous auto-roll remains');
    await c.run('playHumanTurn()');
    assert.equal(c.run('human.position'), 12); assert.equal(c.run('human.completedTurns'), 1);
    assert.equal(c.run('state.currentPlayerIndex'), 1); assert.equal(c.run('state.extraTurnPending'), false);
    assert.equal(c.run('rollBtn.textContent'), '掷骰子'); assert.equal(c.run('state.round'), 1);
  });
  await test('reward action allows one double card, then throws two independent dice on click', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()');
    c.run('grantInventoryCard("human","boost");grantInventoryCard("human","shield")');
    assert.equal((await c.run('GameCards.use("boost")')).ok, true);
    assert.equal((await c.run('GameCards.use("shield")')).ok, false);
    assert.equal(c.run('state.extraTurnPending'), true); assert.equal(c.run('getDiceDisplay().count'), 2);
    let i = 0; c.nextFace = () => [2,5][i++ % 2]; c.run('rollDice=()=>nextFace()');
    await c.run('playHumanTurn()');
    assert.equal(c.run('human.position'), 13); assert.equal(c.run('human.effects.speedBoost'), false);
    assert.equal(c.run('human.completedTurns'), 1); assert.equal(c.run('state.currentPlayerIndex'), 1);
  });
  await test('reward action can replace its roll with a chosen face and still rejects double coexistence', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()');
    c.run('grantInventoryCard("human","launch");human.effects.speedBoost=true');
    assert.equal((await c.run('GameCards.use("launch")')).ok, false);
    c.run('human.effects.speedBoost=false;showModal=async()=>"6"');
    assert.equal((await c.run('GameCards.use("launch")')).ok, true);
    assert.equal(c.run('state.extraTurnPending'), true); assert.equal(c.run('getDiceDisplay().count'), 1);
    c.run('rollDice=()=>{throw Error("Chosen reward die must not sample a random result")}');
    await c.run('playHumanTurn()');
    assert.equal(c.run('human.position'), 12); assert.equal(c.run('human.effects.fixedDiceFace'), null);
    assert.equal(c.run('state.currentPlayerIndex'), 1); assert.equal(c.run('state.extraTurnPending'), false);
  });
  await test('motorcycle remains selectable before a reward roll', async () => {
    const {c} = fresh(); c.run('human.vehicle="motorcycle";human.vehicleDiceCount=1');
    await c.run('playHumanTurn()'); assert.equal(c.run('GameVehicle.getSnapshot().canChoose'), true);
    assert.equal(c.run('GameVehicle.setDiceCount(2)'), true); c.run('rollDice=()=>3');
    await c.run('playHumanTurn()'); assert.equal(c.run('human.position'), 12);
    assert.equal(c.run('human.vehicleDiceCount'), 2); assert.equal(c.run('human.completedTurns'), 1);
  });
  await test('AI natural-six reward stays automatic with no human pending state', async () => {
    const {c} = fresh(); c.run('state.currentPlayerIndex=1;setAiTurnStatus()'); await c.run('playAiTurn()');
    assert.equal(c.run('ai.position'), 12); assert.equal(c.run('ai.completedTurns'), 1);
    assert.equal(c.run('state.currentPlayerIndex'), 0); assert.equal(c.run('state.extraTurnPending'), false);
  });
  await test('a double click starts the pending reward once and cannot create an extra normal action', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()'); let completeRoll, calls = 0;
    c.holdRoll = () => { calls++; return new Promise(resolve => { completeRoll = resolve; }); };
    c.run('animateDiceRoll=()=>holdRoll()');
    const firstClick = c.run('playHumanTurn()'); await c.run('playHumanTurn()');
    assert.equal(calls, 1); assert.equal(c.run('state.extraTurnPending'), false);
    assert.equal(c.run('state.busy'), true); completeRoll(6); await firstClick;
    assert.equal(c.run('human.position'), 12); assert.equal(c.run('human.completedTurns'), 1);
    assert.equal(c.run('state.currentPlayerIndex'), 1);
  });
  await test('final-round reward resolves before the normal round-limit settlement', async () => {
    const {c} = fresh(); c.run('state.firstPlayerIndex=1;state.round=getMaxRounds()');
    await c.run('playHumanTurn()'); assert.equal(c.run('state.gameOver'), false);
    assert.equal(c.run('state.round'), c.run('getMaxRounds()'));
    await c.run('playHumanTurn()'); assert.equal(c.run('state.gameOver'), true);
    assert.equal(c.run('human.completedTurns'), 1); assert.equal(c.run('state.extraTurnPending'), false);
  });
  await test('cancelled card and cancelled home dialog preserve the pending reward', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()');
    c.run('grantInventoryCard("human","boost");showModal=async()=>"cancel"');
    assert.equal((await c.run('GameCards.use("boost")')).cancelled, true);
    c.run('state.ticketPaid=true'); await c.run('returnToStartScreen()');
    assert.equal(c.run('state.extraTurnPending'), true); assert.equal(c.run('state.phase'), 'await_roll');
    assert.equal(c.run('GameCards.getSnapshot().canUse'), true); assert.equal(c.run('human.cards.length'), 1);
    assert.equal(c.run('rollBtn.textContent'), '掷奖励骰');
  });
  await test('restart and game end discard pending reward and old async completion cannot restore it', async () => {
    const {c} = fresh(); await c.run('playHumanTurn()'); c.run('initializeGame("harbor")');
    assert.equal(c.run('state.extraTurnPending'), false);
    await c.run('playHumanTurn()'); c.run('finishGame("bankruptcy")');
    assert.equal(c.run('state.extraTurnPending'), false); const position = c.run('state.players[0].position');
    await c.run('playHumanTurn()'); assert.equal(c.run('state.players[0].position'), position);
    c.run('initializeGame("classic")'); let finishLanding;
    c.holdLanding = () => new Promise(resolve => { finishLanding = resolve; }); c.run('resolveLanding=()=>holdLanding()');
    const old = c.run('playHumanTurn()');
    for (let i = 0; i < 80 && !finishLanding; i++) await Promise.resolve();
    assert.ok(finishLanding); c.run('initializeGame("compact")'); finishLanding(); await old;
    assert.equal(c.run('state.extraTurnPending'), false); assert.equal(c.run('state.currentMapId'), 'compact');
    assert.equal(c.run('state.players[0].position'), 0);
  });
  console.log(`${checks} manual reward-action lifecycle checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
