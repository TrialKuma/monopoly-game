'use strict';
// Exercise the production bag, real effects and landing resolver with inert UI/clocks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { context } = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
function setup(map = 'classic') {
  const c = context(source, 81), events = [], choices = [];
  c.record = cfg => events.push(cfg);
  c.choose = cfg => { choices.push(cfg); return 'cancel'; };
  c.run(`initializeGame('${map}'); startScreenEl.classList.contains=()=>true;
    showContinueModal=async cfg=>record(cfg);showModal=async cfg=>choose(cfg);
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});`);
  return { c, events, choices };
}
function grant(c, id, player = 'human') { return c.run(`GameCards.grant('${player}','${id}',{type:'test'}).instanceId`); }
const use = (c, id) => c.run(`GameCards.use(${JSON.stringify(id)})`);
(async () => {
  await test('human draw stores a selected reward without applying it', async () => {
    const { c, choices } = setup();
    c.choose = cfg => { choices.push(cfg); return 'shield'; };
    c.run(`CARD_POOL.splice(0,CARD_POOL.length,CARD_POOL.find(c=>c.id==='shield'))`);
    await c.run('resolveCardDraw(state.players[0],state.sessionId)');
    assert.equal(c.run('state.players[0].effects.shield'), false);
    const bag = json(c, 'GameCards.getSnapshot()');
    assert.equal(bag.count, 1); assert.equal(bag.cards[0].id, 'shield');
    assert.equal(bag.cards[0].source.type, 'tile');
    assert.equal(choices[0].cardDraw, true);
  });
  await test('AI draw also stores its chosen reward for a later turn', async () => {
    const { c } = setup();
    c.run(`CARD_POOL.splice(0,CARD_POOL.length,CARD_POOL.find(c=>c.id==='boost'))`);
    await c.run('resolveCardDraw(state.players[1],state.sessionId)');
    assert.equal(c.run('state.players[1].effects.speedBoost'), false);
    assert.equal(c.run('state.players[1].cards[0].cardId'), 'boost');
    assert.equal(c.run('GameCards.getSnapshot().opponentCount'), 1);
  });
  await test('duplicates are physical cards, and spending one does not remove the other', async () => {
    const { c } = setup(); const first = grant(c, 'shield'), second = grant(c, 'shield');
    assert.notEqual(first, second); assert.equal((await use(c, first)).ok, true);
    assert.deepEqual(json(c, 'state.players[0].cards.map(c=>c.instanceId)'), [second]);
    assert.equal(c.run('state.players[0].effects.shield'), true);
    assert.equal(c.run('state.phase'), 'await_roll'); assert.equal(c.run('state.currentPlayerIndex'), 0);
  });
  await test('one use per normal turn, with allowance restored on the next normal turn', async () => {
    const { c } = setup(); const shield = grant(c, 'shield'), combo = grant(c, 'combo');
    await use(c, shield); assert.equal((await use(c, combo)).ok, false);
    assert.equal(c.run('GameCards.getSnapshot().usedThisTurn'), true);
    c.run('endTurn();endTurn()'); assert.equal(c.run('GameCards.getSnapshot().usedThisTurn'), false);
    assert.equal((await use(c, combo)).ok, true);
  });
  await test('invalid swap is retained and cannot create compensation cash', async () => {
    const { c } = setup(); const id = grant(c, 'propertySwap'); const cash = c.run('state.players[0].cash');
    const result = await use(c, id); assert.equal(result.ok, false); assert.match(result.reason, /没有/);
    assert.equal(c.run('state.players[0].cash'), cash); assert.equal(c.run('GameCards.getSnapshot().count'), 1);
    assert.equal(c.run('GameCards.getSnapshot().usedThisTurn'), false);
  });
  for (const [card, effect] of [['shield', 'shield'], ['combo', 'extraTurn'], ['doubleRent', 'doubleRent']]) {
    await test(`${card} does not waste a second active buff`, async () => {
      const { c } = setup(); const id = grant(c, card);
      c.run(`state.board.find(t=>t.lot).lot.ownerId='human';state.players[0].effects.${effect}=true`);
      assert.equal((await use(c, id)).ok, false); assert.equal(c.run('GameCards.getSnapshot().count'), 1);
    });
  }
  for (const card of ['teleport', 'boost', 'slow', 'rewind', 'reverse', 'launch', 'propertySwap']) {
    await test(`${card} cancel retains both the card and turn allowance`, async () => {
      const { c } = setup(); const id = grant(c, card);
      c.run(`var lots=state.board.filter(t=>t.lot&&!t.isLargeSecondary);lots[0].lot.ownerId='human';lots[1].lot.ownerId='ai';`);
      const result = await use(c, id);
      assert.equal(result.ok, false); assert.equal(result.cancelled, true);
      assert.equal(c.run('GameCards.getSnapshot().count'), 1); assert.equal(c.run('GameCards.getSnapshot().usedThisTurn'), false);
      assert.equal(c.run('state.phase'), 'await_roll'); assert.equal(c.run('state.targetSelection'), false);
    });
  }
  await test('an invalid target choice does not silently target the opponent', async () => {
    const { c } = setup(); const id = grant(c, 'boost'); c.choose = () => 'bogus';
    await use(c, id); assert.equal(c.run('state.players[1].effects.speedBoost'), false);
    assert.equal(c.run('GameCards.getSnapshot().count'), 1);
  });
  await test('an already boosted chosen target keeps the card', async () => {
    const { c } = setup(); const id = grant(c, 'boost'); c.choose = () => 'self';
    c.run('state.players[0].effects.speedBoost=true');
    assert.equal((await use(c, id)).ok, false); assert.equal(c.run('GameCards.getSnapshot().count'), 1);
  });
  await test('double clicking while target selection waits cannot consume twice', async () => {
    const { c } = setup(); const first = grant(c, 'boost'), second = grant(c, 'shield');
    let release; c.choose = () => new Promise(resolve => { release = resolve; });
    const pending = use(c, first); await Promise.resolve();
    assert.equal((await use(c, second)).ok, false); release('self'); await pending;
    assert.equal(c.run('state.players[0].effects.speedBoost'), true);
    assert.deepEqual(json(c, 'state.players[0].cards.map(c=>c.instanceId)'), [second]);
  });
  await test('restart while choosing cannot change or unlock the new session', async () => {
    const { c } = setup(); const id = grant(c, 'boost');
    let release; c.choose = () => new Promise(resolve => { release = resolve; });
    const pending = use(c, id); await Promise.resolve(); c.run('initializeGame("compact");state.phase="locked";state.busy=true');
    release('self'); await pending;
    assert.equal(c.run('state.currentMapId'), 'compact'); assert.equal(c.run('state.phase'), 'locked');
    assert.equal(c.run('state.players[0].effects.speedBoost'), false); assert.equal(c.run('GameCards.getSnapshot().count'), 0);
  });
  await test('restart during a committed effect does not leak into the new match', async () => {
    const { c } = setup(); const id = grant(c, 'shield');
    let release; c.record = () => new Promise(resolve => { release = resolve; });
    c.run('showContinueModal=cfg=>record(cfg)'); const pending = use(c, id);
    await Promise.resolve(); await Promise.resolve(); c.run('initializeGame("harbor");state.phase="locked"');
    release(); await pending;
    assert.equal(c.run('state.players[0].effects.shield'), false); assert.equal(c.run('state.cardUsePending'), false);
    assert.equal(c.run('state.phase'), 'locked');
  });
  await test('launch resolves a real card tile once and stores its reward without recursion', async () => {
    const { c } = setup(); const id = grant(c, 'launch');
    c.run(`var draw=state.board.find(t=>t.special?.type==='card_draw');state.players[0].position=draw.index-1;`);
    c.choose = cfg => cfg.cardDraw ? cfg.buttons[0].id : '1';
    const result = await use(c, id); assert.equal(result.ok, true);
    assert.equal(c.run('state.players[0].position'), c.run('draw.index'));
    assert.equal(c.run('GameCards.getSnapshot().count'), 1); assert.equal(c.run('state.phase'), 'await_roll');
    assert.equal(c.run('state.currentPlayerIndex'), 0);
  });
  await test('launch can collect start salary but does not take the normal dice action', async () => {
    const { c } = setup(); const id = grant(c, 'launch'); c.choose = () => '1';
    c.run('state.players[0].position=state.board.length-1;resolveStartTakeover=async()=>{}');
    const cash = c.run('state.players[0].cash'); await use(c, id);
    assert.equal(c.run('state.players[0].cash'), cash + c.run('getMapEconomy().startBonus'));
    assert.equal(c.run('state.players[0].position'), 0); assert.equal(c.run('state.phase'), 'await_roll');
  });
  for (const [name, cash, effect] of [['onsen', 5000, 'hotSpringRest'], ['relief', 1, 'bankruptcyRelief']]) {
    await test(`launch landing on ${name} preserves the dice action and queues exactly one rest`, async () => {
      const { c } = setup(); const id = grant(c, 'launch'); c.choose = () => '1';
      c.run(`var spa=state.board.find(t=>t.lot?.effectId==='hot_spring_rest'&&!t.isLargeSecondary);
        spa.lot.ownerId='ai';spa.lot.level=1;state.players[0].position=spa.index-1;state.players[0].cash=${cash};`);
      await use(c, id); assert.equal(c.run(`state.players[0].effects.${effect}`), true);
      const start = c.run('state.players[0].position');
      c.run('animateDiceRoll=async()=>2;resolveLanding=async()=>{}'); await c.run('playHumanTurn()');
      assert.equal(c.run('state.players[0].position'), start + 2);
      assert.equal(c.run(`state.players[0].effects.${effect}`), true);
      c.run('endTurn();animateDiceRoll=async()=>{throw Error("Queued rest must not roll")};');
      await c.run('playHumanTurn()'); assert.equal(c.run(`state.players[0].effects.${effect}`), false);
      assert.equal(c.run('state.currentPlayerIndex'), 1);
    });
  }
  for (const card of ['teleport', 'rewind', 'swap']) {
    await test(`${card} preserves its no-landing-charge relocation rule`, async () => {
      const { c } = setup(); const id = grant(c, card); c.choose = () => 'self';
      c.run('state.players[0].position=6;state.players[1].position=14;resolveLanding=async()=>{throw Error("Unexpected landing")};');
      assert.equal((await use(c, id)).ok, true); assert.equal(c.run('state.phase'), 'await_roll');
      assert.equal(c.run('state.currentPlayerIndex'), 0);
    });
  }
  await test('property exchange updates the paired large parcel without losing its building', async () => {
    const { c } = setup(); const id = grant(c, 'propertySwap');
    c.run(`var large=state.board.find(t=>t.lot?.isLarge&&!t.isLargeSecondary);var other=state.board.find(t=>t.lot&&!t.lot.isLarge);
      large.lot.ownerId='human';large.lot.level=3;other.lot.ownerId='ai';other.lot.level=2;`);
    c.choose = () => String(c.run('large.index')); assert.equal((await use(c, id)).ok, true);
    assert.equal(c.run('large.lot.ownerId'), 'ai'); assert.equal(c.run('large.lot.level'), 3);
    assert.equal(c.run('state.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===large.index).lot.ownerId'), 'ai');
    assert.equal(c.run('other.lot.ownerId'), 'human');
  });
  await test('buff and direction cards execute all their existing effects', async () => {
    for (const [card, player, effect] of [['boost',0,'speedBoost'],['slow',1,'speedSlow'],['freeze',1,'frozen'],['combo',0,'extraTurn'],['shield',0,'shield'],['doubleRent',0,'doubleRent'],['reverse',1,'reversed']]) {
      const { c } = setup(); const id = grant(c, card); c.choose = () => player ? 'opponent' : 'self';
      c.run(`state.board.find(t=>t.lot).lot.ownerId='human'`);
      assert.equal((await use(c, id)).ok, true); assert.equal(c.run(`state.players[${player}].effects.${effect}`), true);
    }
  });
  await test('AI retains useless protection, then spends it when rival property exists', async () => {
    const { c } = setup(); grant(c, 'shield', 'ai');
    c.run('state.currentPlayerIndex=1;setAiTurnStatus()'); await c.run('useAiInventoryCard(state.players[1])');
    assert.equal(c.run('state.players[1].cards.length'), 1);
    c.run(`state.board.find(t=>t.lot).lot.ownerId='human'`); await c.run('useAiInventoryCard(state.players[1])');
    assert.equal(c.run('state.players[1].cards.length'), 0); assert.equal(c.run('state.players[1].effects.shield'), true);
    assert.equal(c.run('state.currentPlayerIndex'), 1);
  });
  await test('real AI turn uses a stored card once, then continues normal dice movement', async () => {
    const { c } = setup(); grant(c, 'boost', 'ai');
    c.run('state.currentPlayerIndex=1;setAiTurnStatus();rollDice=()=>2;resolveLanding=async()=>{};');
    await c.run('playAiTurn()'); assert.equal(c.run('state.players[1].cards.length'), 0);
    assert.equal(c.run('state.players[1].position'), 4); assert.equal(c.run('state.currentPlayerIndex'), 0);
  });
  await test('combo keeps the existing automatic extra action without another card allowance', async () => {
    const { c } = setup(); const id = grant(c, 'combo'); await use(c, id);
    c.run('animateDiceRoll=async()=>2;resolveLanding=async()=>{}'); await c.run('playHumanTurn()');
    assert.equal(c.run('state.players[0].position'), 4); assert.equal(c.run('state.currentPlayerIndex'), 1);
    assert.equal(c.run('state.players[0].cardUsedThisTurn'), true);
  });
  await test('no card can bypass an inactive turn, rest, current choice, or game end', async () => {
    for (const mode of ['ai','rest','frozen','modal','busy','ended','menu']) {
      const { c } = setup(); const id = grant(c, 'shield');
      c.run(({ai:'state.currentPlayerIndex=1',rest:'state.players[0].effects.hotSpringRest=true',frozen:'state.players[0].effects.frozen=true',modal:'state.phase="await_modal"',busy:'state.busy=true',ended:'state.gameOver=true',menu:'startScreenEl.classList.contains=()=>false'})[mode]);
      assert.equal((await use(c, id)).ok, false, mode); assert.equal(c.run('state.players[0].cards.length'), 1);
    }
  });
  await test('loadout seam validates ids, applies once and never touches match or warehouse cash', () => {
    const { c } = setup(); const cash = c.run('state.players[0].cash');
    assert.deepEqual(json(c, 'GameCards.applyLoadout("human",["unknown"])'), []);
    assert.equal(c.run('GameCards.applyLoadout("human",["shield","launch"],"loadout-1").length'), 2);
    assert.equal(c.run('GameCards.applyLoadout("human",["shield"]).length'), 0);
    assert.equal(c.run('state.players[0].cash'), cash); assert.equal(c.run('state.players[0].cards[0].source.reference'), 'loadout-1');
    c.run('initializeGame("compact");state.initiativeResolved=true');
    assert.equal(c.run('GameCards.applyLoadout("human",["shield"]).length'), 0);
  });
  console.log(`${checks} inventory checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
