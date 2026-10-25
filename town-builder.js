(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => Math.round(value || 0).toLocaleString('zh-CN');
  let shell, scene, profile, selectedCard = 'harbor_villa', selectedBuilding = null, mode = null, preview = null, shelf = 'collection', timer, previousFocus, openGeneration = 0;
  let config = {}, scenePromise, message = '', previousOverflow = '';
  const backend = () => root.GameProgression?.town;
  const catalog = () => backend()?.catalog || [];
  const currentCard = () => catalog().find(card => card.id === selectedCard) || catalog()[0];
  const stars = star => '★'.repeat(star || 0) + '☆'.repeat(3 - (star || 0));
  const ownedCard = id => profile?.town.cards[id] || { unlocked: false, star: 0, duplicates: 0 };
  const previewImage = (card, star) => `assets/buildings/regions/${card.region}/${card.family}_${Math.max(1, star)}.png?v=20261025-facade2`;
  const findBuilding = id => profile?.town.buildings.find(item => item.id === id);
  function footprint(card, rotation) { return rotation % 2 ? [card.footprint[1], card.footprint[0]] : card.footprint; }
  function isValidPlacement(item) {
    const card = catalog().find(card => card.id === item.cardId); if (!card || !profile) return false;
    const [w, h] = footprint(card, item.rotation);
    if (![item.x, item.y].every(Number.isInteger) || item.x < 0 || item.y < 0 || item.x + w > profile.town.size || item.y + h > profile.town.size) return false;
    return !profile.town.buildings.some(other => { if (other.stored || other.id === item.buildingId) return false; const c = catalog().find(c => c.id === other.cardId); if (!c) return false; const [ow, oh] = footprint(c, other.rotation); return item.x < other.x + ow && item.x + w > other.x && item.y < other.y + oh && item.y + h > other.y; });
  }
  function firstFree(card, rotation = 0) {
    for (let y = 0; y < profile.town.size; y++) for (let x = 0; x < profile.town.size; x++) { const item = { cardId: card.id, x, y, rotation }; if (isValidPlacement(item)) return item; }
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
    shell.innerHTML = `<header class="town-header"><div class="town-title"><p>HARBOR · MY TOWN</p><h2 id="town-builder-title">我的城镇</h2></div><div class="town-header-right"><div class="town-wallet"><span>仓库金币</span><strong data-town-wallet></strong></div><button type="button" class="town-close" data-town-action="close">返回</button></div></header><div class="town-content"><div class="town-view"><div class="town-canvas"></div><div class="town-overview"></div><div class="town-view-tools"><button type="button" data-town-action="zoom-in" aria-label="放大城镇">＋</button><button type="button" data-town-action="zoom-out" aria-label="缩小城镇">−</button><button type="button" data-town-action="camera-home">全景</button></div><div class="town-load-status" role="status" hidden></div><div class="town-empty" hidden></div><div class="town-map-hint">点击建筑查看 · 拖动转动 · 双指缩放</div></div><aside class="town-side" aria-label="建筑卡与城镇建设"></aside></div><div class="town-message" role="status" hidden></div>`;
    document.body.appendChild(shell); shell.addEventListener('click', clicked); shell.addEventListener('change', changedInput); shell.addEventListener('keydown', keydown);
    root.addEventListener('city-progress-change', () => { if (!shell.hidden && load()) render(); });
    root.addEventListener('storage', () => { if (!shell.hidden && load()) { if (preview) preview.valid = isValidPlacement(preview); render(); } });
  }
  function cardMarkup(card, building) {
    const record = ownedCard(card.id), selected = building ? selectedBuilding === building.id : selectedCard === card.id;
    return `<button type="button" class="town-card${selected ? ' is-selected' : ''}${record.unlocked ? '' : ' is-locked'}" ${building ? `data-town-stored="${esc(building.id)}"` : `data-town-card="${esc(card.id)}"`} aria-pressed="${selected}" aria-label="${esc(card.name)}，${record.star ? `${record.star} 星，重复卡 ${record.duplicates} 张` : '未收集'}">${profile.town.targetCardId === card.id && !building ? '<span class="town-card-target">本局目标</span>' : ''}<span class="town-card-image"><img src="${previewImage(card, record.star)}" alt="" draggable="false" loading="lazy"></span><b>${esc(card.name)}</b><span class="town-card-meta"><i>${record.unlocked ? stars(record.star) : '待收集'}</i><span>${building ? '已收纳' : record.unlocked ? `余卡 ${record.duplicates}` : `${card.footprint.join('×')} 格`}</span></span></button>`;
  }
  function detailMarkup() {
    const card = currentCard(); if (!card) return '';
    const record = ownedCard(card.id), count = profile.town.buildings.filter(item => item.cardId === card.id && !item.stored).length, stored = findBuilding(selectedBuilding);
    const cost = card.mergeCosts?.[record.star - 1] || (record.star === 1 ? 2 : 4), target = profile.town.targetCardId === card.id;
    if (shelf === 'storage') return stored ? `<div class="town-card-detail"><div class="town-detail-heading"><strong>${esc(card.name)}</strong><span>${stars(record.star)}</span></div><p>已收纳的建筑可免费放回城镇。</p><div class="town-detail-actions"><button type="button" class="town-primary" data-town-action="restore">放回城镇</button></div></div>` : '';
    return `<div class="town-card-detail"><div class="town-detail-heading"><strong>${esc(card.name)}</strong><span>${record.unlocked ? stars(record.star) : '建筑图鉴'}</span></div><p>${record.unlocked ? `${card.footprint.join('×')} 格 · 已建 ${count} 栋 · ${record.star >= 3 ? '已达满星' : `${record.duplicates} / ${cost} 张重复卡可升星`}` : '带回首张建筑卡即可解锁建造。'}</p><div class="town-detail-actions">${record.unlocked ? `<button type="button" class="town-target-mobile" data-town-action="target"${target ? ' disabled' : ''}>${target ? '目标✓' : '设目标'}</button><button type="button" data-town-action="merge"${record.star >= 3 || record.duplicates < cost ? ' disabled' : ''}>${record.star >= 3 ? '已满星' : `合成 ${record.star + 1} 星`}</button><button type="button" class="town-primary" data-town-action="build"${profile.wallet < card.coins ? ' disabled' : ''}>建造 · ${money(card.coins)}</button>` : `<button type="button" data-town-action="target"${target ? ' disabled' : ''}>${target ? '已设为目标' : '设为收集目标'}</button><button type="button" class="town-primary" data-town-action="embark">出发港湾</button>`}</div>${record.unlocked ? `<button type="button" class="town-target-button" data-town-action="target"${target ? ' disabled' : ''}>${target ? '收集目标：下局继续获取重复卡' : '设为下局收集目标'}</button>` : ''}</div>`;
  }
  function editMarkup() {
    if (mode === 'expand') return `<section class="town-edit"><h3>扩建城镇</h3><p>沿岸土地开放后，可继续摆放大型建筑。</p><div class="town-expand-preview"><strong>6 × 6 → 8 × 8</strong><small>新增 28 格 · 花费 800 金币</small></div><div class="town-edit-actions"><button type="button" data-town-action="cancel">取消</button><button type="button" class="town-primary" data-town-action="confirm-expand"${profile.wallet < 800 ? ' disabled' : ''}>扩建 · 800</button></div></section>`;
    const card = currentCard(), record = ownedCard(card?.id);
    if (preview) return `<section class="town-edit"><h3>${mode === 'move' ? '移动' : mode === 'restore' ? '摆放' : '建造'}${esc(card.name)}</h3><p>${preview.valid ? `位置 ${preview.x + 1}，${preview.y + 1} · 点击空地调整位置` : '这块位置无法放置，请选择未占用的空地。'}</p><div class="town-placement-controls"><label>列 <input type="number" min="1" max="${profile.town.size}" value="${preview.x + 1}" data-town-coordinate="x" aria-label="建造列"></label><label>行 <input type="number" min="1" max="${profile.town.size}" value="${preview.y + 1}" data-town-coordinate="y" aria-label="建造行"></label><button type="button" data-town-action="rotate">旋转 ↻</button></div><div class="town-edit-actions"><button type="button" data-town-action="cancel">取消</button><button type="button" class="town-primary" data-town-action="confirm-place"${!preview.valid ? ' disabled' : ''}>${mode === 'build' ? `建造 · ${money(card.coins)}` : '确认位置'}</button></div></section>`;
    const item = findBuilding(selectedBuilding); if (!item) return '';
    return `<section class="town-edit"><h3>${esc(card.name)} <small>${stars(record.star)}</small></h3><p>${card.footprint.join('×')} 格 · 位置 ${item.x + 1}，${item.y + 1} · 升星会同步更新同类建筑</p><div class="town-edit-actions"><button type="button" data-town-action="cancel">返回</button><button type="button" data-town-action="store">收纳</button><button type="button" class="town-primary" data-town-action="move">移动 / 旋转</button></div></section>`;
  }
  function render() {
    if (!profile || !shell || shell.hidden) return;
    const oldList = shell.querySelector('.town-collection'), scroll = { left: oldList?.scrollLeft || 0, top: oldList?.scrollTop || 0 };
    const oldFocus = document.activeElement, hadFocus = shell.querySelector('.town-side').contains(oldFocus), focusData = hadFocus ? { ...oldFocus.dataset } : null;
    const card = currentCard(); if (card) selectedCard = card.id;
    const unlocked = catalog().filter(card => ownedCard(card.id).unlocked).length, built = profile.town.buildings.filter(item => !item.stored).length;
    shell.querySelector('[data-town-wallet]').textContent = money(profile.wallet);
    shell.querySelector('.town-overview').innerHTML = `<strong>港湾新城</strong><small>${built} 栋建筑 · ${profile.town.size} × ${profile.town.size} 土地</small>`;
    shell.classList.toggle('is-editing', !!mode);
    const stored = profile.town.buildings.filter(item => item.stored);
    const list = shelf === 'storage' ? stored.map(item => cardMarkup(catalog().find(c => c.id === item.cardId), item)).join('') || '<div class="town-storage-empty">收纳的建筑会保留在这里，可随时免费放回。</div>' : catalog().map(card => cardMarkup(card)).join('');
    shell.querySelector('.town-side').innerHTML = mode ? editMarkup() : `<div class="town-side-header"><h3>港湾建筑卡</h3><span>${unlocked} / ${catalog().length} 已收集</span></div><div class="town-shelf-tabs" role="tablist" aria-label="建筑列表"><button type="button" role="tab" data-town-shelf="collection" aria-selected="${shelf === 'collection'}">建筑图鉴</button><button type="button" role="tab" data-town-shelf="storage" aria-selected="${shelf === 'storage'}">收纳 ${stored.length}</button><button type="button" data-town-action="target"${profile.town.targetCardId === selectedCard ? ' disabled' : ''}>${profile.town.targetCardId === selectedCard ? '已设目标 ✓' : '设为目标'}</button></div><div class="town-collection">${list}</div>${detailMarkup()}<footer class="town-bottom-bar"><button type="button" data-town-action="warehouse">仓库 / 记录</button><button type="button" data-town-action="expand"${profile.town.size >= 8 ? ' disabled' : ''}>${profile.town.size >= 8 ? '土地已开放' : '扩建 · 800'}</button><button type="button" data-town-action="embark">前往港湾 ↗</button></footer>`;
    const empty = shell.querySelector('.town-empty'); empty.hidden = built > 0 || !!mode;
    if (!empty.hidden) empty.innerHTML = `<h3>${unlocked ? '建造第一栋建筑' : '从一张建筑卡开始'}</h3><p>${unlocked ? '选择建筑卡，再选择空地开始建造。' : '完成港湾对局，带回金币与建筑卡。'}</p>${unlocked ? '' : '<button type="button" class="town-primary" data-town-action="embark">出发港湾</button>'}`;
    shell.querySelector('.town-map-hint').textContent = preview ? '点击草地预览 · 拖动转动视角' : '点击建筑查看 · 拖动转动 · 双指缩放';
    const nextList = shell.querySelector('.town-collection'); if (nextList) { nextList.scrollLeft = scroll.left; nextList.scrollTop = scroll.top; }
    if (hadFocus && !oldFocus.isConnected) {
      const restored = [...shell.querySelectorAll('.town-side button:not(:disabled),.town-side input')].find(node => Object.keys(focusData).length && Object.entries(focusData).every(([key, value]) => node.dataset[key] === value));
      (restored || shell.querySelector('.town-side .town-primary:not(:disabled),.town-side button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    syncScene();
  }
  function syncScene() { if (preview) preview.valid = isValidPlacement(preview); scene?.update({ profile, catalog: catalog(), selection: selectedBuilding, preview }); }
  function onPick(hit) {
    if (preview && hit.x !== undefined) { preview.x = hit.x; preview.y = hit.y; preview.valid = isValidPlacement(preview); render(); return; }
    let item = hit.buildingId ? findBuilding(hit.buildingId) : profile.town.buildings.find(item => { if (item.stored) return false; const card = catalog().find(c => c.id === item.cardId), [w, h] = footprint(card, item.rotation); return hit.x >= item.x && hit.x < item.x + w && hit.y >= item.y && hit.y < item.y + h; });
    if (item) { selectedBuilding = item.id; selectedCard = item.cardId; mode = 'inspect'; render(); }
    else if (!mode && ownedCard(selectedCard).unlocked) startPlacement('build', hit);
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
  function cancelEdit() { mode = null; preview = null; selectedBuilding = null; render(); }
  function clicked(event) {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.townCard) { selectedCard = button.dataset.townCard; selectedBuilding = null; render(); return; }
    if (button.dataset.townStored) { selectedBuilding = button.dataset.townStored; selectedCard = findBuilding(selectedBuilding)?.cardId; render(); return; }
    if (button.dataset.townShelf) { shelf = button.dataset.townShelf; selectedBuilding = null; render(); return; }
    const action = button.dataset.townAction, card = currentCard();
    if (action === 'close') close();
    else if (action === 'embark') { const target = profile.town.targetCardId; close(); if (typeof config.onEmbark === 'function') config.onEmbark({ mapId: 'harbor', targetCardId: target }); else root.dispatchEvent(new CustomEvent('town:embark', { detail: { mapId: 'harbor', targetCardId: target } })); }
    else if (action === 'warehouse') { close(); root.GameProgression.open('city'); }
    else if (action === 'zoom-in') scene?.zoomBy(1.18);
    else if (action === 'zoom-out') scene?.zoomBy(1 / 1.18);
    else if (action === 'camera-home') scene?.home();
    else if (action === 'retry') scene?.retry();
    else if (action === 'build' || action === 'move' || action === 'restore') startPlacement(action);
    else if (action === 'cancel') cancelEdit();
    else if (action === 'expand') { mode = 'expand'; preview = null; render(); }
    else if (action === 'confirm-expand') mutate('expand', { expectedSize: 8 }, '城镇已扩建，新增 28 格土地。', cancelEdit);
    else if (action === 'target') mutate('setTarget', { cardId: card.id }, `下局收集目标：${card.name}`);
    else if (action === 'merge') mutate('merge', { cardId: card.id, expectedStar: ownedCard(card.id).star + 1 }, `${card.name}已升星，城镇中的同类建筑已更新。`);
    else if (action === 'store') mutate('store', { buildingId: selectedBuilding }, '建筑已收纳，可免费放回城镇。', cancelEdit);
    else if (action === 'rotate' && preview) { preview.rotation = (preview.rotation + 1) % 4; preview.valid = isValidPlacement(preview); render(); }
    else if (action === 'confirm-place' && preview && isValidPlacement(preview)) {
      const { x, y, rotation, cardId, buildingId } = preview, method = mode === 'build' ? 'place' : mode === 'restore' ? 'restore' : 'move';
      mutate(method, method === 'place' ? { cardId, x, y, rotation } : { buildingId, x, y, rotation }, method === 'place' ? `${card.name}建造完成。` : '建筑位置已保存。', cancelEdit);
    }
  }
  function changedInput(event) { const axis = event.target.dataset.townCoordinate; if (!preview || !['x', 'y'].includes(axis)) return; preview[axis] = Number(event.target.value) - 1; preview.valid = isValidPlacement(preview); render(); }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); if (mode) cancelEdit(); else close(); }
    if (event.key !== 'Tab') return; const focusable = [...shell.querySelectorAll('button:not(:disabled),input,canvas[tabindex]')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function open(options = {}) {
    config = { ...config, ...(typeof options === 'object' ? options : {}) }; mount();
    if (!load()) { close(); root.GameProgression.open('city'); return; }
    if (!shell.hidden) { if (options.cardId) selectedCard = options.cardId; render(); return; }
    previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.classList.add('town-open'); shell.hidden = false; mode = null; preview = null; shelf = 'collection'; selectedBuilding = null;
    selectedCard = options.cardId || profile.town.targetCardId || selectedCard; const generation = ++openGeneration; render(); shell.querySelector('.town-close').focus();
    try {
      scenePromise ||= import('./town-scene.js?v=20261025-town1'); const { createTownScene } = await scenePromise;
      if (generation !== openGeneration || shell.hidden) return;
      scene?.dispose(); scene = createTownScene(shell.querySelector('.town-canvas'), { onPick, onStatus(status) { if (shell.hidden) return; const node = shell.querySelector('.town-load-status'); node.hidden = status === 'ready'; node.innerHTML = status === 'error' ? '建筑模型未加载完成 <button type="button" data-town-action="retry">重试</button>' : '正在载入港湾建筑…'; } }); syncScene();
    } catch (_) { announce('城镇视图暂时无法打开，收藏和存档已保留。'); }
  }
  function close() { if (!shell || shell.hidden) return; ++openGeneration; shell.hidden = true; scene?.dispose(); scene = null; document.body.classList.remove('town-open'); document.body.style.overflow = previousOverflow; root.CityScene?.releaseInactiveAssets?.(); clearTimeout(timer); previousFocus?.focus?.(); }
  root.TownBuilder = { open, close, configure(options) { config = { ...config, ...options }; }, refresh() { if (load()) render(); }, getState: () => ({ open: !!shell && !shell.hidden, mode, selectedCard, selectedBuilding, preview: preview && { ...preview }, scene: scene?.getState() }) };
})(window);
