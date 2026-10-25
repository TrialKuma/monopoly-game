'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {STORAGE_KEY,createStore,validProfile}=require('../progression.js');
const TownPlan=require('../town-plan.js');
function fixture(raw){const data=new Map(raw===undefined?[]:[[STORAGE_KEY,raw]]);let blocked=false;const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(blocked)throw Error('QuotaExceededError');data.set(key,value)}};const create=()=>createStore(storage,()=> '2026-10-25T10:00:00.000Z',()=> '2026-10-25');return {data,storage,create,store:create(),raw:()=>data.get(STORAGE_KEY),fail:value=>blocked=value};}
const input=(runId,overrides={})=>({eligible:true,runId,mapId:'harbor',mapName:'潮汐港湾',mode:'rounds',reason:'rounds',winnerId:'human',rounds:40,humanCash:1500,collectionCount:3,buildingCardDraft:true,buildingCards:[],...overrides});
function enter(f,id,mapId='harbor'){assert.equal(f.store.enter({runId:id,mapId,price:mapId==='harbor'?250:100}).ok,true)}
function complete(f,id,overrides={}){enter(f,id,overrides.mapId);const result=f.store.settle(input(id,overrides));assert.equal(result.ok,true);return result;}
let checks=0;function test(name,fn){fn();checks++;console.log('PASS '+name)}

