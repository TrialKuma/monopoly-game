/* A match-only inventory view. All acquisition and use rules live in game.js. */
(() => {
  'use strict';
  const dialog = document.getElementById('card-bag-dialog');
  const list = document.getElementById('card-bag-list');
  const status = document.getElementById('card-bag-status');
  const summary = document.getElementById('card-bag-summary');
  const triggers = [...document.querySelectorAll('[data-open-card-bag]')];
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const category = id => ['shield','doubleRent','propertySwap'].includes(id) ? 'estate' : ['slow','freeze','reverse'].includes(id) ? 'control' : 'movement';
  const labels = {estate:'经营',control:'干扰',movement:'行动'};
  let lastSession = null;
  let renderKey = '';
  let pending = false;
  function close() { if (dialog.open) dialog.close(); }
  function refresh() {
    const snapshot = window.GameCards?.getSnapshot();
    if (!snapshot) return;
    const inMenu = !document.getElementById('start-screen').classList.contains('hidden');
    if (lastSession !== snapshot.sessionId || inMenu || !snapshot.canBrowse) { close(); lastSession = snapshot.sessionId; }
    triggers.forEach(button => {
      button.querySelector('[data-card-count]').textContent = String(snapshot.count);
      button.setAttribute('aria-label', `卡牌背包，${snapshot.count} 张`);
      button.setAttribute('aria-expanded', String(dialog.open));
      button.classList.toggle('has-cards', snapshot.count > 0);
      button.disabled = inMenu || !snapshot.canBrowse;
    });
    if (!dialog.open) return;
    const key = JSON.stringify(snapshot);
    if (key === renderKey) return;
    renderKey = key;
    summary.textContent = `持有 ${snapshot.count} 张 · 对手 ${snapshot.opponentCount || 0} 张`;
    status.textContent = snapshot.canUse ? '' : snapshot.reason || '';
    list.innerHTML = snapshot.cards.length ? snapshot.cards.map(card => {
      const type = category(card.id);
      const blocked = !snapshot.canUse || !card.usable || pending;
      return `<article class="bag-card" data-kind="${type}"><div class="bag-card-art" aria-hidden="true"><span>${esc(card.icon)}</span></div><div class="bag-card-copy"><small>${labels[type]}</small><h3>${esc(card.name)}</h3><p>${esc(card.description)}</p>${snapshot.canUse && !card.usable ? `<p class="bag-card-reason">${esc(card.reason)}</p>` : ''}</div><button type="button" data-use-card="${esc(card.instanceId)}" ${blocked?'disabled':''} aria-label="使用${esc(card.name)}">使用</button></article>`;
    }).join('') : '<div class="bag-empty"><span aria-hidden="true">▱</span><h3>还没有卡牌</h3></div>';
  }
  function open() {
    if (!window.GameCards?.getSnapshot().canBrowse || pending) return;
    renderKey = '';
    dialog.showModal();
    refresh();
  }
  triggers.forEach(button => button.addEventListener('click', open));
  document.getElementById('card-bag-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { triggers.forEach(button => button.setAttribute('aria-expanded','false')); });
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-use-card]');
    if (!button || button.disabled || pending) return;
    pending = true;
    const instanceId = button.dataset.useCard;
    close();
    try { await window.GameCards.use(instanceId); }
    finally { pending = false; renderKey = ''; refresh(); }
  });
  window.GameCardBag = { open, close, refresh };
  refresh();
})();
