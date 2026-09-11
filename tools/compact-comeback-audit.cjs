'use strict';
// Focused, seeded observation of complete matches under the actual shipped rules.
// This reuses the inert UI harness; it does not replace dice, AI, movement,
// bankruptcy handling, property actions, or the round/extra-turn rules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {context, mulberry32} = require('./simulation-context.cjs');
const repo = path.resolve(__dirname, '..');

function auditRunner(source, map) {
  const c = context(source, 1);
  let random = mulberry32(1), randomCalls = 0, forceCoin = false, firstSeat = 0;
  c.auditCoin = () => { forceCoin = true; };
  c.Math.random = () => {
    const value = random(); randomCalls++;
    if (forceCoin) { forceCoin = false; return firstSeat === 0 ? .25 : .75; }
    return value;
  };
  c.run(`PLAYER_DEFS.forEach(p=>p.isAi=true);selectedMapId=${JSON.stringify(map)};
    showModal=async cfg=>{
      if(cfg.label==='先手决定'){auditCoin();return 'flip'}
      if(cfg.label==='对局模式'||cfg.buttons?.some(b=>b.id==='rounds'))return 'rounds';
      throw Error('Unexpected decision: '+cfg.title);
    };
    let audit=null;
    const auditCashOriginal=updatePlayerCash;
    updatePlayerCash=function(player,delta,...rest){
      const result=auditCashOriginal(player,delta,...rest);
      if(audit)audit.cashNet[player.id]=(audit.cashNet[player.id]||0)+delta;
      return result;
    };
    const auditRentOriginal=collectToll;
    collectToll=function(visitor,owner,tile){
      const result=auditRentOriginal(visitor,owner,tile);
      audit.rents++;audit.actualRentTotal+=result.actualPayment;
      if(result.actualPayment>=500)audit.hugeRents++;
      if(result.actualPayment<result.toll)audit.incompleteRents++;
      audit.maxActualRent=Math.max(audit.maxActualRent,result.actualPayment);
      return result;
    };
    const auditTurnOriginal=processTurn;
    processTurn=async function(player,extra=false){
      audit.actions++;if(extra)audit.extraActions++;
      if(player.effects.bankruptcyRelief)audit.reliefRecoveryActions++;
      if(audit.actions>1000)throw Error('Action safety limit');
      return auditTurnOriginal(player,extra);
    };
    showContinueModal=async cfg=>{
      if(cfg.label==='破产救助')audit.reliefs++;
      if(cfg.label==='等待救援')audit.reliefRests++;
      if(cfg.drama?.acquisition===true){
        audit.acquisitions++;
        const lots=state.board.filter(t=>t.lot&&!t.isLargeSecondary),buyer=cfg.drama.to.id,seller=cfg.drama.from.id;
        // A successful event is emitted after the single property transfer.
        const beforeBuyer=lots.filter(t=>t.lot.ownerId===buyer).length-1;
        const beforeSeller=lots.filter(t=>t.lot.ownerId===seller).length+1;
        if(beforeBuyer<beforeSeller)audit.acquisitionsWhileBehind++;
        if(beforeBuyer+2<=beforeSeller)audit.acquisitionsWhileBehindByTwo++;
      }
    };
    function auditSnapshot(){
      const lots=state.board.filter(t=>t.lot&&!t.isLargeSecondary);
      const unique=new Set(lots.map(t=>t.lot));
      if(unique.size!==lots.length)throw Error('Independent property alias mismatch');
      const cash=state.players.map(p=>p.cash);
      const properties=state.players.map(p=>lots.filter(t=>t.lot.ownerId===p.id).length);
      if(properties.reduce((a,b)=>a+b,0)>lots.length)throw Error('Property count mismatch');
      return {cash,properties};
    }
    function auditLedger(){
      for(const p of state.players){
        if(!Number.isFinite(p.cash)||p.cash<0)throw Error('Invalid cash');
        if(p.cash!==getMapEconomy().startCash+(audit.cashNet[p.id]||0))throw Error('Cash ledger mismatch for '+p.id);
      }
      if(!Number.isFinite(state.bankPool)||state.bankPool<0)throw Error('Invalid public bank');
    }
  `);
  const run = c.run(`(async function(){
    audit={cashNet:{},actions:0,extraActions:0,reliefs:0,reliefRests:0,reliefRecoveryActions:0,rents:0,hugeRents:0,
      incompleteRents:0,actualRentTotal:0,maxActualRent:0,acquisitions:0,acquisitionsWhileBehind:0,acquisitionsWhileBehindByTwo:0,
      zeroVsFourRounds:0,lateRoundSamples:0,normalTurns:[0,0],round10:null};
    await startNewGame();
    if(!state.initiativeResolved||state.firstPlayerIndex!==state.currentPlayerIndex)throw Error('Initiative not settled');
    const first=state.firstPlayerIndex,initialCash=state.players.map(p=>p.cash),economy=getMapEconomy();
    if(initialCash[first]!==economy.startCash||initialCash[1-first]!==economy.startCash+economy.secondPlayerBonus)throw Error('Startup cash mismatch');
    auditLedger();
    while(!state.gameOver){
      const actor=state.currentPlayerIndex;audit.normalTurns[actor]++;
      await processTurn(currentPlayer());
      if(audit.normalTurns[0]+audit.normalTurns[1]>200)throw Error('Normal-turn safety limit');
      auditLedger();
      if(audit.normalTurns[0]===audit.normalTurns[1]){
        const completed=audit.normalTurns[0];
        if(state.round!==completed+1)throw Error('Incorrect complete-round boundary');
        const snap=auditSnapshot();
        if(completed===10)audit.round10=snap;
        if(completed>=10){
          audit.lateRoundSamples++;
          if(snap.properties.some((p,i)=>p===0&&snap.properties[1-i]>=4))audit.zeroVsFourRounds++;
        }
      }
    }
    const roundLimit=getMaxRounds();
    if(audit.normalTurns.some(n=>n!==roundLimit))throw Error('Unequal/effective scheduled turns: '+audit.normalTurns);
    if(!audit.round10)throw Error('Missing round-10 observation');
    const final=auditSnapshot(),winner=final.cash[0]===final.cash[1]?null:final.cash[0]>final.cash[1]?0:1;
    return {...audit,first,initialCash,roundLimit,final,winner,firstWin:winner===first,
      zeroPropertyLoser:winner!==null&&final.properties[1-winner]===0,bankLeft:state.bankPool};
  })`);
  return async (seed, seat = 0) => {
    random = mulberry32(seed); randomCalls = 0; forceCoin = false; firstSeat = seat;
    const result = JSON.parse(JSON.stringify(await run()));
    return {seed, randomCalls, ...result};
  };
}

