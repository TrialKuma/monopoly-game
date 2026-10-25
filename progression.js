/* Local vault and town: atomic admission, settlement, collection and building ledgers. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'monopoly_city_v1';
  const COLLECTIONS = Object.freeze({ city_stamp: { name: '城市印章', map: '经典 / 紧凑 / 都市' }, harbor_shell: { name: '潮汐海螺', map: '潮汐港湾' }, alpine_crystal: { name: '山泉晶石', map: '云岭温泉' } });
  const PROJECTS = Object.freeze([
    { id: 'garden', name: '街角花园', coins: [300, 650, 1100], items: [1, 2, 3], collectionId: 'city_stamp', icon: '✿', description: '升级可扩建花圃和庭院。' },
    { id: 'waterfront', name: '滨水步道', coins: [450, 900, 1500], items: [1, 2, 3], collectionId: 'harbor_shell', icon: '≈', description: '升级可扩建步道和码头。' },
    { id: 'skyline', name: '星光地标', coins: [650, 1200, 2000], items: [1, 2, 3], collectionId: 'alpine_crystal', icon: '▥', description: '升级可增建观景台和塔冠。' },
  ]);
  const BUILDING_CARDS = Object.freeze([
    ['villa', '海湾公馆', 120, 1, 1], ['shop', '港湾商铺', 140, 1, 1],
    ['hotel', '海岸酒店', 220, 1, 1], ['tower', '航海事务所', 240, 1, 1],
    ['finance', '海港商会', 300, 2, 1], ['skyscraper', '港湾观景楼', 360, 2, 1],
    ['onsen', '海崖温泉', 280, 2, 1],
  ].map(([family, name, coins, width, height]) => Object.freeze({
    id: `harbor_${family}`, family, name, region: 'harbor', mapId: 'harbor', coins,
    footprint: Object.freeze([width, height]), mergeCosts: Object.freeze([2, 4]),
    modelKeys: Object.freeze([1, 2, 3].map(star => `${family}_${star}`)),
    previewPaths: Object.freeze([1, 2, 3].map(star => `assets/buildings/regions/harbor/${family}_${star}.png`)),
  })));
  const TOWN_EXPANSION = Object.freeze({ from: 6, to: 8, coins: 800 });
  const cardById = id => BUILDING_CARDS.find(card => card.id === id);
  const emptyCards = () => Object.fromEntries(BUILDING_CARDS.map(card => [card.id, { unlocked: false, star: 0, duplicates: 0 }]));
  const emptyTown = () => ({ size: 6, targetCardId: 'harbor_villa', cards: emptyCards(), buildings: [], actions: [] });
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
  const emptyLevels = () => Object.fromEntries(PROJECTS.map(p => [p.id, 0]));
  const emptyCollections = () => Object.fromEntries(Object.keys(COLLECTIONS).map(id => [id, 0]));
  const fresh = () => ({ version: 3, seedGranted: true, seedAmount: 1200, legacyBalance: 0, legacyEarned: 0, legacyLevels: emptyLevels(), wallet: 1200, earned: 0, projectLevels: emptyLevels(), collections: emptyCollections(), entries: [], receipts: [], purchases: [], stipends: [], town: emptyTown() });
  const clone = value => JSON.parse(JSON.stringify(value));
  const timestamp = value => text(value, 40) && Number.isFinite(Date.parse(value));
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const collectionFor = mapId => mapId === 'harbor' ? 'harbor_shell' : mapId === 'alpine' ? 'alpine_crystal' : 'city_stamp';
  function validReceiptBase(r) {
    return r && text(r.runId, 160) && text(r.mapId, 60) && text(r.mapName, 80)
      && ['rounds', 'bankruptcy'].includes(r.mode) && ['rounds', 'bankruptcy'].includes(r.reason)
      && ['human', 'ai', 'draw'].includes(r.winnerId) && integer(r.cash) && integer(r.rounds)
      && timestamp(r.completedAt);
  }
  function validLegacy(p) {
    if (!p || p.version !== 1 || !integer(p.wallet) || !integer(p.earned)
      || !Array.isArray(p.owned) || !Array.isArray(p.receipts)) return false;
    if (new Set(p.owned).size !== p.owned.length || p.owned.some(id => !PROJECTS.some(project => project.id === id))) return false;
    if (!p.receipts.every(validReceiptBase) || new Set(p.receipts.map(r => r.runId)).size !== p.receipts.length) return false;
    const earned = p.receipts.reduce((sum, r) => sum + r.cash, 0);
    const spent = p.owned.reduce((sum, id) => sum + ({ garden: 1200, waterfront: 2800, skyline: 5500 }[id]), 0);
    return integer(earned) && earned === p.earned && p.wallet === earned - spent;
  }
  function validVault(p, townSpent = 0) {
    if (!p || ![2, 3].includes(p.version) || p.seedGranted !== true || ![0, 1200].includes(p.seedAmount)
      || ![p.wallet, p.earned, p.legacyBalance, p.legacyEarned].every(integer)
      || !p.projectLevels || !p.legacyLevels || !p.collections
      || ![p.entries, p.receipts, p.purchases, p.stipends].every(Array.isArray)) return false;
    if (PROJECTS.some(item => !integer(p.legacyLevels[item.id]) || p.legacyLevels[item.id] > 1 || !integer(p.projectLevels[item.id]) || p.projectLevels[item.id] > 3)) return false;
    if (Object.keys(COLLECTIONS).some(id => !integer(p.collections[id]))) return false;
    const entries = new Map();
    for (const entry of p.entries) {
      if (!entry || !text(entry.runId, 160) || !text(entry.mapId, 60) || !integer(entry.price) || entry.price < 1 || entry.collectionId !== collectionFor(entry.mapId) || !timestamp(entry.enteredAt) || entries.has(entry.runId)) return false;
      entries.set(entry.runId, entry);
    }
    const ids = new Set(), items = emptyCollections(); let earned = 0, legacyEarned = 0;
    for (const receipt of p.receipts) {
      if (!validReceiptBase(receipt) || ids.has(receipt.runId)) return false;
      ids.add(receipt.runId);
      if (receipt.legacy === true) { if (entries.has(receipt.runId)) return false; legacyEarned += receipt.cash; continue; }
      const entry = entries.get(receipt.runId);
      if (!entry || entry.mapId !== receipt.mapId || entry.collectionId !== receipt.collectionId || !integer(receipt.collectionCount) || receipt.collectionCount < 1 || receipt.collectionCount > 3) return false;
      earned += receipt.cash; items[receipt.collectionId] += receipt.collectionCount;
    }
    if (legacyEarned !== p.legacyEarned) return false;
    const legacySpent = PROJECTS.reduce((sum, item) => sum + p.legacyLevels[item.id] * ({ garden: 1200, waterfront: 2800, skyline: 5500 }[item.id]), 0);
    if (p.legacyBalance !== p.legacyEarned - legacySpent) return false;
    const levels = { ...p.legacyLevels }; let spent = 0;
    for (const purchase of p.purchases) {
      const project = PROJECTS.find(item => item.id === purchase?.projectId);
      if (!project || purchase.level !== levels[project.id] + 1 || purchase.level > 3 || purchase.coins !== project.coins[purchase.level - 1] || purchase.collectionId !== project.collectionId || purchase.count !== project.items[purchase.level - 1] || !timestamp(purchase.builtAt)) return false;
      levels[project.id] = purchase.level; spent += purchase.coins; items[purchase.collectionId] -= purchase.count;
    }
    if (PROJECTS.some(item => levels[item.id] !== p.projectLevels[item.id])) return false;
    if (Object.keys(COLLECTIONS).some(id => !integer(items[id]) || items[id] !== p.collections[id])) return false;
    const days = new Set();
    for (const stipend of p.stipends) {
      if (!stipend || !/^\d{4}-\d{2}-\d{2}$/.test(stipend.date) || days.has(stipend.date) || stipend.amount !== 300) return false;
      days.add(stipend.date);
    }
    const ticketTotal = p.entries.reduce((sum, entry) => sum + entry.price, 0);
    const expectedWallet = p.seedAmount + p.legacyBalance + earned + p.stipends.length * 300 - ticketTotal - spent - townSpent;
    return integer(expectedWallet) && p.wallet === expectedWallet && integer(p.legacyEarned + earned) && p.earned === p.legacyEarned + earned;
  }
  function normalizeBuildingCards(list, mapId) {
    if (!Array.isArray(list)) return null;
    const counts = new Map(); let total = 0;
    for (const row of list) {
      if (!row || !cardById(row.cardId) || !integer(row.count) || row.count < 1) return null;
      total += row.count; if (!integer(total) || total > 5) return null;
      counts.set(row.cardId, (counts.get(row.cardId) || 0) + row.count);
    }
    if ((mapId === 'harbor' && total < 1) || (mapId !== 'harbor' && total !== 0)) return null;
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([cardId, count]) => ({ cardId, count }));
  }
  function grantBuildingCards(town, rewards) {
    for (const reward of rewards) {
      const card = town.cards[reward.cardId];
      if (!card.unlocked) { card.unlocked = true; card.star = 1; card.duplicates += reward.count - 1; }
      else card.duplicates += reward.count;
    }
  }
  function footprint(cardId, rotation) {
    const shape = cardById(cardId)?.footprint;
    return shape ? rotation % 2 === 1 ? [shape[1], shape[0]] : [...shape] : null;
  }
  function placementError(town, cardId, x, y, rotation, ignoreId) {
    if (!integer(x) || !integer(y) || ![0, 1, 2, 3].includes(rotation)) return 'invalid';
    const shape = footprint(cardId, rotation); if (!shape) return 'invalid';
    if (x + shape[0] > town.size || y + shape[1] > town.size) return 'out_of_bounds';
    for (const building of town.buildings) {
      if (building.stored || building.id === ignoreId) continue;
      const other = footprint(building.cardId, building.rotation);
      if (x < building.x + other[0] && x + shape[0] > building.x && y < building.y + other[1] && y + shape[1] > building.y) return 'occupied';
    }
    return null;
  }
  // The same reducer validates saved ledgers and applies new actions. Placed models
  // read their star from the family card, so a merge upgrades every copy together.
  function applyTownAction(town, action) {
    if (!action || !text(action.id, 160) || !timestamp(action.createdAt)) return 'invalid';
    const card = cardById(action.cardId), collection = card && town.cards[card.id];
    const building = town.buildings.find(row => row.id === action.buildingId);
    if (action.type === 'place') {
      if (!card || !collection.unlocked) return 'card_locked';
      if (!text(action.buildingId, 190) || building || action.coins !== card.coins) return 'invalid';
      const error = placementError(town, card.id, action.x, action.y, action.rotation); if (error) return error;
      town.buildings.push({ id: action.buildingId, cardId: card.id, x: action.x, y: action.y, rotation: action.rotation, stored: false });
    } else if (action.type === 'move' || action.type === 'restore') {
      if (!building || building.stored !== (action.type === 'restore') || action.coins !== 0) return 'building_missing';
      const error = placementError(town, building.cardId, action.x, action.y, action.rotation, building.id); if (error) return error;
      Object.assign(building, { x: action.x, y: action.y, rotation: action.rotation, stored: false });
    } else if (action.type === 'store') {
      if (!building || building.stored || action.coins !== 0) return 'building_missing';
      building.stored = true;
    } else if (action.type === 'merge') {
      if (!collection?.unlocked) return 'card_locked';
      if (collection.star >= 3) return 'max_star';
      if (action.star !== collection.star + 1 || action.count !== card.mergeCosts[collection.star - 1] || action.coins !== 0) return 'conflict';
      if (collection.duplicates < action.count) return 'missing_cards';
      collection.duplicates -= action.count; collection.star = action.star;
    } else if (action.type === 'expand') {
      if (town.size !== TOWN_EXPANSION.from || action.size !== TOWN_EXPANSION.to || action.coins !== TOWN_EXPANSION.coins) return 'max_land';
      town.size = action.size;
    } else if (action.type === 'target') {
      if (!card || action.coins !== 0) return 'invalid';
      town.targetCardId = card.id;
    } else return 'invalid';
    return null;
  }
  function validTown(p) {
    const saved = p.town;
    if (!saved || !saved.cards || !Array.isArray(saved.buildings) || !Array.isArray(saved.actions) || !Array.isArray(p.receipts)) return null;
    const town = emptyTown();
    for (const receipt of p.receipts) {
      if (!receipt || typeof receipt !== 'object') return null;
      if (receipt.cardRewardVersion === 0) {
        if (!Array.isArray(receipt.buildingCards) || receipt.buildingCards.length) return null;
      } else if (receipt.cardRewardVersion === 1 && !receipt.legacy) {
        const cards = normalizeBuildingCards(receipt.buildingCards, receipt.mapId);
        if (!cards || JSON.stringify(cards) !== JSON.stringify(receipt.buildingCards)) return null;
        grantBuildingCards(town, cards);
      } else return null;
    }
    if (Object.values(town.cards).some(card => !integer(card.duplicates))) return null;
    const ids = new Set(); let spent = 0;
    for (const action of saved.actions) {
      if (!action || ids.has(action.id) || applyTownAction(town, action)) return null;
      ids.add(action.id); spent += action.coins;
    }
    if (!integer(spent) || saved.size !== town.size || saved.targetCardId !== town.targetCardId
      || JSON.stringify(saved.cards) !== JSON.stringify(town.cards) || JSON.stringify(saved.buildings) !== JSON.stringify(town.buildings)) return null;
    return spent;
  }
  function validProfile(p) {
    if (!p || p.version !== 3) return false;
    const spent = validTown(p);
    return spent !== null && validVault(p, spent);
  }
  function migrate(old) {
    if (old.version === 2) return { ...clone(old), version: 3, receipts: old.receipts.map(receipt => ({ ...receipt, cardRewardVersion: 0, buildingCards: [] })), town: emptyTown() };
    const p = fresh(); p.seedAmount = 0; p.legacyBalance = old.wallet; p.legacyEarned = old.earned; p.wallet = old.wallet; p.earned = old.earned;
    for (const id of old.owned) { p.legacyLevels[id] = 1; p.projectLevels[id] = 1; }
    p.receipts = old.receipts.map(receipt => ({ ...receipt, legacy: true, cardRewardVersion: 0, buildingCards: [] }));
    return p;
  }
  function createStore(storage, now = () => new Date().toISOString(), today = localDay) {
    function write(profile) {
      if (!validProfile(profile)) return { ok: false, error: 'invalid' };
      try { storage.setItem(STORAGE_KEY, JSON.stringify(profile)); return { ok: true, profile }; }
      catch (_) { return { ok: false, error: 'save_failed' }; }
    }
    function read() {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); } catch (_) { return { ok: false, error: 'unavailable' }; }
      if (raw === null) return { ok: true, profile: fresh() };
      try {
        const profile = JSON.parse(raw);
        if ((profile?.version === 1 && validLegacy(profile)) || (profile?.version === 2 && validVault(profile))) {
          const saved = write(migrate(profile)); return saved.ok ? { ...saved, migrated: true } : { ...saved, error: 'migration_failed' };
        }
        return validProfile(profile) ? { ok: true, profile } : { ok: false, error: 'corrupt' };
      } catch (_) { return { ok: false, error: 'corrupt' }; }
    }
    function getEntryInfo(input) {
      if (!input || !text(input.mapId, 60) || !integer(input.price) || input.price < 1) return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      return { ok: true, wallet: loaded.profile.wallet, price: input.price, canEnter: loaded.profile.wallet >= input.price, shortfall: Math.max(0, input.price - loaded.profile.wallet), collectionId: collectionFor(input.mapId) };
    }
    function enter(input) {
      if (!input || !text(input.runId, 160)) return { ok: false, error: 'invalid' };
      const info = getEntryInfo(input); if (!info.ok) return info;
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), old = profile.entries.find(entry => entry.runId === input.runId);
      if (old) return old.mapId === input.mapId && old.price === input.price ? { ok: true, paid: true, duplicate: true, entry: old, profile } : { ok: false, error: 'conflict' };
      if (profile.receipts.some(receipt => receipt.runId === input.runId)) return { ok: false, error: 'conflict' };
      if (input.collectionId && input.collectionId !== info.collectionId) return { ok: false, error: 'invalid' };
      if (profile.wallet < input.price) return { ok: false, error: 'entry_funds', price: input.price, wallet: profile.wallet, shortfall: input.price - profile.wallet };
      const entry = { runId: input.runId, mapId: input.mapId, price: input.price, collectionId: info.collectionId, enteredAt: now() };
      profile.wallet -= input.price; profile.entries.push(entry);
      const saved = write(profile); return saved.ok ? { ...saved, paid: true, entry } : saved;
    }
    function settle(input) {
      if (!input || input.eligible !== true) return { ok: false, error: 'ineligible', skipped: true };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), entry = profile.entries.find(row => row.runId === input.runId);
      if (!entry || entry.mapId !== input.mapId) return { ok: false, error: 'unpaid' };
      const old = profile.receipts.find(r => r.runId === input.runId);
      const legacyCards = old?.cardRewardVersion === 0 && input.buildingCards === undefined;
      const buildingCards = legacyCards ? [] : normalizeBuildingCards(input.buildingCards === undefined ? (input.mapId === 'harbor' ? [{ cardId: 'harbor_villa', count: 1 }] : []) : input.buildingCards, input.mapId);
      if (!buildingCards) return { ok: false, error: 'invalid' };
      const receipt = { runId: input.runId, mapId: input.mapId, mapName: input.mapName,
        mode: input.mode, reason: input.reason, winnerId: input.winnerId, cash: input.humanCash,
        rounds: input.rounds, completedAt: now(), collectionId: entry.collectionId, collectionCount: input.collectionCount ?? (input.winnerId === 'human' ? 2 : 1),
        cardRewardVersion: legacyCards ? 0 : 1, buildingCards };
      if (!validReceiptBase(receipt) || !integer(receipt.collectionCount) || receipt.collectionCount < 1 || receipt.collectionCount > 3) return { ok: false, error: 'invalid' };
      if (old) {
        const same = ['mapId', 'mode', 'reason', 'winnerId', 'cash', 'rounds', 'collectionId', 'collectionCount', 'cardRewardVersion'].every(key => old[key] === receipt[key])
          && JSON.stringify(old.buildingCards) === JSON.stringify(buildingCards);
        return same ? { ok: true, duplicate: true, amount: old.cash, receipt: old, profile } : { ok: false, error: 'conflict' };
      }
      if (!integer(profile.wallet + receipt.cash) || !integer(profile.earned + receipt.cash)) return { ok: false, error: 'invalid' };
      profile.wallet += receipt.cash; profile.earned += receipt.cash; profile.receipts.push(receipt);
      profile.collections[receipt.collectionId] += receipt.collectionCount;
      grantBuildingCards(profile.town, buildingCards);
      const saved = write(profile);
      return saved.ok ? { ...saved, amount: receipt.cash, receipt } : saved;
    }
    function buy(projectId, expectedLevel) {
      const project = PROJECTS.find(item => item.id === projectId);
      if (!project) return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), level = profile.projectLevels[projectId];
      if (expectedLevel !== undefined && expectedLevel <= level) return { ok: true, duplicate: true, profile };
      if (level >= 3) return { ok: true, duplicate: true, profile };
      if (expectedLevel !== undefined && expectedLevel !== level + 1) return { ok: false, error: 'conflict' };
      const coins = project.coins[level], count = project.items[level];
      if (profile.wallet < coins) return { ok: false, error: 'insufficient', shortfall: coins - profile.wallet };
      if (profile.collections[project.collectionId] < count) return { ok: false, error: 'missing_collection', collectionId: project.collectionId, shortfall: count - profile.collections[project.collectionId] };
      profile.wallet -= coins; profile.collections[project.collectionId] -= count; profile.projectLevels[projectId]++;
      profile.purchases.push({ projectId, level: level + 1, coins, collectionId: project.collectionId, count, builtAt: now() });
      return write(profile);
    }
    function getStipendInfo() {
      const loaded = read(); if (!loaded.ok) return loaded;
      const claimed = loaded.profile.stipends.some(item => item.date === today());
      return { ok: true, eligible: loaded.profile.wallet < 100 && !claimed, claimed, amount: 300 };
    }
    function claimStipend() {
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), date = today();
      if (profile.stipends.some(item => item.date === date)) return { ok: false, error: 'stipend_claimed' };
      if (profile.wallet >= 100) return { ok: false, error: 'stipend_not_needed' };
      profile.wallet += 300; profile.stipends.push({ date, amount: 300 });
      return write(profile);
    }
    function leaderboard(mapId, mode) {
      const loaded = read(); if (!loaded.ok) return loaded;
      const rows = loaded.profile.receipts.filter(r => r.mapId === mapId && r.mode === mode)
        .sort((a, b) => b.cash - a.cash || b.completedAt.localeCompare(a.completedAt)).slice(0, 20);
      return { ok: true, rows };
    }
    let townSequence = 0;
    function townAction(type, input = {}) {
      if (!input || typeof input !== 'object') return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), town = profile.town;
      const id = input.actionId ?? (root.crypto?.randomUUID ? root.crypto.randomUUID() : `town-${Date.now().toString(36)}-${++townSequence}`);
      if (!text(id, 160)) return { ok: false, error: 'invalid' };
      const card = cardById(input.cardId);
      const old = town.actions.find(action => action.id === id);
      const action = { id, type, coins: 0, createdAt: now() };
      if (type === 'place') Object.assign(action, { cardId: input.cardId, buildingId: `building_${id}`, x: input.x, y: input.y, rotation: input.rotation ?? 0, coins: card?.coins });
      else if (type === 'move' || type === 'restore') Object.assign(action, { buildingId: input.buildingId, x: input.x, y: input.y, rotation: input.rotation ?? 0 });
      else if (type === 'store') action.buildingId = input.buildingId;
      else if (type === 'merge') {
        const star = input.expectedStar ?? old?.star ?? ((town.cards[input.cardId]?.star || 0) + 1);
        Object.assign(action, { cardId: input.cardId, star, count: card?.mergeCosts[star - 2] });
      } else if (type === 'expand') Object.assign(action, { size: input.expectedSize ?? TOWN_EXPANSION.to, coins: TOWN_EXPANSION.coins });
      else if (type === 'target') action.cardId = input.cardId;
      else return { ok: false, error: 'invalid' };
      if (old) {
        const same = Object.keys(action).filter(key => key !== 'createdAt').every(key => action[key] === old[key])
          && Object.keys(old).length === Object.keys(action).length;
        return same ? { ok: true, duplicate: true, profile, action: old, building: town.buildings.find(row => row.id === old.buildingId) } : { ok: false, error: 'conflict' };
      }
      if (!integer(action.coins)) return { ok: false, error: 'invalid' };
      if (profile.wallet < action.coins) return { ok: false, error: 'insufficient', shortfall: action.coins - profile.wallet };
      const error = applyTownAction(town, action); if (error) return { ok: false, error };
      profile.wallet -= action.coins; town.actions.push(action);
      const saved = write(profile);
      return saved.ok ? { ...saved, action, building: town.buildings.find(row => row.id === action.buildingId) } : saved;
    }
    const town = { catalog: BUILDING_CARDS, expansion: TOWN_EXPANSION, read, footprint,
      place: input => townAction('place', input), move: input => townAction('move', input),
      store: input => townAction('store', input), restore: input => townAction('restore', input),
      merge: input => townAction('merge', input), expand: input => townAction('expand', input),
      setTarget: input => townAction('target', input) };
    return { read, enter, getEntryInfo, settle, buy, getStipendInfo, claimStipend, leaderboard, town };
  }
  const core = { STORAGE_KEY, PROJECTS, COLLECTIONS, BUILDING_CARDS, TOWN_EXPANSION, createStore, validProfile, footprint };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (!root.document) return;
  const money = n => Math.round(n).toLocaleString('zh-CN');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errors = { unavailable: '无法读取本机存档，请检查浏览器存储设置。', corrupt: '本机存档暂时无法读取，原存档已保留。', save_failed: '保存失败，本次操作未完成。请保留此页后重试。', migration_failed: '旧存档升级暂未保存，原存档已保留。', insufficient: '仓库金币不足。', invalid: '这次操作信息不完整，尚未保存。', conflict: '已有不同的操作记录，未重复处理。', unpaid: '未找到本局已付门票，收益尚未入库。', stipend_claimed: '今天的救急补给已经领取。', stipend_not_needed: '仓库低于 100 金币时可领取救急补给。', card_locked: '先在港湾对局中收集这张建筑卡。', missing_cards: '重复建筑卡不足，还不能合成。', max_star: '这座建筑已达到三星。', max_land: '城镇土地已全部解锁。', occupied: '这里已有建筑，请换一块空地。', out_of_bounds: '建筑超出了已解锁的土地。', building_missing: '建筑状态已变化，请重新选择。' };
  const errorText = result => result?.error === 'entry_funds' ? `仓库金币不足，还差 ${money(result.shortfall)} 才能入场。` : result?.error === 'missing_collection' ? `还缺 ${result.shortfall} 枚${COLLECTIONS[result.collectionId]?.name || '收藏品'}，可前往${COLLECTIONS[result.collectionId]?.map || '对应地图'}收集。` : errors[result?.error] || '操作暂未完成，请重试。';
  const store = createStore({ getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) });
  let dialog, menuButton, panel = 'city', filterMap = 'classic', filterMode = 'rounds', notice = '', runSequence = 0, resultContext = null;
  const pending = new Map(), latestResults = new Map();
  function createRunId() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    if (root.crypto?.getRandomValues) return Array.from(root.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    // Does not consume Math.random(), which belongs to dice and card rules.
    return `local-${Date.now().toString(36)}-${(root.performance?.now?.() || 0).toString(36)}-${++runSequence}`;
  }
  function mapOptions() {
    return [...document.querySelectorAll('#start-map-options [data-map-id]')].map(button => ({
      id: button.dataset.mapId, name: button.querySelector('.map-option-title')?.textContent || button.dataset.mapId,
    }));
  }
  function refreshMenu() {
    if (!menuButton) return;
    const loaded = store.read();
    menuButton.innerHTML = `<span>我的城镇 <small>${loaded.ok ? `建筑收藏 ${Object.values(loaded.profile.town.cards).filter(card => card.unlocked).length} / ${BUILDING_CARDS.length} · 已建 ${loaded.profile.town.buildings.filter(building => !building.stored).length} 栋` : '存档暂不可用'}</small></span><strong>${loaded.ok ? `${money(loaded.profile.wallet)} <small>金币</small>` : '查看'} <span aria-hidden="true">↗</span></strong>`;
  }
  function changed() { refreshMenu(); root.dispatchEvent(new CustomEvent('city-progress-change')); }
  function projectMarkup(profile, available) {
    return PROJECTS.map(project => {
      const level = profile.projectLevels[project.id], complete = level >= 3;
      const enough = !complete && profile.wallet >= project.coins[level] && profile.collections[project.collectionId] >= project.items[level];
      return `<article class="city-project${level ? ' is-built' : ''}"><span class="city-project-icon" aria-hidden="true">${project.icon}</span><div><h3>${project.name} <small>Lv.${level} / 3</small></h3><p>${project.description}</p>${complete ? '<p class="city-project-cost">景观已满级</p>' : `<p class="city-project-cost">${money(project.coins[level])} 金币 + ${project.items[level]} ${COLLECTIONS[project.collectionId].name}</p>`}</div><button type="button" data-city-buy="${project.id}" data-city-level="${level + 1}"${complete || !available ? ' disabled' : ''}${!enough && !complete ? ' class="city-project-missing"' : ''}>${complete ? '已满级' : level ? '升级' : '建造'}</button></article>`;
    }).join('');
  }
  function inventoryMarkup(profile, available) {
    const stipend = store.getStipendInfo();
    return `<div class="city-inventory" aria-label="收藏品仓库">${Object.entries(COLLECTIONS).map(([id, collection]) => `<div><strong>${profile.collections[id]}</strong><span>${collection.name}</span><small>${collection.map}</small></div>`).join('')}</div>${available && profile.wallet < 100 ? `<div class="city-emergency"><span>${stipend.claimed ? '今日救急补给已领取' : '仓库不足 100，今日可领补给'}</span><button type="button" data-city-stipend${!stipend.eligible ? ' disabled' : ''}>${stipend.claimed ? '已领取' : '+300 金币'}</button></div>` : ''}`;
  }
  function render() {
    refreshMenu(); if (!dialog?.open) return;
    const loaded = store.read(), profile = loaded.ok ? loaded.profile : fresh(), owned = PROJECTS.filter(p => profile.projectLevels[p.id] > 0).map(p => p.id);
    const mapList = mapOptions();
    if (!mapList.some(map => map.id === filterMap)) filterMap = mapList[0]?.id || 'classic';
    const hasArchivedMode = profile.receipts.some(receipt => receipt.mode === 'bankruptcy');
    if (!hasArchivedMode) filterMode = 'rounds';
    const rows = store.leaderboard(filterMap, filterMode);
    const result = resultContext ? latestResults.get(resultContext.result.runId) || resultContext.result : null;
    const details = result?.receipt || result?.details || {};
    const isResult = panel === 'result' && !!result;
    dialog.innerHTML = `<div class="city-sheet"><header class="city-sheet-header"><div><p>仓库 · 收藏 · 景观升级</p><h2 id="city-dialog-title">${isResult ? '本局结算' : '我的小城'}</h2></div><button class="city-close" type="button" data-city-close aria-label="关闭面板">关闭</button></header>
      ${isResult ? '' : `<div class="city-tabs" role="tablist" aria-label="小城页面"><button type="button" role="tab" aria-selected="${panel === 'city'}" data-city-tab="city">仓库与建设</button><button type="button" role="tab" aria-selected="${panel === 'board'}" data-city-tab="board">本机榜</button></div>`}
      <p class="city-message${!loaded.ok ? ' city-message-error' : ''}" role="status"${notice || !loaded.ok ? '' : ' hidden'}>${esc(notice || errors[loaded.error] || '')}</p>
      ${isResult ? `<div class="city-finish"><div class="city-finish-mark" aria-hidden="true">${details.winnerId === 'human' ? '✦' : details.winnerId === 'draw' ? '≈' : '▱'}</div><h3>${details.winnerId === 'human' ? '本局胜利' : details.winnerId === 'draw' ? '本局平局' : '本局失利'}</h3><p>${esc(details.mapName || '')} · ${details.mode === 'bankruptcy' ? '破产淘汰' : '回合制'}</p><div class="city-finish-cash"><span>最终现金</span><strong>${money(details.cash ?? details.humanCash ?? 0)}</strong></div>${resultMarkup(result)}<div class="city-finish-links"><button type="button" data-city-tab="city">仓库与建设 ↗</button><button type="button" data-city-tab="board">查看本机榜 ↗</button></div></div>` : panel === 'city' ? `<div class="city-wallet"><span>仓库金币</span><strong>${loaded.ok ? money(profile.wallet) : '—'}</strong><small>累计带回 ${money(profile.earned)}</small></div>${inventoryMarkup(profile, loaded.ok)}
      <div class="city-diorama" role="img" aria-label="我的小城：${owned.length ? PROJECTS.filter(p => owned.includes(p.id)).map(p => `${p.name}${profile.projectLevels[p.id]}级`).join('、') : '等待建设'}"><span class="city-sun"></span><div class="city-island"><span class="city-road"></span><span class="city-house city-house-a"></span><span class="city-house city-house-b"></span>${owned.includes('garden') ? `<span class="city-garden city-garden-level-${profile.projectLevels.garden}"><i></i><i></i><i></i><b>✿</b></span>` : ''}${owned.includes('waterfront') ? `<span class="city-water city-water-level-${profile.projectLevels.waterfront}"><i></i><b></b><em></em></span>` : ''}${owned.includes('skyline') ? `<span class="city-tower city-tower-level-${profile.projectLevels.skyline}"><i></i></span>` : ''}</div><span class="city-scene-label">${owned.length ? `${owned.length} 处景观 · ${Object.values(profile.projectLevels).reduce((s, n) => s + n, 0)} / 9 级` : '尚未建造景观'}</span></div>
      <div class="city-projects">${projectMarkup(profile, loaded.ok)}</div><p class="city-footnote">门票从仓库扣除，中途离场不退。完成对局后剩余现金入库，另得对应收藏：完成 +1、获胜 +1、拥有满级大地产 +1，最多 3 枚。景观升级不改变对局能力。进度仅保存在本机。</p>`
      : `<div class="city-filters"><label>地图<select data-city-map>${mapList.map(map => `<option value="${esc(map.id)}"${filterMap === map.id ? ' selected' : ''}>${esc(map.name)}</option>`).join('')}</select></label>${hasArchivedMode ? `<label>记录类型<select data-city-mode><option value="rounds"${filterMode === 'rounds' ? ' selected' : ''}>固定回合</option><option value="bankruptcy"${filterMode === 'bankruptcy' ? ' selected' : ''}>历史淘汰局</option></select></label>` : ''}</div><p class="city-board-caption">本机个人最高现金 · ${filterMode === 'bankruptcy' ? '历史淘汰局' : '固定回合'} · 按地图排名</p><ol class="city-ranking">${rows.ok && rows.rows.length ? rows.rows.map((r, i) => `<li><span class="city-rank-number">${i + 1}</span><div><strong>${r.winnerId === 'human' ? '胜利' : r.winnerId === 'draw' ? '平局' : '完成对局'}</strong><small>${esc(new Date(r.completedAt).toLocaleDateString('zh-CN'))} · ${r.rounds} 回合</small></div><b>${money(r.cash)}</b></li>`).join('') : '<li class="city-ranking-empty">暂无记录，完成本地图对局后上榜。</li>'}</ol><p class="city-footnote">仅记录本机完成的对局，展示前 20 名。不同设备的记录不会同步。</p>`}
      <footer class="city-sheet-footer${isResult ? ' city-result-footer' : ''}">${isResult ? '<button type="button" class="city-close" data-city-home>返回首页</button><button type="button" class="city-confirm" data-city-replay>再来一局</button>' : resultContext ? '<button type="button" class="city-confirm" data-city-tab="result">返回结算</button>' : '<button type="button" class="city-confirm" data-city-close>完成</button>'}</footer></div>`;
  }
  function open(tab = 'city') {
    mount(); if (!dialog) return;
    panel = tab; notice = ''; filterMode = 'rounds';
    filterMap = document.querySelector('#start-map-options [aria-pressed="true"]')?.dataset.mapId || filterMap;
    if (!dialog.open) dialog.showModal();
    render(); dialog.querySelector('[data-city-close]')?.focus();
  }
  function settle(input) {
    const result = store.settle(input);
    if (!result.ok && !result.skipped && input?.runId) pending.set(input.runId, clone(input));
    if (result.ok) pending.delete(input.runId);
    changed();
    const output = { ...result, runId: input?.runId, details: input ? { mapName: input.mapName, mode: input.mode, winnerId: input.winnerId, humanCash: input.humanCash, rounds: input.rounds } : {} };
    if (input?.runId) latestResults.set(input.runId, output);
    return output;
  }
  function resultMarkup(result) {
    result = latestResults.get(result?.runId) || result;
    if (!result || result.skipped) return '';
    const copy = result.ok ? `${money(result.amount)} 金币已入仓库` : errorText(result);
    const collection = result.ok && result.receipt?.collectionId ? `<p class="city-result-collection">+${result.receipt.collectionCount} ${COLLECTIONS[result.receipt.collectionId]?.name || '收藏品'}</p>` : '';
    const cards = result.ok && result.receipt?.buildingCards?.length ? `<p class="city-result-collection">建筑卡：${result.receipt.buildingCards.map(row => `${esc(cardById(row.cardId)?.name || row.cardId)} ×${row.count}`).join('、')}</p>` : '';
    return `<div class="city-result" data-city-result="${esc(result.runId)}"><p>${esc(copy)}</p>${collection}${cards}<button type="button" data-town-open>回城建造 ↗</button><button type="button" data-city-open>我的仓库 ↗</button>${!result.ok && pending.has(result.runId) ? `<button type="button" data-city-retry="${esc(result.runId)}">重试保存</button>` : ''}</div>`;
  }
  function enter(input) { const result = store.enter(input); if (result.ok) changed(); return result; }
  function showEntryError(result) { open('city'); notice = errorText(result?.canEnter === false ? { ...result, error: 'entry_funds' } : result); render(); }
  function showResult(result, actions = {}) {
    if (!result || result.skipped) return;
    mount(); if (!dialog) return;
    resultContext = { result, onReplay: actions.onReplay, onHome: actions.onHome };
    panel = 'result'; notice = '';
    filterMap = result.receipt?.mapId || pending.get(result.runId)?.mapId || filterMap;
    filterMode = result.receipt?.mode || result.details?.mode || 'rounds';
    if (!dialog.open) dialog.showModal();
    render(); dialog.querySelector('[data-city-replay]')?.focus();
  }
  function resetResult() {
    resultContext = null;
    if (dialog?.open) dialog.close();
  }
  function openTown() {
    if (!root.TownBuilder?.open) { open('city'); return; }
    if (dialog?.open) dialog.close();
    root.TownBuilder.open();
  }
  function mount() {
    if (dialog) { refreshMenu(); return; }
    const startPanel = document.querySelector('#start-screen .start-panel');
    if (!startPanel) return;
    menuButton = document.createElement('button'); menuButton.type = 'button'; menuButton.className = 'city-menu-button'; menuButton.dataset.townOpen = '';
    const note = startPanel.querySelector('.start-note'); startPanel.insertBefore(menuButton, note || null);
    dialog = document.createElement('dialog'); dialog.id = 'city-dialog'; dialog.className = 'city-dialog'; dialog.setAttribute('aria-labelledby', 'city-dialog-title'); document.body.appendChild(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    document.addEventListener('click', event => {
      const target = event.target.closest?.('button'); if (!target) return;
      if (target.hasAttribute('data-town-open')) openTown();
      else if (target.hasAttribute('data-city-open')) open();
      else if (target.hasAttribute('data-city-close')) dialog.close();
      else if (target.hasAttribute('data-city-home') || target.hasAttribute('data-city-replay')) {
        const callback = target.hasAttribute('data-city-home') ? resultContext?.onHome : resultContext?.onReplay;
        dialog.close(); resultContext = null; if (typeof callback === 'function') callback();
      }
      else if (target.dataset.cityTab) { panel = target.dataset.cityTab; notice = ''; render(); (dialog.querySelector(`[data-city-tab="${panel}"]`) || dialog.querySelector('.city-confirm'))?.focus(); }
      else if (target.dataset.cityBuy) {
        const bought = store.buy(target.dataset.cityBuy, Number(target.dataset.cityLevel)); notice = bought.ok ? `${PROJECTS.find(p => p.id === target.dataset.cityBuy).name}已升至 Lv.${bought.profile.projectLevels[target.dataset.cityBuy]}。` : errorText(bought);
        if (bought.ok) changed();
        render(); dialog.querySelector('.city-confirm')?.focus();
      } else if (target.hasAttribute('data-city-stipend')) {
        const claimed = store.claimStipend(); notice = claimed.ok ? '救急补给 300 金币已入仓库。' : errorText(claimed);
        if (claimed.ok) changed(); render();
      } else if (target.dataset.cityRetry) {
        const input = pending.get(target.dataset.cityRetry); if (!input) return;
        const result = settle(input), container = target.closest('[data-city-result]');
        if (dialog.open) render(); else if (container) container.outerHTML = resultMarkup(result);
      }
    });
    dialog.addEventListener('change', event => {
      if (event.target.hasAttribute('data-city-map')) filterMap = event.target.value;
      if (event.target.hasAttribute('data-city-mode')) filterMode = event.target.value;
      render();
    });
    root.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { changed(); render(); } });
    refreshMenu();
  }
  const townApi = { ...store.town, errorText };
  for (const action of ['place', 'move', 'store', 'restore', 'merge', 'expand', 'setTarget']) townApi[action] = input => {
    const result = store.town[action](input); if (result.ok) { changed(); render(); } return result;
  };
  root.GameProgression = { createRunId, enter, getEntryInfo: store.getEntryInfo, showEntryError, settle, resultMarkup, mount, open, openTown, showResult, resetResult, getProfile: store.read, getStipendInfo: store.getStipendInfo, PROJECTS, COLLECTIONS, BUILDING_CARDS, town: townApi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})(typeof window !== 'undefined' ? window : globalThis);