test('base materials and each distinct completed harbor project are separately recorded and credited',()=>{
 for(const [rewards,total] of [[[],3],[['water'],4],[['promenade'],4],[['water','promenade'],5]]){
  const f=fixture(),result=complete(f,'projects',{harborProjectRewards:rewards});
  assert.equal(result.receipt.collectionCount,3);assert.deepEqual(result.receipt.harborProjectRewards,rewards);assert.equal(result.profile.collections.harbor_shell,total);
  assert.equal(result.profile.wallet,2450);assert.equal(result.profile.earned,1500);assert.equal(result.receipt.cash,1500);
  assert.equal(validProfile(result.profile),true);assert.deepEqual(f.create().read().profile,result.profile);
 }
});
test('omitted input creates an empty project reward list and keeps the original base reward',()=>{
 const f=fixture(),result=complete(f,'no-project');assert.deepEqual(result.receipt.harborProjectRewards,[]);assert.equal(result.profile.collections.harbor_shell,3);
 assert.equal(f.create().settle(input('no-project',{harborProjectRewards:[]})).duplicate,true);
});
test('input ordering and repeated IDs cannot duplicate an award or break an equivalent retry',()=>{
 const f=fixture(),rewards=['promenade','water'],result=complete(f,'normalize',{harborProjectRewards:rewards});
 assert.deepEqual(rewards,['promenade','water']);assert.deepEqual(result.receipt.harborProjectRewards,['water','promenade']);const before=f.raw();
 assert.equal(f.create().settle(input('normalize',{harborProjectRewards:['water','promenade']})).duplicate,true);assert.equal(f.raw(),before);
 const duplicate=complete(f,'same-project',{harborProjectRewards:['water','water']});assert.deepEqual(duplicate.receipt.harborProjectRewards,['water']);assert.equal(duplicate.profile.collections.harbor_shell,9);
 assert.equal(f.create().settle(input('same-project',{harborProjectRewards:['water']})).duplicate,true);
});
test('changing the completed project set on an existing receipt is a conflict without any mutation',()=>{
 const f=fixture();complete(f,'fixed',{harborProjectRewards:['water']});const before=f.raw();
 for(const rewards of [undefined,[],['promenade'],['water','promenade']]){assert.equal(f.store.settle(input('fixed',{harborProjectRewards:rewards})).error,'conflict');assert.equal(f.raw(),before);}
});
test('projects do not loosen the base material cap and cannot award materials on other maps',()=>{
 for(const mapId of ['classic','compact','expansion','alpine','harbor']){
  const f=fixture();enter(f,'validate',mapId);const before=f.raw(),base={mapId,buildingCardDraft:mapId==='harbor',buildingCards:[]};
  for(const collectionCount of [0,4,5,-1,1.5,'3']){assert.equal(f.store.settle(input('validate',{...base,collectionCount,harborProjectRewards:mapId==='harbor'?['water','promenade']:[]})).error,'invalid');assert.equal(f.raw(),before)}
  if(mapId!=='harbor'){assert.equal(f.store.settle(input('validate',{...base,harborProjectRewards:['water']})).error,'invalid');assert.equal(f.raw(),before)}
 }
});
test('invalid project data, unpaid runs and ineligible previews cannot mint extra shells',()=>{
 const f=fixture();enter(f,'invalid');const before=f.raw();
 for(const rewards of [null,'water',{},[1],['unknown'],['water','bogus'],['water','water','promenade']]){
  assert.equal(f.store.settle(input('invalid',{harborProjectRewards:rewards})).error,'invalid');assert.equal(f.raw(),before);
 }
 assert.equal(f.store.settle(input('unpaid',{harborProjectRewards:['water']})).error,'unpaid');
 assert.equal(f.store.settle(input('invalid',{eligible:false,harborProjectRewards:['water']})).skipped,true);assert.equal(f.raw(),before);
});
test('legacy receipts missing the new field still reload and retry but cannot receive retroactive projects',()=>{
 for(const version of [2,3,4]){
  const seed=fixture(),result=complete(seed,'legacy',{buildingCardDraft:false,buildingCards:[{cardId:'harbor_villa',count:1}]});
  const old=structuredClone(result.profile);delete old.receipts[0].harborProjectRewards;old.version=version;
  if(version===2){delete old.town;delete old.receipts[0].buildingCards;delete old.receipts[0].cardRewardVersion;}
  if(version===3)delete old.town.landStage;
  const f=fixture(JSON.stringify(old)),loaded=f.store.read();assert.equal(loaded.ok,true);assert.equal(loaded.profile.collections.harbor_shell,3);
  const retry=input('legacy',{buildingCardDraft:false,buildingCards:version===2?undefined:[{cardId:'harbor_villa',count:1}]});const before=f.raw();
  assert.equal(f.create().settle(retry).duplicate,true);assert.equal(f.raw(),before);
  assert.equal(f.store.settle({...retry,harborProjectRewards:['water']}).error,'conflict');assert.equal(f.raw(),before);
 }
});
test('failed storage writes no coins, shells, receipt or cards; retry applies the entire award once',()=>{
 const f=fixture();enter(f,'failed');const before=f.raw(),request=input('failed',{harborProjectRewards:['water','promenade'],buildingCards:[{cardId:'harbor_finance',count:1}]});
 f.fail(true);assert.equal(f.store.settle(request).error,'save_failed');assert.equal(f.raw(),before);
 assert.equal(f.create().read().profile.collections.harbor_shell,0);assert.equal(f.create().read().profile.receipts.length,0);assert.equal(f.create().read().profile.town.cards.harbor_finance.unlocked,false);
 f.fail(false);const result=f.store.settle(request);assert.equal(result.ok,true);assert.equal(result.profile.collections.harbor_shell,5);assert.equal(result.profile.town.cards.harbor_finance.unlocked,true);
 const after=f.raw();assert.equal(f.create().settle(request).duplicate,true);assert.equal(f.raw(),after);
});
test('project shells pay for real town expansion and landscape upgrades and survive ledger replay',()=>{
 const f=fixture();complete(f,'spend',{collectionCount:1,harborProjectRewards:['water','promenade']});
 assert.equal(f.store.town.expand({expectedStage:1,actionId:'shell-expansion'}).ok,true);assert.equal(f.store.read().profile.collections.harbor_shell,1);
 assert.equal(f.store.buy('waterfront',1).ok,true);assert.equal(f.store.read().profile.collections.harbor_shell,0);
 const reloaded=f.create().read();assert.equal(reloaded.ok,true);assert.equal(validProfile(reloaded.profile),true);assert.equal(reloaded.profile.town.landStage,1);assert.equal(reloaded.profile.projectLevels.waterfront,1);
 assert.equal(f.store.leaderboard('harbor','rounds').rows[0].cash,1500);
});
test('modified receipt project fields or inventory totals are rejected without replacing saved bytes',()=>{
 const f=fixture(),result=complete(f,'tamper',{harborProjectRewards:['water','promenade']});
 const mutations=[p=>p.receipts[0].harborProjectRewards.push('water'),p=>p.receipts[0].harborProjectRewards=['water','water'],p=>p.receipts[0].harborProjectRewards.reverse(),p=>p.receipts[0].harborProjectRewards=['bad'],p=>delete p.receipts[0].harborProjectRewards,p=>p.collections.harbor_shell++,p=>p.receipts[0].collectionCount=5];
 for(const mutate of mutations){const broken=structuredClone(result.profile);mutate(broken);const raw=JSON.stringify(broken),bad=fixture(raw);assert.equal(validProfile(broken),false);assert.equal(bad.store.read().error,'corrupt');assert.equal(bad.raw(),raw);}
});
test('v1 legacy income cannot smuggle a project award through migration',()=>{
 const receipt={runId:'old',mapId:'harbor',mapName:'潮汐港湾',mode:'rounds',reason:'rounds',rounds:30,cash:1000,winnerId:'human',completedAt:'2026-10-22T08:00:00.000Z'};
 const old={version:1,wallet:1000,earned:1000,owned:[],receipts:[receipt]},good=fixture(JSON.stringify(old));assert.equal(good.store.read().ok,true);assert.equal(good.store.read().profile.collections.harbor_shell,0);
 receipt.harborProjectRewards=['water'];const raw=JSON.stringify(old),bad=fixture(raw);assert.equal(bad.store.read().error,'corrupt');assert.equal(bad.raw(),raw);
});
test('result markup shows total shells with a short project contribution and no duplicate-credit text',()=>{
 const f=fixture(),sandbox={TownPlan,localStorage:f.storage,document:{readyState:'loading',addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}},dispatchEvent(){},CustomEvent:class{},console};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../progression.js'),'utf8'),sandbox);
 const api=sandbox.GameProgression;assert.equal(api.enter({runId:'ui',mapId:'harbor',price:250}).ok,true);
 const result=api.settle(input('ui',{harborProjectRewards:['water','promenade']})),markup=api.resultMarkup(result);
 assert.match(markup,/\+5 潮汐海螺 · 建设 \+2/);assert.doesNotMatch(markup,/\+3 潮汐海螺/);
 assert.equal(api.settle(input('ui',{harborProjectRewards:['promenade','water']})).duplicate,true);assert.match(api.resultMarkup(result),/\+5 潮汐海螺 · 建设 \+2/);
 api.enter({runId:'base-ui',mapId:'harbor',price:250});const base=api.settle(input('base-ui'));assert.match(api.resultMarkup(base),/\+3 潮汐海螺/);assert.doesNotMatch(api.resultMarkup(base),/建设 \+0/);
});
console.log(`${checks} harbor construction material settlement checks passed.`);
