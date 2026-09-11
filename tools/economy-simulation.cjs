'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {context,mulberry32}=require('./simulation-context.cjs');
function runner(source,map,options={}) {
  const legacyRoundBug = source.includes('state.currentPlayerIndex === state.players.length - 1');
  source=source.replace(/\r\n/g,'\n').replace(`  if (state.currentPlayerIndex === state.players.length - 1) {\n    state.round += 1; state.currentPlayerIndex = 0;\n  } else { state.currentPlayerIndex += 1; }`, `  state.currentPlayerIndex=(state.currentPlayerIndex+1)%state.players.length;\n  if(state.currentPlayerIndex===state.firstPlayerIndex)state.round++;`);
  const c=context(source,1);let forcedCoin=false,random=mulberry32(1),randomCalls=0,first=0;
  c.forceAuditCoin=()=>{forcedCoin=true};
  c.Math.random=()=>{const value=random();randomCalls++;if(forcedCoin){forcedCoin=false;return first===0?.25:.75}return value};
  c.run(`PLAYER_DEFS.forEach(p=>p.isAi=true);selectedMapId=${JSON.stringify(map)};
    if(typeof getMapEconomy==='function') Object.assign(MAP_PRESETS[${JSON.stringify(map)}].economy,${JSON.stringify(options)});
    showModal=async cfg=>{if(cfg.label==='对局模式'||cfg.title?.includes('选择游戏模式')||cfg.buttons?.some(b=>b.id==='rounds'))return 'rounds';if(cfg.label==='先手决定'){forceAuditCoin();return 'flip'}throw Error('Unexpected decision '+cfg.title)};
  `);
  const run=c.run(`
    let metric=null,moneyContext='other',landingPurchaseDepth=0;
    const updateOriginal=updatePlayerCash;updatePlayerCash=function(player,amount,...rest){if(metric){const flow=metric.money[moneyContext]??={in:0,out:0};flow[amount>=0?'in':'out']+=Math.abs(amount)}return updateOriginal(player,amount,...rest)};
    function wrapMoney(name,original){return function(...args){const prior=moneyContext;moneyContext=name;try{return original(...args)}finally{moneyContext=prior}}}
    buyLot=wrapMoney('buy',buyLot);buildLot=wrapMoney('build',buildLot);
    const tollOriginal=collectToll;collectToll=function(visitor,owner,tile){const before=Math.sign(owner.cash-visitor.cash);const value=wrapMoney('rent',tollOriginal)(visitor,owner,tile);metric.rents++;if(value.actualPayment>=500)metric.hugeRents++;if(value.actualPayment<value.toll)metric.incompleteRents++;if(before<0&&owner.cash>visitor.cash){metric.rentFlips++;if(value.actualPayment>=300)metric.bigRentFlips++;}return value};
    const moveOriginal=animateMovement;animateMovement=async function(...args){const prior=moneyContext;moneyContext='start';try{return await moveOriginal(...args)}finally{moneyContext=prior}};
    const specialOriginal=resolveSpecialTile;resolveSpecialTile=async function(player,tile,...rest){const prior=moneyContext;moneyContext=tile.special.type==='bank'?'bank':tile.special.type;try{return await specialOriginal(player,tile,...rest)}finally{moneyContext=prior}};
    const largeOriginal=resolveLargeLotEffect;resolveLargeLotEffect=async function(player,tile,...rest){const prior=moneyContext;moneyContext='largeIncome';try{await largeOriginal(player,tile,...rest)}finally{moneyContext=prior}if(tile.lot?.ownerId===player.id&&tile.lot.level<3){metric.buildOffers++;if(player.cash<tile.lot.buildCosts[tile.lot.level+1])metric.buildTooPoor++}};
    const landingOriginal=resolveLanding;resolveLanding=async function(player,tile,...rest){const offer=tile.lot&&!tile.lot.ownerId;if(offer){landingPurchaseDepth++;metric.buyOffers++;if(player.cash<tile.lot.price)metric.buyTooPoor++}try{return await landingOriginal(player,tile,...rest)}finally{if(offer)landingPurchaseDepth--}};
    const buyDecision=shouldAiBuy;shouldAiBuy=function(player,lot){if(!landingPurchaseDepth){metric.buyOffers++;if(player.cash<lot.price)metric.buyTooPoor++}const yes=buyDecision(player,lot);if(!yes&&player.cash>=lot.price)metric.buyReserveSkips++;return yes};
    const buildDecision=shouldAiBuild;shouldAiBuild=function(...args){const yes=buildDecision(...args);if(!yes)metric.buildReserveSkips++;return yes};
    const turnOriginal=processTurn;processTurn=async function(player,extra=false){metric.actions++;if(extra)metric.extraActions++;if(player.effects.bankruptcyRelief)metric.reliefRests++;if(metric.actions>1000)throw Error('Action safety limit');return turnOriginal(player,extra)};
    showContinueModal=async cfg=>{if(!metric)return;if(cfg.label==='破产救助')metric.reliefs++;if(cfg.drama?.chanceKind){const key=cfg.drama.chanceKind;metric.chance[key]=(metric.chance[key]||0)+1}};
    (async function(){
      metric={actions:0,extraActions:0,base:[0,0],rents:0,hugeRents:0,incompleteRents:0,rentFlips:0,bigRentFlips:0,reliefs:0,reliefRests:0,buyOffers:0,buyTooPoor:0,buyReserveSkips:0,buildOffers:0,buildTooPoor:0,buildReserveSkips:0,samples:0,poor:0,atReliefFloor:0,thinCash:0,lateSamples:0,latePoor:0,cashSum:0,money:{},chance:{}};
      moneyContext='opening';await startNewGame();moneyContext='other';
      // Old source needs only the equal-round marker. Current source must set it
      // and actually pay compensation through startNewGame/coinFlipForFirstPlayer.
      if(${legacyRoundBug})state.firstPlayerIndex=state.currentPlayerIndex;
      else if(!state.initiativeResolved||state.firstPlayerIndex!==state.currentPlayerIndex)throw Error('Actual startup did not settle initiative');
      const first=state.firstPlayerIndex;const initialCash=state.players.map(p=>p.cash);
      if(!${legacyRoundBug}){const e=getMapEconomy();if(initialCash[first]!==e.startCash||initialCash[1-first]!==e.startCash+e.secondPlayerBonus)throw Error('Actual startup cash mismatch')}
      while(!state.gameOver){const actor=state.currentPlayerIndex;metric.base[actor]++;await processTurn(currentPlayer());if(metric.base[0]+metric.base[1]>200)throw Error('Turn safety limit');if(metric.base[0]===metric.base[1]){for(const player of state.players){metric.samples++;metric.cashSum+=player.cash;if(player.cash<200)metric.poor++;if(player.cash<=200)metric.atReliefFloor++;if(player.cash<400)metric.thinCash++;if(metric.base[0]>=20){metric.lateSamples++;if(player.cash<200)metric.latePoor++}}}}
      const cash=state.players.map(p=>p.cash),n=getMaxRounds();if(metric.base.some(v=>v!==n))throw Error('Unequal scheduled turns '+metric.base);if(cash.some(v=>!Number.isFinite(v)||v<0))throw Error('Bad cash');
      const startCash=typeof getMapEconomy==='function'?getMapEconomy().startCash:CONFIG.startCash;
      const net=Object.values(metric.money).reduce((sum,flow)=>sum+flow.in-flow.out,0);
      if(cash[0]+cash[1]!==2*startCash+net)throw Error('Cash ledger mismatch');
      return {...metric,first,initialCash,cash,score:cash[0]===cash[1]?.5:cash[first]>cash[1-first]?1:0,openingCompensation:state.openingCompensation,bankLeft:state.bankPool};
    })`);
  return async(seed,seat=0)=>{random=mulberry32(seed);randomCalls=0;first=seat;forcedCoin=false;const result=JSON.parse(JSON.stringify(await run()));return{seed,randomCalls,...result}};
}
function stats(games){
 const n=games.length,sum=key=>games.reduce((s,g)=>s+g[key],0),mean=key=>sum(key)/n;
 const money={},chance={};for(const game of games){for(const[k,v]of Object.entries(game.money)){const row=money[k]??={in:0,out:0};row.in+=v.in/n;row.out+=v.out/n}for(const[k,v]of Object.entries(game.chance))chance[k]=(chance[k]||0)+v/n}
 const score=mean('score'),variance=games.reduce((s,g)=>s+(g.score-score)**2,0)/(n-1),half=1.96*Math.sqrt(variance/n);
 const firstWins=games.filter(g=>g.score===1).length,secondWins=games.filter(g=>g.score===0).length,draws=n-firstWins-secondWins;
 const firstWinRate=firstWins/n,winHalf=1.96*Math.sqrt(firstWinRate*(1-firstWinRate)/(n-1));
 return{n,firstWins,secondWins,draws,firstWinRate,secondWinRate:secondWins/n,drawRate:draws/n,firstWinCI:[firstWinRate-winHalf,firstWinRate+winHalf],firstScore:score,ci:[score-half,score+half],poorRate:sum('poor')/sum('samples'),atReliefFloorRate:sum('atReliefFloor')/sum('samples'),thinCashRate:sum('thinCash')/sum('samples'),latePoorRate:sum('latePoor')/sum('lateSamples'),meanCash:sum('cashSum')/sum('samples'),buyOffers:mean('buyOffers'),buyTooPoor:mean('buyTooPoor'),buyTooPoorRate:sum('buyTooPoor')/sum('buyOffers'),buildOffers:mean('buildOffers'),buildTooPoor:mean('buildTooPoor'),buildTooPoorRate:sum('buildTooPoor')/sum('buildOffers'),buyReserveSkips:mean('buyReserveSkips'),buildReserveSkips:mean('buildReserveSkips'),hugeRents:mean('hugeRents'),rents:mean('rents'),incompleteRentRate:sum('incompleteRents')/sum('rents'),rentFlips:mean('rentFlips'),bigRentFlips:mean('bigRentFlips'),reliefs:mean('reliefs'),reliefRests:mean('reliefRests'),money,chance,finalMeanCash:games.reduce((s,g)=>s+g.cash[0]+g.cash[1],0)/(2*n),bankLeft:mean('bankLeft')};
}
function pairedComparison(before,after,label) {
 if(before.length!==after.length||before.some((row,i)=>row.seed!==after[i].seed))throw Error('Paired seeds do not match');
 const interval=values=>{const n=values.length,mean=values.reduce((s,v)=>s+v,0)/n;const variance=values.reduce((s,v)=>s+(v-mean)**2,0)/(n-1);const half=1.96*Math.sqrt(variance/n);return{n,mean,low:mean-half,high:mean+half}};
 const result={label};
 for(const key of ['firstWin','score','poorRate','thinCashRate','hugeRents','bigRentFlips','reliefs'])result[key]=interval(after.map((row,i)=>key==='firstWin'?Number(row.score===1)-Number(before[i].score===1):row[key]-before[i][key]));
 return result;
}
async function main(){
 const configPath=path.resolve(process.argv[2]);
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(!Number.isInteger(config.seeds)||config.seeds<2||!Number.isInteger(config.seedStart))throw Error('Provide integer seeds >=2 and seedStart');
 const result=[],comparisons=[],pairedRuns=new Map(),base=path.dirname(configPath),repo=path.resolve(__dirname,'..');
 const out=path.resolve(base,config.out||'economy-report.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 for(const candidate of config.candidates){
  const source=candidate.sourceRef?require('node:child_process').execFileSync('git',['show',candidate.sourceRef+':game.js'],{cwd:repo,encoding:'utf8'}):fs.readFileSync(candidate.source?path.resolve(base,candidate.source):path.join(repo,'game.js'),'utf8');
  const run=runner(source,candidate.map,candidate.economy),games=[];
  for(let i=0;i<config.seeds;i++)games.push(await run(config.seedStart+i));
  const summary=stats(games);
  const row={name:candidate.name,map:candidate.map,economy:candidate.economy,sourceRef:candidate.sourceRef,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),summary};
  const outcomes=games.map(g=>({seed:g.seed,score:g.score,hugeRents:g.hugeRents,bigRentFlips:g.bigRentFlips,reliefs:g.reliefs,poorRate:g.poor/g.samples,thinCashRate:g.thinCash/g.samples}));
  pairedRuns.set(candidate.name,outcomes);
  if(config.saveOutcomes)row.outcomes=outcomes;
  if(candidate.name===candidate.map+'-final')for(const suffix of ['old-equal-rounds','new-without-compensation']){const before=candidate.map+'-'+suffix;if(pairedRuns.has(before))comparisons.push(pairedComparison(pairedRuns.get(before),outcomes,before+' -> '+candidate.name))}
  result.push(row);console.log(JSON.stringify({name:row.name,summary}));
  fs.writeFileSync(out,JSON.stringify({seedStart:config.seedStart,seeds:config.seeds,actualGames:result.reduce((sum,row)=>sum+row.summary.n,0),complete:result.length===config.candidates.length,methodology:{policy:'Identical shipped AI for both players',startup:'Actual startNewGame, mode choice, coin flip, compensation and subsequent real rules. Coin outcome is controlled but its RNG draw is still consumed.',unit:'One independent seed per map; no mirrored game counted as extra evidence.',legacy:'Only old round boundary is normalized to equal turns, before comparing old economy/chance rules.',cash:'Both players sampled after each complete normal round; extras and relief rests retain real rules.',errors:'Any error, unequal scheduled turns, invalid cash or cash-ledger mismatch stops the run.',ci:'Normal 95% approximation across independent seed outcomes; pointwise per map. Paired changes use same-seed differences.'},results:result,pairedComparisons:comparisons},null,2));
 }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={runner,stats,pairedComparison};