function summary(games) {
  const n = games.length;
  const sum = key => games.reduce((total,g)=>total+g[key],0);
  const comeback = (key, minimumGap) => {
    const eligible=games.map(g=>{
      const v=g.round10[key],gap=v[0]-v[1];
      return Math.abs(gap)>=minimumGap ? {g,behind:gap<0?0:1} : null;
    }).filter(Boolean);
    const wins=eligible.filter(({g,behind})=>g.winner===behind).length;
    const draws=eligible.filter(({g})=>g.winner===null).length;
    return {minimumGap,samples:eligible.length,wins,draws,winRate:eligible.length?wins/eligible.length:null};
  };
  const firstWins=games.filter(g=>g.firstWin).length,draws=games.filter(g=>g.winner===null).length;
  const zeroPropertyLosers=games.filter(g=>g.zeroPropertyLoser).length;
  return {n,propertyComeback:comeback('properties',2),cashComeback:comeback('cash',600),
    firstWins,secondWins:n-firstWins-draws,draws,firstWinRate:firstWins/n,
    zeroPropertyLosers,zeroPropertyLoserRate:zeroPropertyLosers/n,
    zeroVsFourLateRoundRate:sum('zeroVsFourRounds')/sum('lateRoundSamples'),
    meanReliefs:sum('reliefs')/n,meanReliefRests:sum('reliefRests')/n,
    meanRents:sum('rents')/n,meanHugeRents:sum('hugeRents')/n,
    meanActualRentTotal:sum('actualRentTotal')/n,maxActualRent:Math.max(...games.map(g=>g.maxActualRent)),
    incompleteRentRate:sum('incompleteRents')/sum('rents'),meanAcquisitions:sum('acquisitions')/n,
    totalAcquisitions:sum('acquisitions'),acquisitionsWhileBehind:sum('acquisitionsWhileBehind'),acquisitionsWhileBehindByTwo:sum('acquisitionsWhileBehindByTwo'),
    normalRounds:[...new Set(games.map(g=>g.roundLimit))],
    meanFinalCash:games.reduce((s,g)=>s+g.final.cash[0]+g.final.cash[1],0)/(2*n)};
}

