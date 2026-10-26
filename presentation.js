/* Presentation adapter: consumes real game state; map, dice, cash and card rules stay in game.js. */
(() => {
  const inspector = document.getElementById('property-inspector');
  const emptyInspector = inspector.innerHTML;
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
  const mobileQuery = window.matchMedia('(max-width: 820px) and (orientation: portrait), (max-width: 600px)');
  const sidebar = document.querySelector('.sidebar');
  const sheetBackdrop = document.getElementById('mobile-sheet-backdrop');
  let sheetReturnFocus = null;
  let harborProjectPanel = null, openHarborProjectId = null, harborProjectPanelKey = '', harborProjectReturnFocus = null;
  function closeMobilePanel() {
    if (!document.body.classList.contains('mobile-sheet-open')) return;
    document.body.classList.remove('mobile-sheet-open');
    delete sidebar.dataset.panel;
    sheetBackdrop.hidden = true;
    document.querySelectorAll('[data-mobile-panel]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
    document.querySelector('.board-section').inert=false;document.querySelector('.topbar').inert=false;
    if (sheetReturnFocus?.isConnected) sheetReturnFocus.focus({preventScroll:true});
    sheetReturnFocus = null;
  }
  function openMobilePanel(panel, trigger) {
    if (!mobileQuery.matches) return;
    sheetReturnFocus = trigger || document.activeElement;
    sidebar.dataset.panel = panel;
    document.getElementById('mobile-sheet-title').textContent = {assets:'资产对比',property:'地块信息',rules:'游戏规则'}[panel];
    if (panel === 'rules') sidebar.querySelector('.rules').open = true;
    document.body.classList.add('mobile-sheet-open');
    sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-labelledby','mobile-sheet-title');
    document.querySelector('.board-section').inert=true;document.querySelector('.topbar').inert=true;
    sheetBackdrop.hidden = false;
    document.querySelectorAll('[data-mobile-panel]').forEach(button => button.setAttribute('aria-expanded', String(button.dataset.mobilePanel === panel)));
    document.getElementById('mobile-sheet-close').focus({preventScroll:true});
  }
  const mapGuide = document.getElementById('map-guide');
  const mapGuides = {
    classic: {title:'经典环线 · 22 格',copy:'同街区地产连锁收租。'},
    compact: {title:'紧凑冲突 · 18 格',copy:'冲刺站再走 2–8 格，传送港直达地产。'},
    expansion: {title:'都市大环线 · 28 格',copy:'六街区各有一处 Lv.1 开业地产。城市快线再走 3–5 格。'},
    harbor: {title:'潮汐港湾 · 三岛 34 格',copy:'中央地标 · 商贸岛 · 度假岛'},
    alpine: {title:'云岭温泉 · 24 格',copy:'缆车再走 2–4 格，温泉可让对手休息一回合。'},
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
    return {sessionId:state.sessionId,mapId:state.currentMapId,board:state.board,players:state.players.map(player=>({...player,harborJourney:getHarborJourney(player)})),
      currentPlayerId:currentPlayer().id,phase:state.phase,animation:state.animation,lastDice:state.lastDice,
      diceFaces:state.lastDiceFaces,harborJourney:getHarborJourney(currentPlayer()),harborProjects:globalThis.GameHarborProjects?.getSnapshot?.()||[],
      bankPool:state.bankPool,gameOver:state.gameOver,grid:map.grid,navigation:map.navigation,
      routeChoice:state.modal?.visible && state.modal.routeChoice ? {playerId:currentPlayer().id,tileIndex:currentPlayer().position} : null,
      nextSteps:Object.fromEntries(state.players.map(player=>[player.id,getNextTileIndex(player,player.position,player.effects?.reversed?-1:1,false)])),
      selectedTile:selected,targetSelection:state.modal?.visible && state.modal.boardTargets?.length ? {kind:'property',indices:state.modal.boardTargets} : state.modal?.visible && state.modal.boardContext ? {kind:'property',indices:state.modal.boardContext.indices,suspended:true} : state.targetSelection,districtColors:map.districtColors,
      rents:Object.fromEntries(state.board.filter(t=>t.lot).map(t=>[t.index,rentFor(t).total])),
      purchasePrices:Object.fromEntries(state.board.filter(t=>t.lot).map(t=>[t.index,getLotPurchasePrice(t.lot)]))};
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
          grid:map.grid,navigation:map.navigation,rents:{},animation:{},phase:'preview',selectedTile:null,routeChoice:null,harborProjects:[],gameOver:false};
      }
      window.CityScene.update(menuSnapshot);
    } else window.CityScene.update(snapshot());
  }
  function updateCash() {
    if (!state.players) return;
    state.players.forEach(p=>{
      document.querySelectorAll(`[data-player-anchor="${p.id}"]`).forEach(card=>{
        const value=card.querySelector('.player-cash-value,.mini-cash,.asset-cash-value');
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
  function closeHarborProject(restoreFocus=true){
    if(harborProjectPanel)harborProjectPanel.hidden=true;
    document.querySelectorAll('[data-harbor-project]').forEach(button=>button.setAttribute('aria-expanded','false'));
    openHarborProjectId=null;harborProjectPanelKey='';
    if(restoreFocus&&harborProjectReturnFocus?.isConnected)harborProjectReturnFocus.focus({preventScroll:true});
    harborProjectReturnFocus=null;
  }
  function refreshHarborProjectPanel(){
    if(!openHarborProjectId)return;
    const project=(globalThis.GameHarborProjects?.getSnapshot?.()||[]).find(project=>project.id===openHarborProjectId);
    if(!project||document.body.classList.contains('mode-start')){closeHarborProject(false);return;}
    const lots=project.indices.map(index=>state.board[index]).filter(Boolean);
    const key=JSON.stringify([state.sessionId,project,lots.map(tile=>[tile.name,tile.lot?.ownerId,tile.lot?.level])]);
    if(key===harborProjectPanelKey)return;harborProjectPanelKey=key;
    harborProjectPanel.innerHTML=`<header><div><small>我的建设度 · ${project.points}/${project.maxPoints}</small><h2 id="harbor-project-title">${esc(project.name)}</h2></div><button type="button" data-harbor-project-close aria-label="关闭建设详情">×</button></header><div class="harbor-project-lots">${lots.map(tile=>{const owned=tile.lot?.ownerId==='human',level=owned?tile.lot.level:0;return `<button type="button" data-harbor-locate="${tile.index}" data-owned="${owned}" aria-label="定位${esc(tile.name)}，${owned?`我的建筑 ${level} 级`:'未拥有，贡献 0 级'}"><span>${esc(tile.name)}</span><b>Lv.${level}</b><i aria-hidden="true">↗</i></button>`;}).join('')}</div><ol class="harbor-project-rewards">${project.rewards.map(reward=>`<li data-earned="${Boolean(reward.earned)}"><small>${reward.threshold} 级</small><b>${esc(reward.label)}</b><span>${reward.earned?(reward.stage===3?'结算带回':'已获得'):'未达成'}</span></li>`).join('')}</ol>`;
  }
  function openHarborProject(id){
    if(!(globalThis.GameHarborProjects?.getSnapshot?.()||[]).some(project=>project.id===id))return;
    if(!harborProjectPanel){
      harborProjectPanel=document.createElement('section');harborProjectPanel.id='harbor-project-panel';harborProjectPanel.className='harbor-project-panel';harborProjectPanel.hidden=true;
      harborProjectPanel.setAttribute('role','dialog');harborProjectPanel.setAttribute('aria-modal','false');harborProjectPanel.setAttribute('aria-labelledby','harbor-project-title');
      document.getElementById('board-stage').appendChild(harborProjectPanel);
      harborProjectPanel.addEventListener('click',event=>{
        if(event.target.closest('[data-harbor-project-close]')){closeHarborProject();return;}
        const button=event.target.closest('[data-harbor-locate]');if(!button)return;
        window.CityScene?.locateTile(Number(button.dataset.harborLocate));closeHarborProject(false);
      });
      harborProjectPanel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeHarborProject();}});
    }
    harborProjectReturnFocus=document.activeElement;openHarborProjectId=id;harborProjectPanelKey='';refreshHarborProjectPanel();harborProjectPanel.hidden=false;
    document.querySelectorAll('[data-harbor-project]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.harborProject===id)));
    harborProjectPanel.querySelector('[data-harbor-project-close]').focus({preventScroll:true});
  }
  function effectText(lot) {
    const bonus=EFFECT_BONUS_TABLES[lot?.effectId];
    if(bonus)return `地主自己停在这里时领 ${[1,2,3].map(level=>`${level} 级 ${money(bonus[level])}`).join('、')}`;
    return lot?.effectId==='hot_spring_rest'?'别人停在这里，下回合要休息':'';
  }
  function tileGuideText(tile,economy=getMapEconomy()) {
    if(tile.isStart)return `路过领 ${money(economy.startBonus)}，并随机把你一块空地免费盖到 1 级；停在这里抽一张买地卡或卖地卡。`;
    const special=tile.special||{};
    return ({
      bank:`攒到 ${money(economy.bankThreshold)} 以后，停在这里的人全部取走；没攒够时要掷骰往里存钱。`,
      construction:'随机给自己加盖一处，或者随机拆对手一处。',
      card_draw:'三张道具卡选一张放进背包，掷骰前可以用。',
      chance:'花钱买一张道具卡，每次最多一张。',
      rush:special.rushMin?`再往前冲 ${special.rushMin} 到 ${special.rushMax} 格，停下的地方照常处理。`:'',
      teleport:special.settleArrival?'随机送到一块地产，到了照常买地或交租。':'随机送到一块地产，到了不交租也不能买。',
    })[special.type]||special.description||'';
  }
  let rulesGuideKey='';
  function renderRulesGuide(map) {
    const box=document.getElementById('rules-tile-guide');if(!box||!state.board)return;
    const economy=getMapEconomy(),key=JSON.stringify([map.id,state.board.length,economy.startBonus,economy.bankThreshold]);
    if(key===rulesGuideKey)return;rulesGuideKey=key;
    const groups=new Map();
    for(const tile of state.board) {
      if(tile.isLargeSecondary)continue;
      const kind=tile.isStart?'start':tile.special?.type?`special:${tile.special.type}`:tile.lot?.effectId?`effect:${tile.lot.effectId}`:'';
      if(!kind)continue;
      if(!groups.has(kind))groups.set(kind,{names:[],text:tile.lot?effectText(tile.lot):tileGuideText(tile,economy)});
      const group=groups.get(kind);if(!group.names.includes(tile.name))group.names.push(tile.name);
    }
    const rows=[...groups.values()].filter(group=>group.text).map(group=>`<li><b>${esc(group.names.join('、'))}</b>${esc(group.text.replace(/。$/,''))}。</li>`);
    box.innerHTML=rows.length?`<p class="panel-label">格子说明</p><ul>${rows.join('')}</ul>`:'';
  }
  function updateInspector() {
    const tile=state.board?.[selected];if(!tile)return;
    const lot=tile.lot,owner=lot?.ownerId?getPlayerById(lot.ownerId):null,rent=rentFor(tile),economy=getMapEconomy();
    const key=JSON.stringify([tile.index,lot?.ownerId,lot?.level,rent.total,state.bankPool]);
    if(key===inspectorKey)return;inspectorKey=key;
    if(lot){
      const mates=lot.district?state.board.filter(t=>t.lot&&!t.isLargeSecondary&&t.lot.district===lot.district):[];
      const effect=effectText(lot);
      inspector.innerHTML=`<p class="panel-label">${esc(lot.district||'地产手册')}</p><h2>${esc(tile.name)}</h2><div class="property-meta"><span>${owner?(owner.id==='human'?'你的地产':'对手地产'):'待售'}</span><span>${lot.level===0?'空地':`Lv.${lot.level}`}</span>${lot.isLarge?'<span>占据 2 格</span>':''}</div><div class="property-price">${money(owner?rent.total:getLotPurchasePrice(lot))} <small>${owner?'街区租金':'购买价格'}</small></div>${owner?`<div class="property-breakdown">${rent.lots.map(t=>`${esc(t.name)} ${money(t.lot.tolls[t.lot.level])}`).join(' ＋ ')}<br>街区合计 ${money(rent.base)} × ${rent.multiplier}</div>`:''}<p class="property-rents">租金${lot.tolls.map((value,level)=>`<span${level===lot.level?' class="is-current"':''}>${level===0?'空地':`${level} 级`} ${money(value)}</span>`).join('')}</p>${mates.length>1?`<p class="property-district">同街区${mates.map(t=>`<span class="${[t.lot.ownerId==='human'?'is-human':t.lot.ownerId?'is-ai':'',t.lot===lot?'is-self':''].join(' ').trim()}">${esc(t.name)}</span>`).join('')}</p>`:''}<p class="property-note">${!owner&&lot.level>0?`买下保留 Lv.${lot.level} 建筑。`:lot.level<3?`升级到 Lv.${lot.level+1}：${money(lot.buildCosts[lot.level+1])}`:'已达最高等级。'}${effect?`<br>${effect}。`:''}</p>`;
    } else {
      inspector.innerHTML=`<p class="panel-label">城市特别地标</p><h2>${esc(tile.name)}</h2><div class="inspector-special">${tile.isStart?'⚑':({bank:'◈',card_draw:'▣',chance:'✦',construction:'⚒',teleport:'◎',rush:'↗',junction:'∞'}[tile.special?.type]||'✦')}</div><p class="property-note">${esc(tileGuideText(tile,economy))}</p>${tile.special?.type==='bank'?`<div class="property-price">${money(state.bankPool)}<small>${state.bankPool>=economy.bankThreshold?'金库已满 · 停留可全部提取':`金库积累中 · ${money(economy.bankThreshold)} 起可提`}</small></div>`:''}`;
    }
    if(!lot||lot.level>0){
      inspector.insertAdjacentHTML('beforeend',`<button class="inspect-building-btn" type="button" data-inspect-building="${tile.index}">近看建筑 <span aria-hidden="true">↗</span></button>`);
      inspector.querySelector('[data-inspect-building]').disabled=!window.CityScene?.inspectTile||(state.busy&&!preview);
    }
  }
  function update() {
    if(!state.players)return;
    const inMenu=!document.getElementById('start-screen').classList.contains('hidden');
    if(inMenu||state.modal.visible||state.phase==='presenting'){closeMobilePanel();window.GameCardBag?.close();}
    window.GameCardBag?.refresh();
    document.body.classList.toggle('mode-start',inMenu);
    document.body.classList.toggle('mode-showcase',preview&&!inMenu);
    document.body.classList.toggle('ai-turn',!inMenu&&!state.gameOver&&document.body.dataset.turn==='ai');
    const map=getMapConfig(state.currentMapId),guide=mapGuides[map.id];
    document.body.dataset.map=inMenu?selectedMapId:map.id;
    updateHarborControls(inMenu);
    mapGuide.hidden=inMenu||!guide;
    if(guide){
      document.getElementById('map-guide-title').textContent=guide.title;
      const economy=getMapEconomy(map.id);
      document.getElementById('map-guide-copy').textContent=guide.copy;
      const opening=document.getElementById('map-opening-copy');
      opening.hidden=preview||!state.openingLots?.length;
      opening.textContent=opening.hidden?'':`本局开业：${state.openingLots.map(i=>state.board[i]?.name).filter(Boolean).join('、')}。`;
    }
    const routeButton=document.getElementById('showcase-route-btn');
    routeButton.hidden=!preview||!state.board.some(t=>t.special?.type==='rush');
    routeButton.textContent=map.id==='expansion'?'城市快线':map.id==='alpine'?'缆车穿城':'冲刺移动';
    document.querySelectorAll('#start-map-options [data-map-id]').forEach(button=>{
      const option=getMapConfig(button.dataset.mapId);
      button.querySelector('.map-option-meta').textContent=`${getMaxRounds(option.id)} 回合`;
    });
    showcaseControls.classList.toggle('hidden',!preview||inMenu);
    document.getElementById('showcase-open-btn').classList.toggle('hidden',!preview);
    if(lastCameraSession!==state.sessionId){lastCameraSession=state.sessionId;inspectorKey='';mapGuide.open=false;closeHarborProject(false);}
    document.getElementById('victory-rule').textContent='';
    document.getElementById('rules-victory').textContent=state.gameMode==='bankruptcy'?'对手破产时，你获胜。':`打完 ${getMaxRounds()} 回合，现金更多的一方获胜。`;
    renderRulesGuide(map);
    updateCash();updateInspector();syncCityScene();refreshHarborProjectPanel();
    inspector.querySelectorAll('[data-inspect-building]').forEach(button=>{button.disabled=!window.CityScene?.inspectTile||(state.busy&&!preview);});
    const m=state.modal,tile=state.board[m.propertyOffer?.tileIndex];
    if(m.visible&&tile?.lot&&m.propertyOffer) {
      const lot=tile.lot,action=m.propertyOffer.action,upgrading=action==='build';
      const municipal=action==='municipalBuy'||action==='municipalSell';
      const price=municipal?getCityTakeoverQuote(lot).purchasePrice:upgrading?lot.buildCosts[lot.level+1]:getLotPurchasePrice(lot);
      const priceLabel=action==='municipalSell'?'原主获补偿':action==='municipalBuy'?'买入价':upgrading?'升级费用':'售价';
      const rent=upgrading?`${money(lot.tolls[lot.level])} → ${money(lot.tolls[lot.level+1])}`:money(lot.tolls[lot.level]);
      propertyPreview.innerHTML=`<div class="property-offer-price"><span>${priceLabel}</span><strong>${money(price)}</strong></div><p class="property-offer-rent">基础租金 <span>${rent}</span></p>`;
    } else propertyPreview.innerHTML='';
    if(preview) {rollBtn.disabled=true;document.querySelectorAll('[data-showcase]').forEach(b=>b.disabled=previewBusy||state.cardUsePending);}
  }
  function updateHarborControls(inMenu){
    if(selectedMapId==='harbor'||state.currentMapId==='harbor')ensureHarborDiagram();
    const diagram=document.getElementById('harbor-route-diagram');if(diagram)diagram.hidden=state.currentMapId!=='harbor';
    const journey=getHarborJourney(currentPlayer());
    if(diagram&&journey){
      diagram.dataset.phase=journey.phase;
      diagram.querySelectorAll('[data-route-edge]').forEach(line=>{
        const direction=line.dataset.branch==='shared'?journey.centralDirection:journey.travelDirection;
        const a=direction<0?'b':'a',b=direction<0?'a':'b';
        for(const [target,point] of [['1',a],['2',b]])for(const axis of ['x','y'])line.setAttribute(axis+target,line.dataset[point+axis]);
        if(line.dataset.branch==='shared')line.setAttribute('stroke',journey.phase==='red'?'#d75f63':'#d6a632');
      });
    }
  }
  let harborDiagramLoading=false;
  async function ensureHarborDiagram(){
    if(harborDiagramLoading||document.getElementById('harbor-route-diagram'))return;
    const map=getMapConfig('harbor');if(!map.navigation?.edges)return;
    harborDiagramLoading=true;
    try{
      const {harborStreetPosition}=await import('./scene-harbor-paths.js?v=20261025-harbor-main-island1');
      const positions=map.routePositions.map((p,index)=>harborStreetPosition({...p,index}));
      const minX=Math.min(...positions.map(p=>p.x)),maxX=Math.max(...positions.map(p=>p.x));
      const minY=Math.min(...positions.map(p=>p.y)),maxY=Math.max(...positions.map(p=>p.y));
      const scale=Math.min(258/Math.max(1,maxX-minX),213/Math.max(1,maxY-minY));
      const xy=i=>({x:145+(positions[i].x-(minX+maxX)/2)*scale,y:122.5+(positions[i].y-(minY+maxY)/2)*scale});
      const path=map.navigation.edges.map(edge=>{const a=xy(edge.from),b=xy(edge.to);return `<line data-route-edge data-branch="${edge.branch}" data-ax="${a.x}" data-ay="${a.y}" data-bx="${b.x}" data-by="${b.y}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${edge.branch==='merchant'?'#c49155':edge.branch==='resort'?'#6e9db5':'#d75f63'}" stroke-width="3" marker-end="url(#harbor-route-arrow)"/>`;}).join('');
      mapGuide.insertAdjacentHTML('beforeend',`<div id="harbor-route-diagram"${state.currentMapId==='harbor'?'':' hidden'}><svg class="harbor-route-diagram" viewBox="0 0 290 245" role="img" aria-label="红黄航线自动轮换，每圈经过左右两岛，中央道路交替方向"><defs><marker id="harbor-route-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="#688578"/></marker></defs>${path}${positions.map((p,i)=>`<circle cx="${xy(i).x}" cy="${xy(i).y}" r="${i===0?5:[5,10,33].includes(i)?3.8:2.7}" fill="${i===0?'#e7b85b':[5,10,33].includes(i)?'#bda0d1':'#fffbeb'}" stroke="#647f71"/>`).join('')}</svg></div>`);
      updateHarborControls(document.body.classList.contains('mode-start'));
    }finally{harborDiagramLoading=false;}
  }
  window.addEventListener('town:embark',event=>{openDepartureMenu(MAP_PRESETS[event.detail?.mapId] ? event.detail.mapId : 'harbor');});
  function inferEvent(cfg) {
    const text=`${cfg.title||''} ${cfg.message||''}`,tile=state.board[currentPlayer().position];
    const named=state.board.find(t=>!t.isLargeSecondary&&text.includes(t.name));
    const target=named||tile, to=person(currentPlayer());
    let type='notice';
    if(cfg.label==='先手决定')type='notice';
    else if(cfg.label==='破产救助'||cfg.label==='等待救援')type='relief';
    else if(/征用成功|发动征用|地标易主/.test(text))type='seize';
    else if(/免费升级|免费建造|升级了|升至|升级到|建造完成/.test(text))type='build';
    else if(/买下了|购买完成/.test(text))type='buy';
    else if(/金库|提款/.test(text))type='bank';
    else if(['卡牌效果','翻牌事件','绊脚效果','骰6再动'].includes(cfg.label))type='card';
    else if(/收益|补给|获得|奖励/.test(text))type='income';
    const value=Number((text.match(/¥([\d,]+)/)||[])[1]?.replaceAll(',',''))||0;
    const event={type,title:cfg.title,message:cfg.message,amount:value,to,tiles:target?[target.index]:[],tileName:target?.name,...cfg.drama};
    // The blocked landlord and the buyer's opponent can answer in the banter.
    if(event.type==='shield'&&!event.from&&!event.rival) {
      const ownerId=state.board[event.tiles?.[0]]?.lot?.ownerId;
      if(ownerId&&ownerId!==event.to?.id)event.rival=person(getPlayerById(ownerId));
    }
    // Read the settled ledger, never infer a player's balance from the animation.
    const payerId=event.type==='seize'&&event.acquisition?event.to?.id:event.from?.id;
    const payer=payerId?getPlayerById(payerId):null;
    const recipient=event.to?.id?getPlayerById(event.to.id):null;
    if(payer)event.payerCashAfter=payer.cash;
    if(recipient)event.cashAfter=recipient.cash;
    // In a takeover from/to names describe ownership, not a cash transfer.
    // A legacy requisition has no purchase price even if its copy mentions a refund.
    if(event.type==='seize') {
      if(!event.acquisition)event.amount=0;
      const previousOwner=event.from?.id?getPlayerById(event.from.id):null;
      if(previousOwner)event.sellerCashAfter=previousOwner.cash;
    }
    if(event.type==='buy') {
      if(recipient)event.rival=person(getOpponent(recipient));
      const purchased=state.board[event.tiles?.[0]];
      const primary=purchased?.isLargeSecondary?state.board[purchased.largePrimaryIndex]:purchased;
      if(primary?.lot) {
        event.tileName=primary.name;
        event.isLarge=!!primary.lot.isLarge;
        event.buildingLevel=primary.lot.level;
        event.isOpeningBuilding=primary.lot.level>0&&!!state.openingLots?.includes(primary.index);
        event.districtCount=getDistrictOwnerLots(primary.lot.district,recipient?.id||primary.lot.ownerId).length;
      }
    }
    return event;
  }
  async function present(cfg) {
    const sid=state.sessionId,serial=++eventSerial,event=inferEvent(cfg);
    if(event.tiles?.length)selected=event.tiles[0];
    state.modal=defaultModal();state.phase='presenting';state.busy=true;
    state.statusTitle=cfg.title||'事件结算';state.statusDescription=cfg.message||'';
    event.from=person(event.from);event.to=person(event.to);event.actor=person(event.actor);event.rival=person(event.rival);
    if(Array.isArray(event.beneficiaries))event.beneficiaries=event.beneficiaries.map(person).filter(Boolean);
    event.sessionId=sid;
    flushQueuedCashAnimations();render();
    try {
      if(window.GameDrama) await window.GameDrama.play(event);
      else await sleep(900);
    } catch(error) {console.warn('事件演出已跳过',error);}
    if(!isSessionActive(sid)||serial!==eventSerial)return;
    state.phase='locked';state.busy=true;render();
  }
  function onReset() {eventSerial++;selected=null;inspectorKey='';inspector.innerHTML=emptyInspector;previewBusy=false;if(!preparingPreview)preview=false;document.body.classList.remove('selecting-target');closeMobilePanel();closeHarborProject(false);window.GameCardBag?.close();}
  async function celebrate(winner,tied) {
    if(preview)return;
    const sid=state.sessionId;
    await window.GameDrama?.play({type:'win',title:tied?'本局平局':`${winner.name} 获胜`,message:getWinnerText(),amount:winner.cash,to:person(winner),tiles:[],sessionId:sid});
    if(!isSessionActive(sid))return;
    window.GameProgression?.showResult(state.citySettlement,{onReplay:()=>openDepartureMenu(state.currentMapId),onHome:()=>openDepartureMenu()});
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
    state.statusTitle='玩法演示';state.statusDescription='';
    state.logs=[];pushLog('演示不消耗门票，不计入战绩或收益。');render();
  }
  async function runShowcase(type) {
    if(previewBusy||state.cardUsePending)return;
    setupShowcase();previewBusy=true;render();const sid=state.sessionId;
    const human=state.players[0];
    if(type==='cards'){
      state.currentPlayerIndex=0;state.busy=false;state.phase='await_roll';previewBusy=false;
      ['shield','launch','reverse','doubleRent'].forEach(id=>window.GameCards?.grant('human',id,{type:'showcase'}));
      state.statusTitle='卡牌演示';state.statusDescription='';
      render();window.GameCardBag?.open();return;
    }
    if(type==='shield')human.effects.shield=true;
    if(type==='relief'){human.cash=150;human.displayedCash=150;}
    try {
      if(type==='draw'){
        const station=state.board.find(t=>t.special?.type==='card_draw');
        if(station){human.position=station.index;selected=station.index;state.currentPlayerIndex=0;render();await resolveCardDraw(human,sid);}
      } else if(type==='seize'){
        human.position=0;state.currentPlayerIndex=0;selected=0;
        state.statusTitle='领取市政卡';state.statusDescription='';render();
        await resolveStartTakeover(human,sid);
      } else if(type==='buy'){
        const tile=state.board[showcaseTargets.build];
        tile.lot.ownerId=null;tile.lot.level=state.openingLots?.includes(tile.index)?1:0;
        human.position=tile.index;selected=tile.index;render();
        await sleep(250);if(!isSessionActive(sid))return;
        if(buyLot(human,tile)) {
          render();
          await present({label:'购买完成',title:`已购买 ${tile.name}`,message:'',drama:{type:'buy',amount:getLotPurchasePrice(tile.lot),to:human,tiles:[tile.index],tileName:tile.name}});
        }
      } else if(type==='build'){
        const tile=state.board[showcaseTargets.build];tile.lot.ownerId='human';tile.lot.level=1;human.position=tile.index;render();
        await sleep(250);if(!isSessionActive(sid))return;
        buildLot(human,tile);render();
        await present({title:`${tile.name} 升至 Lv.2`,message:`支付 ${money(tile.lot.buildCosts[2])}，基础租金提高至 ${money(tile.lot.tolls[2])}。`,drama:{type:'build',amount:tile.lot.buildCosts[2],to:human,tiles:[tile.index],tileName:tile.name}});
      } else if(type==='chance'){
        const plaza=state.board.find(t=>t.special?.type==='chance');
        if(plaza){human.position=plaza.index;selected=plaza.index;render();await resolveLanding(human,plaza,sid);}
      } else if(type==='route'){
        const station=state.board.find(t=>t.special?.type==='rush');
        if(station){human.position=station.index;selected=station.index;render();await resolveLanding(human,station,sid);}
      } else {render();await resolveLanding(human,state.board[showcaseTargets.rent],sid);}
    } finally {
      if(isSessionActive(sid)){const receivedCard=type==='draw'||type==='seize';previewBusy=false;state.busy=!receivedCard;state.phase=receivedCard?'await_roll':'locked';state.statusTitle=receivedCard?'卡牌已入包':'演示结束';state.statusDescription='';render();if(receivedCard)window.GameCardBag?.open();}
    }
  }
  window.GamePresentation={update,updateCash,present,onReset,celebrate,rentFor,syncCityScene,selectTile,selectCurrentTile:()=>{if(state.players)selectTile(currentPlayer().position);}};
  function inspectBuilding(event) {
    const button=event.target.closest('[data-inspect-building]');
    if(button&&!button.disabled&&(!state.busy||preview))window.CityScene?.inspectTile(Number(button.dataset.inspectBuilding));
  }
  inspector.addEventListener('click',inspectBuilding);
  const topbarMenu=document.getElementById('topbar-menu');
  if(topbarMenu) {
    topbarMenu.addEventListener('click',event=>{if(event.target.closest('.topbar-menu-panel button'))topbarMenu.open=false;});
    document.addEventListener('pointerdown',event=>{if(topbarMenu.open&&!topbarMenu.contains(event.target))topbarMenu.open=false;});
  }
  window.addEventListener('city:ready',()=>{syncCityScene();render();});
  window.addEventListener('city:select',e=>{if(state.modal.visible&&state.modal.boardTargets?.length){previewMunicipalTarget(e.detail.index);return;}selectTile(e.detail.index);if(!state.modal.visible&&!state.busy)openMobilePanel('property');});
  window.addEventListener('city:harbor-project',event=>openHarborProject(event.detail?.id));
  document.querySelector('.mobile-tools').addEventListener('click',e=>{
    const button=e.target.closest('[data-mobile-panel]');if(!button)return;
    openMobilePanel(button.dataset.mobilePanel,button);
  });
  document.getElementById('mobile-sheet-close').addEventListener('click',closeMobilePanel);
  sheetBackdrop.addEventListener('click',closeMobilePanel);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.body.classList.contains('city-inspection-open'))closeMobilePanel();});
  mobileQuery.addEventListener('change',()=>{if(!mobileQuery.matches)closeMobilePanel();});
  document.getElementById('start-showcase-btn').addEventListener('click',setupShowcase);
  document.getElementById('showcase-open-btn').addEventListener('click',setupShowcase);
  document.getElementById('showcase-exit-btn').addEventListener('click',()=>openDepartureMenu());
  showcaseControls.addEventListener('click',e=>{const b=e.target.closest('[data-showcase]');if(b)void runShowcase(b.dataset.showcase);});
  document.getElementById('restart-btn').addEventListener('click',update);
  document.getElementById('start-map-options').addEventListener('click',()=>{menuSnapshot=null;updateHarborControls(true);syncCityScene();});
  window.GameDrama?.setMuted(!soundState.enabled);
  initializeGame();update();
})();
