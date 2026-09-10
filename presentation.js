/* Presentation adapter: consumes real game state; map, dice, cash and card rules stay in game.js. */
(() => {
  const inspector = document.getElementById('property-inspector');
  const propertyPreview = document.getElementById('event-property-preview');
  const showcaseControls = document.getElementById('showcase-controls');
  let selected = null;
  let preview = false;
  let previewBusy = false;
  let preparingPreview = false;
  let menuSnapshot = null;
  let inspectorKey = '';
  let lastCameraSession = null;
  let eventSerial = 0;
  let showcaseMapId = 'classic';
  let showcaseTargets = null;
  const mapGuide = document.getElementById('map-guide');
  const mapGuides = {
    compact: {title:'短环追逐 · 冲刺也可能冲进账单',copy:'沿 18 格短环线前进，三个街区更容易连锁收租。冲刺站随机再走 2–4 格；传送港落地后立即结算，护盾同样能挡租。'},
    expansion: {title:'大城开业 · 每圈经过全部六个街区',copy:'沿 28 格大环线依次前进。开局每街区随机一处无主地产预建 Lv.1，买下即用。城市快线随机再走 3–5 格，传送港落地后立即结算。回合制救助附带一次过路护盾，帮助脱困再起。'},
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `¥${Math.round(n).toLocaleString('zh-CN')}`;
  const person = p => p ? {id:p.id,name:p.name,color:p.color} : undefined;

  function rentFor(tile) {
    if (!tile?.lot?.ownerId) return {total:0,base:0,multiplier:1,lots:[]};
    const lots = getDistrictOwnerLots(tile.lot.district,tile.lot.ownerId);
    const base = lots.reduce((s,t)=>s+t.lot.tolls[t.lot.level],0);
    const multiplier = getDistrictTollMultiplier(lots.length) * (getPlayerById(tile.lot.ownerId)?.effects.doubleRent ? 2 : 1);
    return {total:Math.round(base*multiplier),base,multiplier,lots};
  }
  function snapshot() {
    const map = getMapConfig(state.currentMapId);
    return {sessionId:state.sessionId,mapId:state.currentMapId,board:state.board,players:state.players,
      currentPlayerId:currentPlayer().id,phase:state.phase,animation:state.animation,lastDice:state.lastDice,
      bankPool:state.bankPool,gameOver:state.gameOver,grid:map.grid,navigation:map.navigation,
      selectedTile:selected,targetSelection:state.targetSelection,districtColors:map.districtColors,
      rents:Object.fromEntries(state.board.filter(t=>t.lot).map(t=>[t.index,rentFor(t).total]))};
  }
  function syncCityScene() {
    if (!state.board || !window.CityScene?.update) return;
    if (!document.getElementById('start-screen').classList.contains('hidden')) {
      if (!menuSnapshot || menuSnapshot.mapId!==selectedMapId) {
        const map=getMapConfig(selectedMapId),board=createBoard(map);
        const props=board.filter(t=>t.lot&&!t.isLargeSecondary);
        props.forEach((t,i)=>{t.lot.ownerId=i%3===0?'ai':'human';t.lot.level=i%3+1;});
        menuSnapshot={...snapshot(),sessionId:'menu-'+selectedMapId,mapId:selectedMapId,board,
          players:PLAYER_DEFS.map((p,i)=>({...p,position:i===0?1:Math.floor(board.length*.55),effects:defaultEffects()})),
          grid:map.grid,navigation:map.navigation,rents:{},animation:{},phase:'preview',selectedTile:null,gameOver:false};
      }
      window.CityScene.update(menuSnapshot);
    } else window.CityScene.update(snapshot());
  }
  function updateCash() {
    if (!state.players) return;
    state.players.forEach(p=>{
      document.querySelectorAll(`[data-player-anchor="${p.id}"]`).forEach(card=>{
        const value=card.querySelector('.player-cash-value,.mini-cash');
        if(value)value.textContent=money(p.displayedCash??p.cash);
        card.classList.toggle('cash-changing',!!p.cashPulse);
        const delta=card.querySelector('.player-cash-delta,.mini-delta');
        if(delta)delta.hidden=!p.cashDeltaVisible;
      });
    });
  }
  function selectTile(index) {
    let tile=state.board?.[index];if(!tile)return;
    if(tile.isLargeSecondary)tile=state.board[tile.largePrimaryIndex];
    selected=tile.index;inspectorKey='';updateInspector();syncCityScene();
  }
  function updateInspector() {
    const tile=state.board?.[selected];if(!tile)return;
    const lot=tile.lot,owner=lot?.ownerId?getPlayerById(lot.ownerId):null,rent=rentFor(tile);
    const key=JSON.stringify([tile.index,lot?.ownerId,lot?.level,rent.total,state.bankPool]);
    if(key===inspectorKey)return;inspectorKey=key;
    if(lot){
      inspector.innerHTML=`<p class="panel-label">${esc(lot.district||'地产手册')}</p><h2>${esc(tile.name)}</h2><div class="property-meta"><span>${esc(owner?.name||'等待新主人')}</span><span>${lot.level===0?'空地':`Lv.${lot.level}`}</span>${lot.isLarge?'<span>占据 2 格</span>':''}</div><div class="property-price">${money(owner?rent.total:lot.price)} <small>${owner?'整条街 · 本次租金':'买下这片地'}</small></div>${owner?`<div class="property-breakdown">${rent.lots.map(t=>`${esc(t.name)} ${money(t.lot.tolls[t.lot.level])}`).join(' ＋ ')}<br>街区合计 ${money(rent.base)} × ${rent.multiplier}</div>`:''}<p class="property-note">${!owner&&lot.level>0?`开业地产：买下即得 Lv.${lot.level} 建筑。`:lot.level<3?`升级到 Lv.${lot.level+1}：${money(lot.buildCosts[lot.level+1])}`:'地标已建成，等对手的好骰子。'}${lot.effectId?'<br>'+({finance_bonus:'自己停留时获得金融收益。',tower_bonus:'自己停留时获得商务收益。',hot_spring_rest:'让来访的对手下回合休息。'}[lot.effectId]||''):''}</p>`;
    } else {
      inspector.innerHTML=`<p class="panel-label">城市特别地标</p><h2>${esc(tile.name)}</h2><div class="inspector-special">${tile.isStart?'⚑':({bank:'◈',card_draw:'▣',chance:'✦',construction:'⚒',teleport:'◎',rush:'↗',junction:'∞'}[tile.special?.type]||'✦')}</div><p class="property-note">${tile.isStart?'经过领取 ¥300，并自动建造一处空地。停留时可征用对手地产。':esc(tile.special?.description)}</p>${tile.special?.type==='bank'?`<div class="property-price">${money(state.bankPool)}<small>${state.bankPool>=200?'金库已满 · 下位来客全部提走':'金库积累中 · ¥200 起可提'}</small></div>`:''}`;
    }
    inspector.insertAdjacentHTML('beforeend',`<button class="inspect-building-btn" type="button" data-inspect-building="${tile.index}">近看建筑 <span aria-hidden="true">↗</span></button>`);
    inspector.querySelector('[data-inspect-building]').disabled=!window.CityScene?.inspectTile||(state.busy&&!preview);
  }
  function update() {
    if(!state.players)return;
    const inMenu=!document.getElementById('start-screen').classList.contains('hidden');
    document.body.classList.toggle('mode-start',inMenu);
    document.body.classList.toggle('mode-showcase',preview&&!inMenu);
    document.body.classList.toggle('ai-turn',!inMenu&&!state.gameOver&&document.body.dataset.turn==='ai');
    const map=getMapConfig(state.currentMapId),guide=mapGuides[map.id];
    document.body.dataset.map=inMenu?selectedMapId:map.id;
    mapGuide.hidden=inMenu||!guide;
    if(guide){
      document.getElementById('map-guide-title').textContent=guide.title;
      document.getElementById('map-guide-copy').textContent=guide.copy;
      const opening=document.getElementById('map-opening-copy');
      opening.hidden=preview||!state.openingLots?.length;
      opening.textContent=opening.hidden?'':`本局开业：${state.openingLots.map(i=>state.board[i]?.name).filter(Boolean).join('、')}。`;
    }
    const routeButton=document.getElementById('showcase-route-btn');
    routeButton.hidden=!preview||!state.board.some(t=>t.special?.type==='rush');
    routeButton.textContent=map.id==='expansion'?'城市快线':'冲刺追租';
    document.querySelectorAll('#start-map-options [data-map-id]').forEach(button=>{
      const option=getMapConfig(button.dataset.mapId);
      button.querySelector('.map-option-meta').textContent=`${option.routePositions.length} 格 · ${getMaxRounds(option.id)} 回合`;
    });
    showcaseControls.classList.toggle('hidden',!preview||inMenu);
    document.getElementById('showcase-open-btn').classList.toggle('hidden',!preview);
    if(lastCameraSession!==state.sessionId){lastCameraSession=state.sessionId;inspectorKey='';mapGuide.open=false;}
    document.getElementById('victory-rule').textContent=preview?`${map.name} · 示例局面`:state.gameMode==='bankruptcy'?'破产淘汰 · 坚持到最后':`${getMaxRounds()} 回合后，现金最多者获胜`;
    document.getElementById('scene-caption-text').textContent=preview?'演出预览 · 每一笔钱都经过真实规则结算':state.phase==='presenting'?'好戏正在发生':state.animation.diceRolling?'骰子停下前，一切都有可能':'轻点地块，看看这是谁的地盘';
    updateCash();updateInspector();syncCityScene();
    inspector.querySelectorAll('[data-inspect-building]').forEach(button=>{button.disabled=!window.CityScene?.inspectTile||(state.busy&&!preview);});
    const m=state.modal,tile=state.board[currentPlayer().position];
    if(m.visible&&tile?.lot&&['购买提示','升级提示'].includes(m.label)) {
      const owner=tile.lot.ownerId, rent=rentFor(tile), next=tile.lot.buildCosts[tile.lot.level+1];
      const remaining=currentPlayer().cash-(owner?(next||0):tile.lot.price);
      propertyPreview.innerHTML=`<div class="event-property-grid"><div><small>${owner?'当前街区租金':'基础过路费'}</small><b>${money(owner?rent.total:tile.lot.tolls[tile.lot.level])}</b></div><div><small>操作后现金</small><b>${money(Math.max(0,remaining))}</b></div></div>${window.CityScene?.inspectTile?`<button class="inspect-building-btn" type="button" data-inspect-building="${tile.index}" data-inspect-level="3">看看满级建筑 <span aria-hidden="true">↗</span></button>`:''}`;
    } else propertyPreview.innerHTML='';
    if(preview) {rollBtn.disabled=true;document.querySelectorAll('[data-showcase]').forEach(b=>b.disabled=previewBusy);}
  }
  function inferEvent(cfg) {
    const text=`${cfg.title||''} ${cfg.message||''}`,tile=state.board[currentPlayer().position];
    const named=state.board.find(t=>!t.isLargeSecondary&&text.includes(t.name));
    const target=named||tile, to=person(currentPlayer());
    let type='notice';
    if(cfg.label==='破产救助'||cfg.label==='等待救援')type='relief';
    else if(/征用成功|发动征用|地标易主/.test(text))type='seize';
    else if(/免费升级|免费建造|升级了|升至|升级到|建造完成/.test(text))type='build';
    else if(/买下了|购买完成/.test(text))type='buy';
    else if(/金库|提款/.test(text))type='bank';
    else if(['卡牌效果','翻牌事件','绊脚效果','骰6再动'].includes(cfg.label))type='card';
    else if(/收益|补给|获得|奖励/.test(text))type='income';
    const value=Number((text.match(/¥([\d,]+)/)||[])[1]?.replaceAll(',',''))||0;
    return {type,title:cfg.title,message:cfg.message,amount:value,to,tiles:target?[target.index]:[],tileName:target?.name,...cfg.drama};
  }
  async function present(cfg) {
    const sid=state.sessionId,serial=++eventSerial,event=inferEvent(cfg);
    if(event.tiles?.length)selected=event.tiles[0];
    state.modal=defaultModal();state.phase='presenting';state.busy=true;
    state.statusTitle=cfg.title||'好戏正在发生';state.statusDescription=cfg.message||'';
    event.from=person(event.from);event.to=person(event.to);event.sessionId=sid;
    flushQueuedCashAnimations();render();
    try {
      if(window.GameDrama) await window.GameDrama.play(event);
      else await sleep(900);
    } catch(error) {console.warn('事件演出已跳过',error);}
    if(!isSessionActive(sid)||serial!==eventSerial)return;
    state.phase='locked';state.busy=true;render();
  }
  function onReset() {eventSerial++;selected=null;inspectorKey='';previewBusy=false;if(!preparingPreview)preview=false;document.body.classList.remove('selecting-target');}
  function celebrate(winner,tied) {
    if(preview)return;
    void window.GameDrama?.play({type:'win',title:tied?'这局，平分秋色！':`${winner.name}，笑到最后！`,message:getWinnerText(),amount:winner.cash,to:person(winner),tiles:[],sessionId:state.sessionId});
  }
  function setupShowcase() {
    showcaseMapId=selectedMapId;
    preparingPreview=true;preview=true;
    try {initializeGame(showcaseMapId);} finally {preparingPreview=false;}
    hideStartScreen();
    state.gameMode='rounds';state.round=Math.min(18,getMaxRounds());state.phase='locked';state.busy=true;
    const lots=state.board.filter(t=>t.lot&&!t.isLargeSecondary);
    lots.forEach((t,i)=>{t.lot.ownerId=i%3===0?'human':'ai';t.lot.level=i%3+1;});
    const hero=lots.find(t=>t.lot.effectId==='tower_bonus')||lots.find(t=>t.lot.isLarge)||lots[0];
    const district=lots.filter(t=>t.lot.district===hero.lot.district);
    district.forEach(t=>{t.lot.ownerId='ai';t.lot.level=3;});
    const build=lots.find(t=>t.lot.effectId==='finance_bonus')||hero;
    showcaseTargets={rent:hero.index,build:build.index,district:district.map(t=>t.index)};
    state.players[0].cash=2600;state.players[0].displayedCash=2600;state.players[0].position=hero.index;
    state.players[1].cash=980;state.players[1].displayedCash=980;state.players[1].position=lots[lots.length-2].index;
    selected=hero.index;
    state.statusTitle='看看，一笔租金能发生什么';state.statusDescription='选择下方的事件，观看这座小城的高光时刻。';
    state.logs=[];pushLog('演出预览：这是示例局面，不计入对局战绩。');render();
  }
  async function runShowcase(type) {
    if(previewBusy)return;
    setupShowcase();previewBusy=true;render();const sid=state.sessionId;
    const human=state.players[0],ai=state.players[1];
    if(type==='shield')human.effects.shield=true;
    if(type==='relief'){human.cash=150;human.displayedCash=150;}
    try {
      if(type==='seize'){
        showcaseTargets.district.forEach(i=>{state.board[i].lot.ownerId='human';});ai.position=0;state.currentPlayerIndex=1;render();
        await resolveStartTakeover(ai,sid);
      } else if(type==='build'){
        const tile=state.board[showcaseTargets.build];tile.lot.ownerId='human';tile.lot.level=1;human.position=tile.index;render();
        await sleep(250);if(!isSessionActive(sid))return;
        buildLot(human,tile);render();
        await present({title:`${tile.name}，焕然一新`,message:'Lv.1 → Lv.2，下一笔租金更值得期待。',drama:{type:'build',amount:tile.lot.buildCosts[2],to:human,tiles:[tile.index],tileName:tile.name}});
      } else if(type==='route'){
        const station=state.board.find(t=>t.special?.type==='rush');
        if(station){human.position=station.index;selected=station.index;render();await resolveLanding(human,station,sid);}
      } else {render();await resolveLanding(human,state.board[showcaseTargets.rent],sid);}
    } finally {
      if(isSessionActive(sid)){previewBusy=false;state.busy=true;state.phase='locked';state.statusTitle='这一幕，发生在你的下一局';state.statusDescription='可以继续看另一场好戏，或开始正式对局。';render();}
    }
  }
  window.GamePresentation={update,updateCash,present,onReset,celebrate,rentFor,syncCityScene,selectCurrentTile:()=>{if(state.players)selectTile(currentPlayer().position);}};
  function inspectBuilding(event) {
    const button=event.target.closest('[data-inspect-building]');
    if(button&&!button.disabled&&(!state.busy||preview))window.CityScene?.inspectTile(Number(button.dataset.inspectBuilding),button.dataset.inspectLevel?Number(button.dataset.inspectLevel):undefined);
  }
  inspector.addEventListener('click',inspectBuilding);
  propertyPreview.addEventListener('click',inspectBuilding);
  window.addEventListener('city:ready',()=>{syncCityScene();render();});
  window.addEventListener('city:select',e=>selectTile(e.detail.index));
  document.getElementById('start-showcase-btn').addEventListener('click',setupShowcase);
  document.getElementById('showcase-open-btn').addEventListener('click',setupShowcase);
  document.getElementById('showcase-exit-btn').addEventListener('click',()=>void startNewGame());
  showcaseControls.addEventListener('click',e=>{const b=e.target.closest('[data-showcase]');if(b)void runShowcase(b.dataset.showcase);});
  document.getElementById('restart-btn').addEventListener('click',update);
  document.getElementById('start-map-options').addEventListener('click',()=>{menuSnapshot=null;syncCityScene();});
  window.GameDrama?.setMuted(!soundState.enabled);
  initializeGame();update();
})();