async function verifyRunner(source) {
  const {runner}=require('./economy-simulation.cjs');
  for(const map of ['compact','classic','expansion']){
    const audit=auditRunner(source,map),previous=runner(source,map);
    for(const [seed,seat] of [[9122401,0],[9122402,1]]){
      const a=await audit(seed,seat),b=await previous(seed,seat);
      assert.deepEqual(a.final.cash,b.cash);assert.deepEqual(a.normalTurns,b.base);
      for(const key of ['actions','extraActions','reliefs','rents','hugeRents','randomCalls'])assert.equal(a[key],b[key],map+' '+key);
      // Legacy metric counts entry with a relief flag, which no longer implies
      // a skipped action in compact. The event metric above counts real rests.
      assert.equal(a.reliefRecoveryActions,b.reliefRests,map+' relief recovery entries');
      assert.deepEqual(a,await audit(seed,seat),'Reused VM must repeat exactly');
    }
  }
}

const pct = n => n===null?'—':(100*n).toFixed(1)+'%';
function writeMarkdown(report, out) {
  const lines=['# 紧凑图翻盘小样本审计','',
    '这是实际规则下的 AI 对 AI 观察，不是真人胜率测定，也不能把版本差异归因于某一个改动。双方使用各版本相同的现有 AI；新版 AI 可以选择新版新增的接管动作。', '',
    `基准：\`${report.baselineRef}\`。种子从 ${report.seedStart} 起；每版本紧凑 ${report.counts.compact} 局，经典、大环各 ${report.counts.smoke} 局。先手席位按种子交替，未把镜像重复局当作额外样本。`, '',
    '双方各完成第 10 个正常回合后，分别记录现金和独立产权。双格建筑只算一份产权；骰出 6 的加行动仍属于原正常回合。两种落后条件分别筛选，样本可能重叠。‘剃光头’在这里严格定义为终局败方零产权，不能代表玩家主观的碾压感。胜负按游戏实际规则只比较终局现金。', '',
    '| 地图 / 版本 | 局数 | 产权落后 ≥2 后胜出 | 现金落后 ≥600 后胜出 | 败方零产权 | 救助 / 局 | 实收 ≥500 租金 / 局 | 先手胜率 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for(const row of report.results){
    const s=row.summary,a=s.propertyComeback,b=s.cashComeback;
    const mapName={compact:'紧凑',classic:'经典',expansion:'大环'}[row.map],versionName=row.version==='before'?'修改前':'修改后';
    lines.push(`| ${mapName} / ${versionName} | ${s.n} | ${a.wins}/${a.samples} (${pct(a.winRate)}) | ${b.wins}/${b.samples} (${pct(b.winRate)}) | ${s.zeroPropertyLosers}/${s.n} (${pct(s.zeroPropertyLoserRate)}) | ${s.meanReliefs.toFixed(2)} | ${s.meanHugeRents.toFixed(2)} | ${pct(s.firstWinRate)} |`);
  }
  const compactAfter=report.results.find(r=>r.map==='compact'&&r.version==='after')?.summary;
  const compactBefore=report.results.find(r=>r.map==='compact'&&r.version==='before')?.summary;
  if(compactAfter&&compactBefore)lines.push('',
    `紧凑新版发生 ${compactAfter.totalAcquisitions} 次市政府接管（每局 ${compactAfter.meanAcquisitions.toFixed(2)} 次），其中 ${compactAfter.acquisitionsWhileBehind} 次买方在交易前产权较少，${compactAfter.acquisitionsWhileBehindByTwo} 次至少落后两块。接管确实让产权换手，但领先者也能购买，不能将它视作专门帮助落后者的机制。`, '',
    `紧凑实际救助罚停由每局 ${compactBefore.meanReliefRests.toFixed(2)} 次降为 ${compactAfter.meanReliefRests.toFixed(2)} 次。这里统计实际出现的救助休整事件；恢复保护标记在新版仍存在，因此不拿标记本身当作跳过行动。`, '',
    '这组样本里，产权落后后的胜出比例略升，现金落后后的胜出比例接近，败方零产权局略少；大额实际租金增加。结果支持“产权更容易发生交易、高额租金仍在”，不足以宣称雪球或翻盘问题已经解决。');
  lines.push('', '校验：每个正常行动链结束后逐人核对现金账本（包含其中全部额外行动），检查非负有限现金、非负公共金库；每一完整轮核对回合边界；终局核对两人正常回合数等于地图规定。审计工具还用各地图两个种子和既有真实规则 runner 对照终局现金、行动数、救助、租金和随机数调用次数，并验证重复执行完全一致。', '',
    '相同种子用于两版，但新增行动会改变后续随机数消耗，因此不能理解为双方经历了相同的骰子轨迹。中盘筛选条件在每版各自判定，两版落后样本不必是同一批对局。经典和大环的 100 局用于规则冒烟，不足以做细微平衡结论。', '',
    'JSON 附逐局种子、第 10 轮快照、终局现金/产权和精简事件指标，可复现个别极端局。源文件哈希记录实际被执行的规则文件；本报告不以编写日期替代源版本。', '');
  fs.writeFileSync(out,lines.join('\n'));
}

