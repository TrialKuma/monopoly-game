'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { context } = require('../tools/simulation-context.cjs');
const { createStore, validProfile } = require('../progression.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const json = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
function fresh(map = 'harbor') {
  const c = context(source, 1421);
  c.run(`initializeGame('${map}');var human=state.players[0],ai=state.players[1];human.cards=[];ai.cards=[];`);
  return c;
}
const snapshot = c => json(c, 'GameHarborProjects.getSnapshot()');
function seed(c, indices, levels, owner='human') {
  indices.forEach((index, i) => c.run(`state.board[${index}].lot.ownerId='${owner}';state.board[${index}].lot.level=${levels[i]};`));
}
let checks=0;
async function test(name, fn) { await fn(); checks++; console.log('PASS '+name); }
(async () => {
  await test('each court counts only three distinct owned deeds; large secondaries and AI levels do not count twice', () => {
    const c=fresh(); seed(c,[6,7,9],[3,3,3],'ai');
    assert.deepEqual(snapshot(c).map(p=>p.points),[0,0]);
    c.run('state.board[7].lot.ownerId="human"');
    assert.equal(c.run('state.board[8].lot.ownerId'),'human');
    assert.equal(snapshot(c)[0].points,3);
    assert.deepEqual(snapshot(c)[0].indices,[6,7,9]);
    assert.deepEqual(snapshot(c)[1].indices,[29,30,32]);
    assert.equal(snapshot(c)[0].stage,0);
  });
  await test('snapshot/scene reads are pure and returned arrays cannot alter progress', () => {
    const c=fresh(); seed(c,[6,7,9],[3,3,3]);
    const before=json(c,'({cash:human.cash,cards:human.cards,projects:state.harborProjects})');
    c.run('for(let i=0;i<20;i++){const p=GameHarborProjects.getSnapshot()[0];p.indices[0]=1;p.rewards[0].earned=true;p.stage=3;p.lots[0].owned=false;}');
    assert.deepEqual(json(c,'({cash:human.cash,cards:human.cards,projects:state.harborProjects})'),before);
    assert.equal(snapshot(c)[0].points,9);
  });
  await test('real paid upgrades cross 3/6/9 once, grant optional card, and leave shell pending settlement', () => {
    const c=fresh(); seed(c,[6,7,9],[0,0,0]);
    const cash=c.run('human.cash'); let costs=0;
    for(let level=1;level<=3;level++) {
      for(const index of [6,7,9]) {costs+=c.run(`state.board[${index}].lot.buildCosts[${level}]`);c.run(`buildLot(human,state.board[${index}],false)`);}
      const p=snapshot(c)[0]; assert.equal(p.points,level*3);assert.equal(p.stage,level);
      assert.equal(p.nextTarget,level<3?(level+1)*3:null);
      assert.equal(c.run('human.cash'),cash-costs+100);
      assert.equal(c.run('human.cards.length'),level>=2?1:0);
      assert.equal(c.run('human.effects.speedBoost'),false);
    }
    assert.equal(c.run('human.cards[0].cardId'),'boost');
    assert.equal(c.run('human.cards[0].source.reference'),'water');
    assert.equal(snapshot(c)[0].collectionBonus,1);
    const final=json(c,'({cash:human.cash,cards:human.cards})');
    c.run('syncHarborProjects();syncHarborProjects()');
    assert.deepEqual(json(c,'({cash:human.cash,cards:human.cards})'),final);
  });
  await test('both projects track independently and an acquired developed deed can cross a threshold', () => {
    const c=fresh(); seed(c,[6,7],[1,1]);c.run('state.board[9].lot.level=1');
    const price=c.run('state.board[9].lot.price'),cash=c.run('human.cash');
    c.run('buyLot(human,state.board[9],false)');
    assert.equal(c.run('human.cash'),cash-price+100);assert.deepEqual(snapshot(c).map(p=>p.stage),[1,0]);
    seed(c,[29,30,32],[3,3,3]);c.run('syncHarborProjects()');
    assert.deepEqual(snapshot(c).map(p=>p.stage),[1,3]);
    assert.equal(c.run('human.cards.length'),1);
  });
  await test('free construction and pass-start auto-building also advance the projects', async () => {
    const c=fresh();seed(c,[6,7,9],[1,1,0]);c.Math.random=()=>0;
    c.run('showModal=async()=>"build"');await c.run('resolveConstruction(human,state.sessionId)');
    assert.equal(snapshot(c)[0].stage,1);
    const d=fresh();seed(d,[29,30,32],[1,1,0]);
    d.run('human.position=33;human.harborAnchor=33;human.harborCursor=5;human.harborSalaryMin=5;human.harborSalaryMax=5;human.harborSalaryDistance=getMapNavigation().salaryGapMin;');
    const before=d.run('human.cash');await d.run('animateMovement(human,1,state.sessionId)');
    assert.equal(d.run('state.board[32].lot.level'),1);assert.equal(snapshot(d)[1].stage,1);
    assert.equal(d.run('human.cash'),before+d.run('getMapEconomy().startBonus')+100);
  });
  await test('municipal acquisition grants a reached stage, and later seizure preserves earned milestones', async () => {
    const c=fresh();seed(c,[6,7],[1,1]);seed(c,[9],[1],'ai');c.run('showModal=async cfg=>cfg.buttons.some(b=>b.id==="seize_9")?"seize_9":"acquire"');
    const before=c.run('human.cash'),price=c.run('getCityTakeoverQuote(state.board[9].lot).purchasePrice');
    await c.run('resolveStartTakeover(human,state.sessionId)');
    assert.equal(c.run('human.cash'),before-price+100);assert.equal(snapshot(c)[0].stage,1);
    c.run('ai.cash=0');await c.run('resolveStartTakeover(ai,state.sessionId)');
    assert(snapshot(c)[0].points<3);assert.equal(snapshot(c)[0].stage,1);
  });
  await test('property swap updates progress for the human even when initiated by AI', async () => {
    const c=fresh();seed(c,[6,7],[1,1]);seed(c,[9],[1],'ai');seed(c,[1],[1]);
    c.Math.random=()=>0; // The human deed at index 1 is the first random exchange target.
    await c.run('executeCardEffect(ai,CARD_POOL.find(card=>card.id==="propertySwap"),state.sessionId,{giveIdx:9})');
    assert.equal(c.run('state.board[9].lot.ownerId'),'human');assert.equal(snapshot(c)[0].stage,1);
  });
  await test('demolition and rebuilding cannot replay any milestone rewards', async () => {
    const c=fresh();seed(c,[6,7,9],[3,3,3]);c.run('syncHarborProjects()');
    const before=json(c,'({cash:human.cash,cards:human.cards})');
    await c.run('resolveConstruction(ai,state.sessionId)');
    assert.equal(snapshot(c)[0].points,8);assert.equal(snapshot(c)[0].stage,3);
    c.run('const t=state.board.find(t=>!t.isLargeSecondary&&t.lot?.ownerId==="human"&&t.lot.level===2);t.lot.level=3;harborBuildingMilestone(human,t)');
    assert.deepEqual(json(c,'({cash:human.cash,cards:human.cards})'),before);
    assert.equal(snapshot(c)[0].collectionBonus,1);
  });
  await test('showcase/finished games cannot grant, other maps are empty, new sessions reset every milestone', () => {
    const c=fresh();seed(c,[6,7,9],[3,3,3]);c.run('state.phase="preview";syncHarborProjects()');assert.equal(snapshot(c)[0].stage,0);
    c.run('state.phase="locked";state.gameOver=true;syncHarborProjects()');assert.equal(snapshot(c)[0].stage,0);
    c.run('state.gameOver=false;syncHarborProjects();initializeGame("harbor")');
    assert.deepEqual(snapshot(c).map(p=>[p.points,p.stage]),[[0,0],[0,0]]);
    c.run('initializeGame("alpine");syncHarborProjects()');assert.deepEqual(snapshot(c),[]);
  });
  await test('real finishGame banks earned shells once, including ownership loss and a bankruptcy finish', () => {
    const data=new Map(),store=createStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}),c=fresh();
    c.GameProgression={...store,resetResult(){}};
    assert.equal(store.enter({runId:'project-finish',mapId:'harbor',price:250}).ok,true);
    c.run('state.runId="project-finish";state.isFormalRun=true');
    seed(c,[6,7,9,29,30,32],[3,3,3,3,3,3]);c.run('syncHarborProjects()');
    assert.equal(store.read().profile.collections.harbor_shell,0);
    c.run('state.board.forEach(t=>{if(t.lot)t.lot.ownerId="ai"});human.cash=0;state.round=18;finishGame("bankruptcy")');
    const profile=store.read().profile;
    assert.equal(profile.collections.harbor_shell,3); // base loss reward + two completed courts
    assert.deepEqual(profile.receipts[0].harborProjectRewards,['water','promenade']);
    assert.equal(profile.receipts[0].cash,0);assert.equal(validProfile(profile),true);
    c.run('finishGame("bankruptcy")');assert.deepEqual(store.read().profile,profile);
  });
  console.log(`${checks} harbor project gameplay checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
