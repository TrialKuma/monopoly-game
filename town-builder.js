(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => Math.round(value || 0).toLocaleString('zh-CN');
  let shell, scene, profile, selectedCard = 'harbor_villa', selectedBuilding = null, mode = null, preview = null, shelf = 'collection', timer, previousFocus, openGeneration = 0;
  let config = {}, scenePromise, message = '', previousOverflow = '', expanding = false;
  let section = 'buildings', selectedProject = 'garden', expansionTarget = null, regionFilter = 'all';
  const backend = () => root.GameProgression?.town;
  const catalog = () => backend()?.catalog || [];
  const land = () => root.TownPlan.getLand(profile.town);
  const projects = () => root.GameProgression.PROJECTS;
  const materialNames = { city_stamp: '印章', harbor_shell: '海螺', alpine_crystal: '晶石' };
  const materialIcons = Object.fromEntries([['city_stamp', 'stamp', '◈'], ['harbor_shell', 'shell', '≈'], ['alpine_crystal', 'crystal', '✧']].map(([id, icon, glyph]) => [id, root.GameIcons?.svg(icon) || glyph]));
  const materialMaps = { city_stamp: ['classic', '经典'], harbor_shell: ['harbor', '港湾'], alpine_crystal: ['alpine', '温泉'] };
  const projectStages = { garden: ['花圃', '喷泉庭院', '玻璃花亭'], waterfront: ['木栈桥', '码头', '帆船港'], skyline: ['观景台', '灯塔', '灯光塔冠'] };
  const currentCard = () => catalog().find(card => card.id === selectedCard) || catalog()[0];
  const stars = star => '★'.repeat(star || 0) + '☆'.repeat(3 - (star || 0));
  const ownedCard = id => profile?.town.cards[id] || { unlocked: false, star: 0, duplicates: 0 };
  const previewImage = (card, star) => `assets/buildings/regions/${card.region}/${card.family}_${Math.max(1, star)}.png?v=20261025-facade2`;
  const findBuilding = id => profile?.town.buildings.find(item => item.id === id);
  function footprint(card, rotation) { return rotation % 2 ? [card.footprint[1], card.footprint[0]] : card.footprint; }
  function isValidPlacement(item) {
    const card = catalog().find(card => card.id === item.cardId); if (!card || !profile) return false;
    const [w, h] = footprint(card, item.rotation);
    if (!root.TownPlan.isRectOpen(profile.town, item.x, item.y, w, h)) return false;
    return !profile.town.buildings.some(other => { if (other.stored || other.id === item.buildingId) return false; const c = catalog().find(c => c.id === other.cardId); if (!c) return false; const [ow, oh] = footprint(c, other.rotation); return item.x < other.x + ow && item.x + w > other.x && item.y < other.y + oh && item.y + h > other.y; });
  }
  function firstFree(card, rotation = 0) {
    const area = land();
    for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) { const item = { cardId: card.id, x, y, rotation }; if (isValidPlacement(item)) return item; }
    return { cardId: card.id, x: 0, y: 0, rotation };
  }
  function announce(text) {
    message = text; if (!shell) return; const node = shell.querySelector('.town-message'); node.textContent = text; node.hidden = !text;
    clearTimeout(timer); if (text) timer = setTimeout(() => { message = ''; if (node.isConnected) node.hidden = true; }, 4200);
  }
  function load() {
    const result = backend()?.read(); if (!result?.ok) { announce(backend()?.errorText?.(result) || '城镇存档暂时无法读取。'); return false; }
    profile = result.profile; return true;
  }
  function mount() {
    if (shell) return;
    shell = document.createElement('section'); shell.className = 'town-builder'; shell.hidden = true; shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'true'); shell.setAttribute('aria-labelledby', 'town-builder-title');
    shell.innerHTML = `<header class="town-header"><div class="town-title"><p>MY TOWN</p><h2 id="town-builder-title">我的城镇</h2></div><div class="town-header-right"><div class="town-wallet"><span>仓库金币</span><strong data-town-wallet></strong></div><button type="button" class="town-close" data-town-action="close">返回</button></div></header><div class="town-content"><div class="town-view"><div class="town-canvas"></div><div class="town-overview"></div><div class="town-view-tools"><button type="button" data-town-action="zoom-in" aria-label="放大城镇">＋</button><button type="button" data-town-action="zoom-out" aria-label="缩小城镇">−</button><button type="button" data-town-action="camera-home">全景</button></div><div class="town-load-status" role="status" hidden></div><div class="town-empty" hidden></div><div class="town-map-hint">点击建筑查看 · 拖动转动 · 双指缩放</div></div><aside class="town-side" aria-label="建筑卡与城镇建设"></aside></div><div class="town-message" role="status" hidden></div>`;
    document.body.appendChild(shell); shell.addEventListener('click', clicked); shell.addEventListener('change', changedInput); shell.addEventListener('keydown', keydown);
    shell.querySelector('.town-header').insertAdjacentHTML('afterend', '<div class="town-materials" aria-label="建设素材"></div>');
    shell.querySelector('.town-view').insertAdjacentHTML('beforeend', '<div class="town-expansion-notice" role="status" hidden><strong></strong><span></span></div>');
    root.addEventListener('city-progress-change', () => { if (!shell.hidden && load()) render(); });
    root.addEventListener('storage', () => { if (!shell.hidden && load()) { if (preview) preview.valid = isValidPlacement(preview); render(); } });
  }
  function cardMarkup(card, building) {
    const record = ownedCard(card.id), selected = building ? selectedBuilding === building.id : selectedCard === card.id;
    return `<button type="button" class="town-card${selected ? ' is-selected' : ''}${record.unlocked ? '' : ' is-locked'}" ${building ? `data-town-stored="${esc(building.id)}"` : `data-town-card="${esc(card.id)}"`} aria-pressed="${selected}" aria-label="${esc(card.name)}，${record.star ? `${record.star} 星，重复卡 ${record.duplicates} 张` : '未收集'}"><span class="town-card-image"><img src="${previewImage(card, record.star)}" alt="" draggable="false" loading="lazy"></span><b>${esc(card.name)}</b><span class="town-card-meta"><i>${record.unlocked ? stars(record.star) : '待收集'}</i><span>${building ? '已收纳' : record.unlocked ? `余卡 ${record.duplicates}` : `${card.footprint.join('×')} 格`}</span></span></button>`;
  }
  function regionTabsMarkup() {
    const regions = [...new Map(catalog().map(card => [card.region, card.regionName])).entries()];
    const tab = (id, name, cards) => `<button type="button" data-town-region="${id}" aria-pressed="${regionFilter === id}">${esc(name)}<small>${cards.filter(card => ownedCard(card.id).unlocked).length}/${cards.length}</small></button>`;
    return `<div class="town-region-tabs" role="group" aria-label="按地区筛选建筑">${tab('all', '全部', catalog())}${regions.map(([id, name]) => tab(id, name, catalog().filter(card => card.region === id))).join('')}</div>`;
  }
  function shelfCards() {
    if (regionFilter !== 'all') return catalog().filter(card => card.region === regionFilter);
    return [...catalog().filter(card => ownedCard(card.id).unlocked), ...catalog().filter(card => !ownedCard(card.id).unlocked)];
  }
  function costMarkup(coins, collectionId, count) {
    const have = profile.collections[collectionId] || 0;
    return `<div class="town-cost"><span${profile.wallet < coins ? ' class="is-missing"' : ''}>¥${money(coins)}</span><span${have < count ? ' class="is-missing"' : ''}>${materialIcons[collectionId]} ${materialNames[collectionId]} ${have}/${count}</span></div>`;
  }
  function canAfford(coins, collectionId, count) { return profile.wallet >= coins && (profile.collections[collectionId] || 0) >= count; }
  function materialTrip(collectionId, count) {
    if ((profile.collections[collectionId] || 0) >= count) return '';
    const [mapId, name] = materialMaps[collectionId];
    return `<button type="button" class="town-material-trip" data-town-trip="${mapId}">去${name} ↗</button>`;
  }
  function sectionMarkup() {
    return `<nav class="town-section-tabs" aria-label="城镇建设">${[['buildings','房屋'],['landscape','公共景观'],['land','扩建']].map(([id,label])=>`<button type="button" data-town-section="${id}" aria-pressed="${section===id}">${label}</button>`).join('')}</nav>`;
  }
  function landscapeMarkup() {
    const project = projects().find(item => item.id === selectedProject) || projects()[0], level = profile.projectLevels[project.id] || 0, complete = level >= 3;
    const coins = project.coins[level], count = project.items[level];
    return `<div class="town-landscape-list">${projects().map(item => `<button type="button" data-town-project="${item.id}" aria-pressed="${item.id===project.id}"><span class="town-project-icon town-project-${item.id}" aria-hidden="true">${root.GameIcons?.svg(item.id) || item.icon}</span><strong>${esc(item.name)}</strong><small>${profile.projectLevels[item.id] ? `${profile.projectLevels[item.id]} 级` : '未建'}</small></button>`).join('')}</div><div class="town-project-detail"><div class="town-detail-heading"><strong>${esc(project.name)}</strong><span>${level}/3</span></div><p class="town-project-next">${complete ? projectStages[project.id][2] : `${level ? projectStages[project.id][level-1]+' → ' : ''}${projectStages[project.id][level]}`}</p>${complete ? '<div class="town-project-complete">已满级</div>' : `${costMarkup(coins,project.collectionId,count)}<div class="town-detail-actions">${materialTrip(project.collectionId,count)}<button type="button" class="town-primary" data-town-action="landscape" data-project-id="${project.id}" data-project-level="${level+1}"${canAfford(coins,project.collectionId,count)?'':' disabled'}>${level?'升级':'建造'}</button></div>`}</div>`;
  }
  function districtMapMarkup() {
    const area = land();
    const regions = [{id:'core',name:'老城',x:0,y:0,w:6,h:6,stage:0},...area.districts];
    return `<svg class="town-district-map" viewBox="-0.3 -0.3 10.6 10.6" role="img" aria-label="${area.width}乘${area.height}土地，已扩建${area.stage}区">${regions.map(d => `<g class="${d.stage<=area.stage?'is-open':d.stage===area.stage+1?'is-next':'is-locked'}"><rect x="${d.x+.05}" y="${d.y+.05}" width="${d.w-.1}" height="${d.h-.1}" rx=".18"/><text x="${d.x+d.w/2}" y="${d.y+d.h/2}" dominant-baseline="middle" text-anchor="middle"${d.w<d.h?' transform="rotate(90 '+(d.x+d.w/2)+' '+(d.y+d.h/2)+')"':''}>${esc(d.name)}</text></g>`).join('')}</svg>`;
  }
  function landMarkup() {
    const area = land(), next = area.next;
    return `<div class="town-land-summary">${districtMapMarkup()}<div class="town-district-list">${area.districts.map(d=>`<div class="${d.stage===area.stage+1?'is-next':''}"><strong>${esc(d.name)}</strong><span>${d.stage<=area.stage?'已开放':d.stage===area.stage+1?`+${d.w*d.h} 格`:'待开放'}</span></div>`).join('')}</div></div><div class="town-land-detail">${next?`<div class="town-detail-heading"><strong>${esc(next.name)}</strong><span>+${next.w*next.h} 格</span></div>${costMarkup(next.coins,next.collectionId,next.count)}<div class="town-detail-actions">${materialTrip(next.collectionId,next.count)}<button type="button" class="town-primary" data-town-action="expand">扩建</button></div>`:'<div class="town-project-complete">四区已全部开放</div>'}</div>`;
  }
  function detailMarkup() {
    const card = currentCard(); if (!card) return '';
    const record = ownedCard(card.id), count = profile.town.buildings.filter(item => item.cardId === card.id && !item.stored).length, stored = findBuilding(selectedBuilding);
    const cost = card.mergeCosts?.[record.star - 1] || (record.star === 1 ? 2 : 4);
    if (shelf === 'storage') return stored ? `<div class="town-card-detail"><div class="town-detail-heading"><strong>${esc(card.name)}</strong><span>${stars(record.star)}</span></div><div class="town-detail-actions"><button type="button" class="town-primary" data-town-action="restore">放回城镇</button></div></div>` : '';
    return `<div class="town-card-detail"><div class="town-detail-heading"><strong>${esc(card.name)}</strong><span>${record.unlocked ? stars(record.star) : '未收集'}</span></div><p>${record.unlocked ? `${card.footprint.join('×')} 格 · 已建 ${count} 栋${record.star >= 3 ? '' : ` · 升星 ${record.duplicates}/${cost}`}` : ''}</p><div class="town-detail-actions">${record.unlocked ? `<button type="button" data-town-action="merge"${record.star >= 3 || record.duplicates < cost ? ' disabled' : ''}>${record.star >= 3 ? '已满星' : `合成 ${record.star + 1} 星`}</button><button type="button" class="town-primary" data-town-action="build"${profile.wallet < card.coins ? ' disabled' : ''}>建造 · ¥${money(card.coins)}</button>` : `<button type="button" class="town-primary" data-town-trip="${esc(card.mapId)}">前往${esc(card.mapName)}</button>`}</div></div>`;
  }
  function editMarkup() {
    const district = expansionTarget || land().next;
    if (mode === 'expanding' && district) return `<section class="town-edit town-expanding-panel"><h3>${esc(district.name)}开放中</h3><div class="town-expand-preview"><strong>+${district.w * district.h} 格</strong></div><div class="town-expansion-progress" aria-hidden="true"><i></i></div></section>`;
    if (mode === 'expand' && district) return `<section class="town-edit"><h3>扩建${esc(district.name)}</h3><div class="town-expand-preview"><strong>+${district.w * district.h} 格</strong><small>${district.fromWidth} × ${district.fromHeight} → ${district.width} × ${district.height}</small></div>${costMarkup(district.coins,district.collectionId,district.count)}<div class="town-edit-actions"><button type="button" data-town-action="cancel">取消</button>${materialTrip(district.collectionId,district.count)}<button type="button" class="town-primary" data-town-action="confirm-expand"${canAfford(district.coins,district.collectionId,district.count)?'':' disabled'}>扩建</button></div></section>`;
    const card = currentCard(), record = ownedCard(card?.id);
    if (preview) return `<section class="town-edit"><h3>${mode === 'move' ? '移动' : mode === 'restore' ? '摆放' : '建造'}${esc(card.name)}</h3><p>${preview.valid ? `位置 ${preview.x + 1}，${preview.y + 1}` : '此处无法放置'}</p><div class="town-placement-controls"><label>列 <input type="number" min="1" max="${land().width}" value="${preview.x + 1}" data-town-coordinate="x" aria-label="建造列"></label><label>行 <input type="number" min="1" max="${land().height}" value="${preview.y + 1}" data-town-coordinate="y" aria-label="建造行"></label><button type="button" data-town-action="rotate">旋转 ↻</button></div><div class="town-edit-actions"><button type="button" data-town-action="cancel">取消</button><button type="button" class="town-primary" data-town-action="confirm-place"${!preview.valid ? ' disabled' : ''}>${mode === 'build' ? `建造 · ¥${money(card.coins)}` : '确认位置'}</button></div></section>`;
    const item = findBuilding(selectedBuilding); if (!item) return '';
    return `<section class="town-edit"><h3>${esc(card.name)} <small>${stars(record.star)}</small></h3><p>${card.footprint.join('×')} 格 · 位置 ${item.x + 1}，${item.y + 1}</p><div class="town-edit-actions"><button type="button" data-town-action="cancel">返回</button><button type="button" data-town-action="store">收纳</button><button type="button" class="town-primary" data-town-action="move">移动 / 旋转</button></div></section>`;
  }
  function render() {
    if (!profile || !shell || shell.hidden) return;
    const oldList = shell.querySelector('.town-collection'), scroll = { left: oldList?.scrollLeft || 0, top: oldList?.scrollTop || 0 };
    const oldFocus = document.activeElement, hadFocus = shell.querySelector('.town-side').contains(oldFocus), focusData = hadFocus ? { ...oldFocus.dataset } : null;
    const card = currentCard(); if (card) selectedCard = card.id;
    const unlocked = catalog().filter(card => ownedCard(card.id).unlocked).length, built = profile.town.buildings.filter(item => !item.stored).length;
    shell.querySelector('[data-town-wallet]').textContent = money(profile.wallet);
    const area = land();
    shell.querySelector('.town-overview').innerHTML = `<strong>我的新城</strong><small>${built} 栋 · ${area.width} × ${area.height}</small>`;
    shell.querySelector('.town-materials').innerHTML = Object.entries(materialNames).map(([id,name])=>`<button type="button" data-town-material="${id}"><span aria-hidden="true">${materialIcons[id]}</span> ${name} <b>${profile.collections[id]||0}</b></button>`).join('');
    shell.classList.toggle('is-editing', !!mode);
    shell.classList.toggle('is-expansion-mode', mode === 'expand' || mode === 'expanding' || section === 'land' && !!shell.style.getPropertyValue('--town-expansion-height'));
    const stored = profile.town.buildings.filter(item => item.stored);
    const list = shelf === 'storage' ? stored.map(item => cardMarkup(catalog().find(c => c.id === item.cardId), item)).join('') || '<div class="town-storage-empty">暂无收纳</div>' : shelfCards().map(card => cardMarkup(card)).join('');
    const houses = `<div class="town-shelf-tabs" role="tablist" aria-label="建筑列表"><button type="button" role="tab" data-town-shelf="collection" aria-selected="${shelf === 'collection'}">建筑 ${unlocked}/${catalog().length}</button><button type="button" role="tab" data-town-shelf="storage" aria-selected="${shelf === 'storage'}">收纳 ${stored.length}</button></div>${shelf === 'collection' ? regionTabsMarkup() : ''}<div class="town-collection">${list}</div>${detailMarkup()}`;
    shell.querySelector('.town-side').innerHTML = mode ? editMarkup() : `${sectionMarkup()}${section==='landscape'?landscapeMarkup():section==='land'?landMarkup():houses}<footer class="town-bottom-bar"><button type="button" data-town-action="warehouse">战绩</button><button type="button" data-town-trip="${esc(currentCard()?.mapId || 'harbor')}">出发 ↗</button></footer>`;
    shell.querySelector('.town-side').dataset.section = section;
    const empty = shell.querySelector('.town-empty'); empty.hidden = true;
    shell.querySelector('.town-map-hint').textContent = preview ? '点选空地' : '';
    const nextList = shell.querySelector('.town-collection'); if (nextList) { nextList.scrollLeft = scroll.left; nextList.scrollTop = scroll.top; }
    if (hadFocus && !oldFocus.isConnected) {
      const restored = [...shell.querySelectorAll('.town-side button:not(:disabled),.town-side input')].find(node => Object.keys(focusData).length && Object.entries(focusData).every(([key, value]) => node.dataset[key] === value));
      (restored || shell.querySelector('.town-side .town-primary:not(:disabled),.town-side button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    syncScene();
  }
  function syncScene() { if (preview) preview.valid = isValidPlacement(preview); scene?.update({ profile, catalog: catalog(), selection: selectedBuilding, preview, selectedProject:section==='landscape'?selectedProject:null, nextDistrict:section==='land'||mode==='expand'?land().next:null }); }
  function onPick(hit) {
    if (expanding) return;
    if (hit.projectId) { shell.style.removeProperty('--town-expansion-height');section='landscape';selectedProject=hit.projectId;mode=null;preview=null;selectedBuilding=null;render();return; }
    if (hit.districtId) { section='land';mode=null;preview=null;selectedBuilding=null;render();return; }
    if (preview && hit.x !== undefined) { preview.x = hit.x; preview.y = hit.y; preview.valid = isValidPlacement(preview); render(); return; }
    let item = hit.buildingId ? findBuilding(hit.buildingId) : profile.town.buildings.find(item => { if (item.stored) return false; const card = catalog().find(c => c.id === item.cardId), [w, h] = footprint(card, item.rotation); return hit.x >= item.x && hit.x < item.x + w && hit.y >= item.y && hit.y < item.y + h; });
    if (item) { section='buildings';selectedBuilding = item.id; selectedCard = item.cardId; mode = 'inspect'; render(); }
    else if (!mode && section==='buildings' && hit.x!==undefined && ownedCard(selectedCard).unlocked) startPlacement('build', hit);
  }
  function startPlacement(nextMode, hit) {
    const card = currentCard(), item = findBuilding(selectedBuilding); if (!card || !ownedCard(card.id).unlocked) return;
    if (nextMode === 'build' && profile.wallet < card.coins) return announce('仓库金币不足。');
    mode = nextMode;
    preview = nextMode === 'move' ? { cardId: item.cardId, x: item.x, y: item.y, rotation: item.rotation, buildingId: item.id } : { ...firstFree(card), ...(hit?.x !== undefined ? { x: hit.x, y: hit.y } : {}), ...(nextMode === 'restore' ? { buildingId: item.id, rotation: item.rotation } : {}) };
    preview.valid = isValidPlacement(preview); render();
  }
  function mutate(method, data, success, after) {
    const result = backend()?.[method]?.(data);
    if (!result?.ok) { announce(backend()?.errorText?.(result) || '操作暂未完成，请重试。'); if (load()) render(); return false; }
    profile = result.profile; after?.(result); render(); announce(success); return true;
  }
  function cancelEdit() { mode = null; preview = null; selectedBuilding = null; expansionTarget = null; render(); }
  function embark(mapId='harbor') {
    const detail={mapId};close();
    if(typeof config.onEmbark==='function')config.onEmbark(detail);else root.dispatchEvent(new CustomEvent('town:embark',{detail}));
  }
  function clicked(event) {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (expanding && button.dataset.townAction !== 'close') return;
    if (button.dataset.townSection) { shell.style.removeProperty('--town-expansion-height');section=button.dataset.townSection;mode=null;preview=null;selectedBuilding=null;render();return; }
    if (button.dataset.townProject) { selectedProject=button.dataset.townProject;render();return; }
    if (button.dataset.townTrip) { embark(button.dataset.townTrip);return; }
    if (button.dataset.townMaterial) { shell.style.removeProperty('--town-expansion-height');section='landscape';selectedProject=projects().find(item=>item.collectionId===button.dataset.townMaterial)?.id||'garden';mode=null;preview=null;render();return; }
    if (button.dataset.townRegion) {
      regionFilter = button.dataset.townRegion; selectedBuilding = null;
      const cards = shelfCards();
      if (!cards.some(card => card.id === selectedCard)) selectedCard = (cards.find(card => ownedCard(card.id).unlocked) || cards[0])?.id || selectedCard;
      render(); return;
    }
    if (button.dataset.townCard) { selectedCard = button.dataset.townCard; selectedBuilding = null; render(); return; }
    if (button.dataset.townStored) { selectedBuilding = button.dataset.townStored; selectedCard = findBuilding(selectedBuilding)?.cardId; render(); return; }
    if (button.dataset.townShelf) { shelf = button.dataset.townShelf; selectedBuilding = null; render(); return; }
    const action = button.dataset.townAction, card = currentCard();
    if (action === 'close') close();
    else if (action === 'embark') embark();
    else if (action === 'warehouse') { close(); root.GameProgression.open('board'); }
    else if (action === 'zoom-in') scene?.zoomBy(1.18);
    else if (action === 'zoom-out') scene?.zoomBy(1 / 1.18);
    else if (action === 'camera-home') scene?.home();
    else if (action === 'retry') scene?.retry();
    else if (action === 'build' || action === 'move' || action === 'restore') startPlacement(action);
    else if (action === 'cancel') cancelEdit();
    else if (action === 'expand') { if(!land().next)return;expansionTarget=land().next;section='land';shell.style.setProperty('--town-expansion-height', `${shell.querySelector('.town-side').getBoundingClientRect().height}px`); mode = 'expand'; preview = null; render(); }
    else if (action === 'confirm-expand') {
      if(!expansionTarget)return;
      const district=expansionTarget;
      mode = 'expanding'; render();
      const saved = mutate('expand', { expectedStage: district.stage }, '', () => { preview = null; selectedBuilding = null; });
      if (!saved) { mode = 'expand'; render(); }
      else if (!expanding) {mode=null;expansionTarget=null;render();announce(`${district.name}已开放`);}
    }
    else if(action==='landscape') {button.disabled=true;mutate('buyLandscape',{projectId:button.dataset.projectId,expectedLevel:Number(button.dataset.projectLevel)},'景观已更新');}
    else if (action === 'merge') mutate('merge', { cardId: card.id, expectedStar: ownedCard(card.id).star + 1 }, `${card.name}已升星`);
    else if (action === 'store') mutate('store', { buildingId: selectedBuilding }, '已收纳', cancelEdit);
    else if (action === 'rotate' && preview) { preview.rotation = (preview.rotation + 1) % 4; preview.valid = isValidPlacement(preview); render(); }
    else if (action === 'confirm-place' && preview && isValidPlacement(preview)) {
      const { x, y, rotation, cardId, buildingId } = preview, method = mode === 'build' ? 'place' : mode === 'restore' ? 'restore' : 'move';
      mutate(method, method === 'place' ? { cardId, x, y, rotation } : { buildingId, x, y, rotation }, method === 'place' ? `${card.name}建造完成。` : '建筑位置已保存。', cancelEdit);
    }
  }
  function changedInput(event) { const axis = event.target.dataset.townCoordinate; if (expanding || !preview || !['x', 'y'].includes(axis)) return; preview[axis] = Number(event.target.value) - 1; preview.valid = isValidPlacement(preview); render(); }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); if (mode && !expanding) cancelEdit(); else close(); }
    if (event.key !== 'Tab') return; const focusable = [...shell.querySelectorAll('button:not(:disabled),input,canvas[tabindex]')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function open(options = {}) {
    config = { ...config, ...(typeof options === 'object' ? options : {}) }; mount();
    if (!load()) { close(); root.GameProgression.open('city'); return; }
    if (!shell.hidden) { if (options.cardId) selectedCard = options.cardId; render(); return; }
    previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.classList.add('town-open'); shell.hidden = false; mode = null; preview = null; shelf = 'collection'; selectedBuilding = null;section=options.section||'buildings';expansionTarget=null;shell.style.removeProperty('--town-expansion-height');
    selectedCard = options.cardId || selectedCard;
    if (!options.cardId && !ownedCard(selectedCard).unlocked) selectedCard = shelfCards()[0]?.id || selectedCard;
    const generation = ++openGeneration; render(); shell.querySelector('.town-close').focus();
    try {
      scenePromise ||= import('./town-scene.js?v=20261027-regions1'); const { createTownScene } = await scenePromise;
      if (generation !== openGeneration || shell.hidden) return;
      scene?.dispose(); scene = createTownScene(shell.querySelector('.town-canvas'), { onPick, onExpansion: expansionChanged, onStatus(status) { if (shell.hidden) return; const node = shell.querySelector('.town-load-status'); node.hidden = status === 'ready'; node.innerHTML = status === 'error' ? '载入失败 <button type="button" data-town-action="retry">重试</button>' : '载入中…'; } }); syncScene();
    } catch (_) { announce('城镇暂时无法打开'); }
  }
  function expansionChanged(event) {
    if (!shell || shell.hidden) return;
    expanding = event.active; shell.classList.toggle('is-expanding', expanding); shell.querySelector('.town-expansion-notice').hidden = !expanding;
    const district=event.district||expansionTarget;
    shell.querySelector('.town-expansion-notice strong').textContent=`${event.name||district?.name||'新区'}开放中`;
    shell.querySelector('.town-expansion-notice span').textContent=`+${event.newCellCount} 格`;
    shell.querySelector('.town-canvas').setAttribute('aria-busy', String(expanding));
    shell.querySelectorAll('.town-view-tools button').forEach(button => { button.disabled = expanding; });
    if (!expanding && mode === 'expanding') { mode = null; expansionTarget=null;render(); announce(`${event.name||district?.name||'新区'}已开放`); }
  }
  function close() { if (!shell || shell.hidden) return; ++openGeneration; shell.hidden = true; scene?.dispose(); scene = null; expanding = false; shell.classList.remove('is-expanding'); shell.querySelector('.town-expansion-notice').hidden = true; shell.querySelector('.town-canvas').setAttribute('aria-busy', 'false'); shell.querySelectorAll('.town-view-tools button').forEach(button => { button.disabled = false; }); document.body.classList.remove('town-open'); document.body.style.overflow = previousOverflow; root.CityScene?.releaseInactiveAssets?.(); clearTimeout(timer); previousFocus?.focus?.(); }
  root.TownBuilder = { open, close, configure(options) { config = { ...config, ...options }; }, refresh() { if (load()) render(); }, getState: () => ({ open: !!shell && !shell.hidden, mode, section, selectedProject, selectedCard, selectedBuilding, preview: preview && { ...preview }, scene: scene?.getState() }) };
})(window);