async function main(){
  const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.replace(/^--/,''),true]:[arg.slice(2,i),arg.slice(i+1)];}));
  const baselineRef=String(opts.baseline||'b778450');
  const before=execFileSync('git',['show',baselineRef+':game.js'],{cwd:repo,encoding:'utf8'});
  const after=fs.readFileSync(path.join(repo,'game.js'),'utf8');
  await verifyRunner(before);await verifyRunner(after);
  if(opts['self-check']){console.log('PASS: audit matches existing runner and repeats exactly across three maps and two starter seats.');return;}
  const seedStart=Number(opts['seed-start']||9122600),compact=Number(opts.compact||600),smoke=Number(opts.smoke||100);
  assert(Number.isInteger(seedStart)&&Number.isInteger(compact)&&compact>0&&Number.isInteger(smoke)&&smoke>0);
  const report={baselineRef,seedStart,counts:{compact,smoke},complete:false,results:[],
    methodology:{policy:'Identical shipped AI for both players in each version',snapshot:'After both players complete their tenth normal turn',ledger:'Per player after each normal action chain including all extras; exact normal-round boundary and final turn counts',unit:'Independent seed, alternated first seat; no mirrored duplication',limits:'Descriptive AI sample, not causal or human win-rate evidence'}};
  const out=path.join(repo,'reports','compact-comeback-review.json');
  for(const map of ['compact','classic','expansion'])for(const [version,source] of [['before',before],['after',after]]){
    const run=auditRunner(source,map),games=[],count=map==='compact'?compact:smoke;
    for(let i=0;i<count;i++)games.push(await run(seedStart+i,i%2));
    report.results.push({map,version,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),summary:summary(games),
      games:games.map(({cashNet,...g})=>g)});
    console.log(JSON.stringify({map,version,summary:report.results.at(-1).summary}));
    fs.writeFileSync(out,JSON.stringify(report,null,2));
  }
  report.complete=true;fs.writeFileSync(out,JSON.stringify(report,null,2));
  writeMarkdown(report,path.join(repo,'reports','compact-comeback-review.md'));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={auditRunner,summary,verifyRunner};
