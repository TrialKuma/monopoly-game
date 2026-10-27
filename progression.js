/* Local vault and town: atomic admission, settlement, collection and building ledgers. */
(function (root) {
  'use strict';
  const TownPlan = root.TownPlan || (typeof require === 'function' ? require('./town-plan.js') : null);
  if (!TownPlan) throw new Error('TownPlan must load before progression.js');
  const STORAGE_KEY = 'monopoly_city_v1';
  const COLLECTIONS = Object.freeze({ city_stamp: { name: '城市印章', map: '经典 / 紧凑 / 都市' }, harbor_shell: { name: '潮汐海螺', map: '潮汐港湾' }, alpine_crystal: { name: '山泉晶石', map: '云岭温泉' } });
  const PROJECTS = Object.freeze([
    { id: 'garden', name: '海岸花园', coins: [300, 650, 1100], items: [1, 2, 3], collectionId: 'city_stamp', icon: '✿', description: '花圃 · 喷泉 · 玻璃花亭' },
    { id: 'waterfront', name: '滨水码头', coins: [450, 900, 1500], items: [1, 2, 3], collectionId: 'harbor_shell', icon: '≈', description: '栈桥 · 码头 · 帆船港' },
    { id: 'skyline', name: '海角灯塔', coins: [650, 1200, 2000], items: [1, 2, 3], collectionId: 'alpine_crystal', icon: '▥', description: '观景台 · 灯塔 · 塔冠' },
  ]);
  const BUILDING_FAMILIES = [['villa', 120, 1], ['shop', 140, 1], ['hotel', 220, 1], ['tower', 240, 1], ['finance', 300, 2], ['skyscraper', 360, 2], ['onsen', 280, 2]];
  // Each map's settlement draft offers its own region. The harbor family order
  // is part of saved v2/v3 draft offers and must not change.
  const BUILDING_REGIONS = [
    ['classic', '经典', '经典环线', ['曦园公馆', '湖畔商行', '花园旅馆', '瀚海阁', '环城商会', '皇家大酒店', '温泉庄园']],
    ['compact', '紧凑', '紧凑冲突', ['河畔小筑', '柳桥茶屋', '艺文旅馆', '港口仓屋', '林间公馆', '天守楼', '潮畔温泉']],
    ['expansion', '都市', '都市大环线', ['清贝公寓', '晶藤百货', '星港旅馆', '天际大楼', '星河商会', '都会大酒店', '新月温泉']],
    ['harbor', '港湾', '潮汐港湾', ['海湾公馆', '港湾商铺', '海岸酒店', '航海事务所', '海港商会', '港湾观景楼', '海崖温泉']],
    ['alpine', '温泉', '云岭温泉', ['杉影山居', '雪松商铺', '松风旅舍', '山间邮局', '山岚商会', '云顶酒店', '云岭温泉']],
  ];
  const BUILDING_CARDS = Object.freeze(BUILDING_REGIONS.flatMap(([region, regionName, mapName, names]) => BUILDING_FAMILIES.map(([family, coins, width], index) => Object.freeze({
    id: `${region}_${family}`, family, name: names[index], region, regionName, mapId: region, mapName, coins,
    footprint: Object.freeze([width, 1]), mergeCosts: Object.freeze([2, 4]),
    modelKeys: Object.freeze([1, 2, 3].map(star => `${family}_${star}`)),
    previewPaths: Object.freeze([1, 2, 3].map(star => `assets/buildings/regions/${region}/${family}_${star}.png`)),
  }))));
  // Retained solely to validate expansion already purchased in v3 saves.
  const TOWN_EXPANSION = Object.freeze({ from: 6, to: 8, coins: 800 });
  const cardById = id => BUILDING_CARDS.find(card => card.id === id);
  const cardsForMap = mapId => BUILDING_CARDS.filter(card => card.mapId === mapId);
  const emptyCards = () => Object.fromEntries(BUILDING_CARDS.map(card => [card.id, { unlocked: false, star: 0, duplicates: 0 }]));
  const emptyTown = () => ({ size: 6, landStage: 0, targetCardId: 'harbor_villa', cards: emptyCards(), buildings: [], actions: [] });
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
  const emptyLevels = () => Object.fromEntries(PROJECTS.map(p => [p.id, 0]));
  const emptyCollections = () => Object.fromEntries(Object.keys(COLLECTIONS).map(id => [id, 0]));
  const fresh = () => ({ version: 5, seedGranted: true, seedAmount: 1200, legacyBalance: 0, legacyEarned: 0, legacyLevels: emptyLevels(), wallet: 1200, earned: 0, projectLevels: emptyLevels(), collections: emptyCollections(), entries: [], receipts: [], purchases: [], stipends: [], town: emptyTown() });
  const clone = value => JSON.parse(JSON.stringify(value));
  const timestamp = value => text(value, 40) && Number.isFinite(Date.parse(value));
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const collectionFor = mapId => mapId === 'harbor' ? 'harbor_shell' : mapId === 'alpine' ? 'alpine_crystal' : 'city_stamp';
  function normalizeHarborProjectRewards(list, mapId) {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > 2 || list.some(id => !['water', 'promenade'].includes(id))
      || mapId !== 'harbor' && list.length) return null;
    return ['water', 'promenade'].filter(id => list.includes(id));
  }
  const receiptCollectionTotal = receipt => receipt.collectionCount + (receipt.harborProjectRewards?.length || 0);
  function validReceiptBase(r) {
    const projectRewards = r && normalizeHarborProjectRewards(r.harborProjectRewards, r.mapId);
    return r && text(r.runId, 160) && text(r.mapId, 60) && text(r.mapName, 80)
      && ['rounds', 'bankruptcy'].includes(r.mode) && ['rounds', 'bankruptcy'].includes(r.reason)
      && ['human', 'ai', 'draw'].includes(r.winnerId) && integer(r.cash) && integer(r.rounds)
      && timestamp(r.completedAt) && projectRewards !== null
      && (r.harborProjectRewards === undefined || JSON.stringify(r.harborProjectRewards) === JSON.stringify(projectRewards));
  }
  function validLegacy(p) {
    if (!p || p.version !== 1 || !integer(p.wallet) || !integer(p.earned)
      || !Array.isArray(p.owned) || !Array.isArray(p.receipts)) return false;
    if (new Set(p.owned).size !== p.owned.length || p.owned.some(id => !PROJECTS.some(project => project.id === id))) return false;
    if (!p.receipts.every(r => validReceiptBase(r) && !r.harborProjectRewards?.length) || new Set(p.receipts.map(r => r.runId)).size !== p.receipts.length) return false;
    const earned = p.receipts.reduce((sum, r) => sum + r.cash, 0);
    const spent = p.owned.reduce((sum, id) => sum + ({ garden: 1200, waterfront: 2800, skyline: 5500 }[id]), 0);
    return integer(earned) && earned === p.earned && p.wallet === earned - spent;
  }
  function validVault(p, townSpent = 0, townMaterials = emptyCollections()) {
    if (!p || ![2, 3, 4, 5].includes(p.version) || p.seedGranted !== true || ![0, 1200].includes(p.seedAmount)
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
      if (receipt.legacy === true) { if (entries.has(receipt.runId) || receipt.harborProjectRewards?.length) return false; legacyEarned += receipt.cash; continue; }
      const entry = entries.get(receipt.runId);
      if (!entry || entry.mapId !== receipt.mapId || entry.collectionId !== receipt.collectionId || !integer(receipt.collectionCount) || receipt.collectionCount < 1 || receipt.collectionCount > 3) return false;
      earned += receipt.cash; items[receipt.collectionId] += receiptCollectionTotal(receipt);
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
    for (const id of Object.keys(COLLECTIONS)) items[id] -= townMaterials[id];
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
  function normalizeBuildingCards(list, mapId, allowEmpty = false) {
    if (!Array.isArray(list)) return null;
    const counts = new Map(); let total = 0;
    for (const row of list) {
      if (!row || cardById(row.cardId)?.mapId !== mapId || !integer(row.count) || row.count < 1) return null;
      total += row.count; if (!integer(total) || total > 5) return null;
      counts.set(row.cardId, (counts.get(row.cardId) || 0) + row.count);
    }
    if (!allowEmpty && (mapId === 'harbor' ? total < 1 : total !== 0)) return null;
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([cardId, count]) => ({ cardId, count }));
  }
  function draftHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }
  function legacyBuildingCardOffers(runId, targetCardId) {
    if (!text(runId, 160) || !cardById(targetCardId)) return null;
    const ranked = cardsForMap('harbor').map(card => card.id).filter(id => id !== targetCardId)
      .sort((a, b) => draftHash(`${runId}|${targetCardId}|${a}`) - draftHash(`${runId}|${targetCardId}|${b}`) || a.localeCompare(b));
    return [targetCardId, ...ranked.slice(0, 2)].sort((a, b) => draftHash(`${runId}|offer|${a}`) - draftHash(`${runId}|offer|${b}`) || a.localeCompare(b));
  }
  function buildingCardOffers(runId, mapId = 'harbor') {
    const cards = cardsForMap(mapId).map(card => card.id);
    if (!text(runId, 160) || cards.length < 3) return null;
    // A private PRNG keeps a run's reward fixed without consuming dice randomness.
    let seed = draftHash(`building-draft-v3|${runId}`);
    const random = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let value = Math.imul(seed ^ seed >>> 15, seed | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards.slice(0, 3);
  }
  function pendingBuildingCards(profile) {
    const claimed = new Set(profile.town.actions.filter(action => action.type === 'claim-card').map(action => action.runId));
    return profile.receipts.filter(receipt => [2, 3].includes(receipt.cardRewardVersion) && !claimed.has(receipt.runId));
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
    if (!TownPlan.isRectOpen(town, x, y, shape[0], shape[1])) return 'out_of_bounds';
    for (const building of town.buildings) {
      if (building.stored || building.id === ignoreId) continue;
      const other = footprint(building.cardId, building.rotation);
      if (x < building.x + other[0] && x + shape[0] > building.x && y < building.y + other[1] && y + shape[1] > building.y) return 'occupied';
    }
    return null;
  }
  // The same reducer validates saved ledgers and applies new actions. Placed models
  // read their star from the family card, so a merge upgrades every copy together.
  function applyTownAction(town, action, modern = true) {
    if (!action || !text(action.id, 190) || !timestamp(action.createdAt)) return 'invalid';
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
      if (action.stage === undefined) {
        // A historic 6→8 purchase already owns the first two districts.
        if (town.landStage !== 0 || action.size !== TOWN_EXPANSION.to || action.coins !== TOWN_EXPANSION.coins
          || action.collectionId !== undefined || action.count !== undefined) return 'max_land';
        town.landStage = 2; town.size = 8;
      } else {
        const district = TownPlan.getLand(town).next;
        if (!modern || !district || action.stage !== district.stage || action.districtId !== district.id
          || action.size !== Math.max(district.width, district.height) || action.coins !== district.coins
          || action.collectionId !== district.collectionId || action.count !== district.count) return 'conflict';
        town.landStage = action.stage; town.size = action.size;
      }
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
      } else if (!receipt.legacy && (receipt.cardRewardVersion === 2 && receipt.mapId === 'harbor' || receipt.cardRewardVersion === 3 && cardsForMap(receipt.mapId).length)) {
        const cards = normalizeBuildingCards(receipt.buildingCards, receipt.mapId, true);
        const draft = receipt.buildingCardDraft, offers = receipt.cardRewardVersion === 2 ? legacyBuildingCardOffers(receipt.runId, draft?.targetCardId) : buildingCardOffers(receipt.runId, receipt.mapId);
        if (!cards || cards.reduce((sum, row) => sum + row.count, 0) > 4 || JSON.stringify(cards) !== JSON.stringify(receipt.buildingCards)
          || !offers || JSON.stringify(draft?.offers) !== JSON.stringify(offers)
          || receipt.cardRewardVersion === 3 && JSON.stringify(draft) !== JSON.stringify({ offers })) return null;
        grantBuildingCards(town, cards);
      } else return null;
    }
    if (Object.values(town.cards).some(card => !integer(card.duplicates))) return null;
    const ids = new Set(), claimed = new Set(), materials = emptyCollections(); let spent = 0;
    for (const action of saved.actions) {
      if (!action || ids.has(action.id)) return null;
      if (action.type === 'claim-card') {
        const receipt = p.receipts.find(row => row.runId === action.runId);
        if (!text(action.id, 190) || !timestamp(action.createdAt) || action.coins !== 0
          || action.id !== `claim:${action.runId}` || claimed.has(action.runId)
          || ![2, 3].includes(receipt?.cardRewardVersion) || !receipt.buildingCardDraft.offers.includes(action.cardId)) return null;
        claimed.add(action.runId); grantBuildingCards(town, [{ cardId: action.cardId, count: 1 }]);
      } else if (applyTownAction(town, action, p.version >= 4)) return null;
      if (action.type === 'expand' && action.stage !== undefined) materials[action.collectionId] += action.count;
      ids.add(action.id); spent += action.coins;
    }
    // Saves before v5 list only the harbor cards; every other card is still locked.
    const savedCards = p.version >= 5 ? saved.cards : { ...emptyCards(), ...saved.cards };
    if (!integer(spent) || saved.size !== town.size || (p.version >= 4 && saved.landStage !== town.landStage) || saved.targetCardId !== town.targetCardId
      || JSON.stringify(savedCards) !== JSON.stringify(town.cards) || JSON.stringify(saved.buildings) !== JSON.stringify(town.buildings)) return null;
    return { coins: spent, materials };
  }
  function validProfile(p) {
    if (!p || ![3, 4, 5].includes(p.version)) return false;
    const spent = validTown(p);
    return spent !== null && validVault(p, spent.coins, spent.materials);
  }
  function migrate(old) {
    if (old.version === 3 || old.version === 4) {
      const migrated = clone(old); migrated.version = 5;
      if (old.version === 3) migrated.town.landStage = old.town.size === 8 ? 2 : 0;
      migrated.town.cards = { ...emptyCards(), ...old.town.cards };
      return migrated;
    }
    if (old.version === 2) return { ...clone(old), version: 5, receipts: old.receipts.map(receipt => ({ ...receipt, cardRewardVersion: 0, buildingCards: [] })), town: emptyTown() };
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
        if ((profile?.version === 1 && validLegacy(profile)) || (profile?.version === 2 && validVault(profile)) || ([3, 4].includes(profile?.version) && validProfile(profile))) {
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
      const harborProjectRewards = normalizeHarborProjectRewards(input.harborProjectRewards, input.mapId);
      if (!harborProjectRewards) return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), entry = profile.entries.find(row => row.runId === input.runId);
      if (!entry || entry.mapId !== input.mapId) return { ok: false, error: 'unpaid' };
      const old = profile.receipts.find(r => r.runId === input.runId);
      const legacyCards = old?.cardRewardVersion === 0 && input.buildingCards === undefined;
      const wantsDraft = input.buildingCardDraft === true;
      let buildingCards = legacyCards ? [] : normalizeBuildingCards(input.buildingCards === undefined ? (input.mapId === 'harbor' && !wantsDraft ? [{ cardId: 'harbor_villa', count: 1 }] : []) : input.buildingCards, input.mapId, wantsDraft);
      if (!buildingCards) return { ok: false, error: 'invalid' };
      let buildingCardDraft, rewardVersion = legacyCards ? 0 : 1;
      if (wantsDraft) {
        if (!cardsForMap(input.mapId).length || legacyCards) return { ok: false, error: 'invalid' };
        if (old?.cardRewardVersion === 2) {
          // Old pending offers remain exactly as saved. Support retries from the
          // former payload, where its one base card preceded construction bonuses.
          if (JSON.stringify(buildingCards) !== JSON.stringify(old.buildingCards)) {
            const base = buildingCards.find(row => row.cardId === old.buildingCardDraft.targetCardId);
            if (!base) return { ok: false, error: 'conflict' };
            buildingCards = buildingCards.map(row => ({ ...row, count: row.count - (row.cardId === old.buildingCardDraft.targetCardId ? 1 : 0) })).filter(row => row.count > 0);
          }
          buildingCardDraft = clone(old.buildingCardDraft); rewardVersion = 2;
        } else {
          const offers = buildingCardOffers(input.runId, input.mapId);
          if (!offers) return { ok: false, error: 'invalid' };
          buildingCardDraft = { offers }; rewardVersion = 3;
        }
        if (buildingCards.reduce((sum, row) => sum + row.count, 0) > 4) return { ok: false, error: 'invalid' };
      }
      const receipt = { runId: input.runId, mapId: input.mapId, mapName: input.mapName,
        mode: input.mode, reason: input.reason, winnerId: input.winnerId, cash: input.humanCash,
        rounds: input.rounds, completedAt: now(), collectionId: entry.collectionId, collectionCount: input.collectionCount ?? (input.winnerId === 'human' ? 2 : 1),
        cardRewardVersion: rewardVersion, buildingCards, harborProjectRewards,
        ...(buildingCardDraft ? { buildingCardDraft } : {}) };
      if (!validReceiptBase(receipt) || !integer(receipt.collectionCount) || receipt.collectionCount < 1 || receipt.collectionCount > 3) return { ok: false, error: 'invalid' };
      if (old) {
        const same = ['mapId', 'mode', 'reason', 'winnerId', 'cash', 'rounds', 'collectionId', 'collectionCount', 'cardRewardVersion'].every(key => old[key] === receipt[key])
          && JSON.stringify(old.buildingCards) === JSON.stringify(buildingCards)
          && JSON.stringify(old.buildingCardDraft) === JSON.stringify(buildingCardDraft)
          && JSON.stringify(old.harborProjectRewards || []) === JSON.stringify(harborProjectRewards);
        return same ? { ok: true, duplicate: true, amount: old.cash, receipt: old, profile } : { ok: false, error: 'conflict' };
      }
      if (!integer(profile.wallet + receipt.cash) || !integer(profile.earned + receipt.cash)) return { ok: false, error: 'invalid' };
      profile.wallet += receipt.cash; profile.earned += receipt.cash; profile.receipts.push(receipt);
      profile.collections[receipt.collectionId] += receiptCollectionTotal(receipt);
      grantBuildingCards(profile.town, buildingCards);
      const saved = write(profile);
      return saved.ok ? { ...saved, amount: receipt.cash, receipt } : saved;
    }
    function getPendingBuildingCards() {
      const loaded = read(); if (!loaded.ok) return loaded;
      return { ...loaded, rows: pendingBuildingCards(loaded.profile) };
    }
    function claimBuildingCard(input) {
      if (!input || !text(input.runId, 160) || !cardById(input.cardId)) return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), receipt = profile.receipts.find(row => row.runId === input.runId);
      if (![2, 3].includes(receipt?.cardRewardVersion) || !receipt.buildingCardDraft.offers.includes(input.cardId)) return { ok: false, error: 'invalid_choice' };
      const old = profile.town.actions.find(action => action.type === 'claim-card' && action.runId === input.runId);
      if (old) return old.cardId === input.cardId ? { ok: true, duplicate: true, profile, action: old } : { ok: false, error: 'already_claimed' };
      const action = { id: `claim:${input.runId}`, type: 'claim-card', runId: input.runId, cardId: input.cardId, coins: 0, createdAt: now() };
      if (profile.town.actions.some(row => row.id === action.id)) return { ok: false, error: 'conflict' };
      grantBuildingCards(profile.town, [{ cardId: input.cardId, count: 1 }]); profile.town.actions.push(action);
      const saved = write(profile); return saved.ok ? { ...saved, action } : saved;
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
      if (type === 'expand' && (!Number.isSafeInteger(input.expectedStage) || input.expectedStage < 1 || input.expectedStage > TownPlan.districts.length)) return { ok: false, error: 'invalid' };
      const loaded = read(); if (!loaded.ok) return loaded;
      const profile = clone(loaded.profile), town = profile.town;
      const id = input.actionId ?? (type === 'expand' ? `land-stage-${input.expectedStage}` : root.crypto?.randomUUID ? root.crypto.randomUUID() : `town-${Date.now().toString(36)}-${++townSequence}`);
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
      } else if (type === 'expand') {
        const district = TownPlan.districts[input.expectedStage - 1];
        Object.assign(action, { stage: district.stage, districtId: district.id, size: Math.max(district.width, district.height), coins: district.coins, collectionId: district.collectionId, count: district.count });
      }
      else return { ok: false, error: 'invalid' };
      if (old) {
        const same = Object.keys(action).filter(key => key !== 'createdAt').every(key => action[key] === old[key])
          && Object.keys(old).length === Object.keys(action).length;
        return same ? { ok: true, duplicate: true, profile, action: old, building: town.buildings.find(row => row.id === old.buildingId) } : { ok: false, error: 'conflict' };
      }
      if (type === 'expand' && action.stage <= town.landStage) {
        const purchased = town.actions.find(row => row.type === 'expand' && (row.stage === action.stage || row.stage === undefined && action.stage <= 2));
        return purchased ? { ok: true, duplicate: true, profile, action: purchased } : { ok: false, error: 'conflict' };
      }
      if (type === 'expand' && action.stage !== town.landStage + 1) return { ok: false, error: 'conflict' };
      if (!integer(action.coins)) return { ok: false, error: 'invalid' };
      if (profile.wallet < action.coins) return { ok: false, error: 'insufficient', shortfall: action.coins - profile.wallet };
      if (type === 'expand' && profile.collections[action.collectionId] < action.count) return { ok: false, error: 'missing_collection', collectionId: action.collectionId, shortfall: action.count - profile.collections[action.collectionId] };
      const error = applyTownAction(town, action); if (error) return { ok: false, error };
      if (type === 'expand') profile.collections[action.collectionId] -= action.count;
      profile.wallet -= action.coins; town.actions.push(action);
      const saved = write(profile);
      return saved.ok ? { ...saved, action, building: town.buildings.find(row => row.id === action.buildingId) } : saved;
    }
    const town = { catalog: BUILDING_CARDS, districts: TownPlan.districts, getLand: TownPlan.getLand, isCellOpen: TownPlan.isCellOpen, isRectOpen: TownPlan.isRectOpen, read, footprint,
      place: input => townAction('place', input), move: input => townAction('move', input),
      store: input => townAction('store', input), restore: input => townAction('restore', input),
      merge: input => townAction('merge', input), expand: input => townAction('expand', input),
      buyLandscape: input => input && Number.isSafeInteger(input.expectedLevel) && input.expectedLevel >= 1 && input.expectedLevel <= 3 ? buy(input.projectId, input.expectedLevel) : { ok: false, error: 'invalid' } };
    return { read, enter, getEntryInfo, settle, getPendingBuildingCards, claimBuildingCard, buy, getStipendInfo, claimStipend, leaderboard, town };
  }
  const core = { STORAGE_KEY, PROJECTS, COLLECTIONS, BUILDING_CARDS, TOWN_EXPANSION, TOWN_DISTRICTS: TownPlan.districts, TownPlan, createStore, validProfile, footprint, buildingCardOffers };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (!root.document) return;
  const money = n => Math.round(n).toLocaleString('zh-CN');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errors = { unavailable: '存档读取失败', corrupt: '存档读取失败，原存档已保留', save_failed: '保存失败，请重试', migration_failed: '存档升级失败，原存档已保留', insufficient: '金币不足', invalid: '操作未完成，请重试', conflict: '记录已变化，请重试', unpaid: '门票记录缺失，收益未入库', stipend_claimed: '今日已领取', stipend_not_needed: '金币不足 100 时可领取', card_locked: '尚未收集', missing_cards: '重复卡不足', max_star: '已满星', max_land: '土地已全部开放', occupied: '位置已占用', out_of_bounds: '土地未开放', building_missing: '建筑已变动，请重新选择' };
  const errorText = result => result?.error === 'entry_funds' ? `还差 ¥${money(result.shortfall)}` : result?.error === 'missing_collection' ? `还缺 ${result.shortfall} ${COLLECTIONS[result.collectionId]?.name || '素材'}` : errors[result?.error] || '操作未完成，请重试';
  errors.invalid_choice = '先选一张建筑卡';
  errors.already_claimed = '已领取';
  const store = createStore({ getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) });
  let dialog, menuButton, panel = 'city', filterMap = 'classic', filterMode = 'rounds', notice = '', runSequence = 0, resultContext = null;
  const pending = new Map(), latestResults = new Map(), draftSelections = new Map();
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
    const waiting = loaded.ok ? pendingBuildingCards(loaded.profile).length : 0;
    menuButton.innerHTML = `<span>我的城镇${waiting ? ` <small>${waiting} 份待领取</small>` : ''}</span><strong>${loaded.ok ? `¥${money(loaded.profile.wallet)}` : '查看'} <span aria-hidden="true">↗</span></strong>`;
  }
  function draftMarkup(receipt, profile) {
    if (![2, 3].includes(receipt?.cardRewardVersion)) return '';
    const claim = profile.town.actions.find(action => action.type === 'claim-card' && action.runId === receipt.runId);
    if (claim) return `<p class="building-card-claimed" data-building-card-claimed="${esc(receipt.runId)}">已领取 ${esc(cardById(claim.cardId).name)} ×1</p>`;
    const selected = draftSelections.get(receipt.runId);
    return `<section class="building-card-draft" data-building-card-draft="${esc(receipt.runId)}" aria-label="选择建筑卡奖励"><div class="building-card-draft-heading"><div><h3>带一座建筑回城</h3><p>三选一</p></div><span>建筑卡</span></div><div class="building-card-options">${receipt.buildingCardDraft.offers.map(id => {
      const card = cardById(id), owned = profile.town.cards[id], active = selected === id;
      const help = !owned.unlocked ? '解锁建造' : owned.star < 3 ? `重复卡 ${owned.duplicates + 1} / ${card.mergeCosts[owned.star - 1]}` : '已满星';
      return `<button type="button" class="building-card-option${active ? ' is-selected' : ''}" data-building-card-option="${esc(id)}" data-building-card-run="${esc(receipt.runId)}" aria-pressed="${active}"><span class="building-card-tag">${owned.unlocked ? `${owned.star} 星` : '未收集'}</span><img src="${esc(card.previewPaths[Math.max(0, owned.star - 1)])}" alt="" loading="lazy"><strong>${esc(card.name)}</strong><small>${esc(help)}</small><span class="building-card-select-mark" aria-hidden="true">${active ? '✓ 已选择' : '选择'}</span></button>`;
    }).join('')}</div><div class="building-card-choice-actions"><button type="button" class="city-confirm" data-building-card-claim="${esc(receipt.runId)}"${receipt.buildingCardDraft.offers.includes(selected) ? '' : ' disabled'}>领取建筑卡</button></div><p class="building-card-choice-error" role="status" hidden></p></section>`;
  }
  function pendingDraftMarkup(profile) {
    const rows = pendingBuildingCards(profile);
    return rows.length ? `${rows.length > 1 ? `<p class="building-card-pending-count">还有 ${rows.length} 份建筑卡待领取</p>` : ''}${draftMarkup(rows[0], profile)}` : '';
  }
  function changed() { refreshMenu(); root.dispatchEvent(new CustomEvent('city-progress-change')); }
  function inventoryMarkup(profile, available) {
    const stipend = store.getStipendInfo();
    return `<div class="city-inventory" aria-label="收藏品仓库">${Object.entries(COLLECTIONS).map(([id, collection]) => `<div><strong>${profile.collections[id]}</strong><span>${collection.name}</span></div>`).join('')}</div>${available && profile.wallet < 100 ? `<div class="city-emergency"><span>${stipend.claimed ? '今日已领取' : '救急补给'}</span><button type="button" data-city-stipend${!stipend.eligible ? ' disabled' : ''}>${stipend.claimed ? '已领取' : '+300 金币'}</button></div>` : ''}`;
  }
  function render() {
    refreshMenu(); if (!dialog?.open) return;
    const loaded = store.read(), profile = loaded.ok ? loaded.profile : fresh();
    const mapList = mapOptions();
    if (!mapList.some(map => map.id === filterMap)) filterMap = mapList[0]?.id || 'classic';
    const hasArchivedMode = profile.receipts.some(receipt => receipt.mode === 'bankruptcy');
    if (!hasArchivedMode) filterMode = 'rounds';
    const rows = store.leaderboard(filterMap, filterMode);
    const result = resultContext ? latestResults.get(resultContext.result.runId) || resultContext.result : null;
    const details = result?.receipt || result?.details || {};
    const isResult = panel === 'result' && !!result;
    const isRewards = panel === 'rewards';
    dialog.innerHTML = `<div class="city-sheet"><header class="city-sheet-header"><div><p>${isRewards ? '建筑收藏' : '我的城镇'}</p><h2 id="city-dialog-title">${isResult ? '本局结算' : isRewards ? '建筑卡奖励' : '仓库'}</h2></div><button class="city-close" type="button" data-city-close aria-label="关闭面板">关闭</button></header>
      ${isResult || isRewards ? '' : `<div class="city-tabs" role="tablist" aria-label="仓库页面"><button type="button" role="tab" aria-selected="${panel === 'city'}" data-city-tab="city">仓库</button><button type="button" role="tab" aria-selected="${panel === 'board'}" data-city-tab="board">本机榜</button></div>`}
      <p class="city-message${!loaded.ok ? ' city-message-error' : ''}" role="status"${notice || !loaded.ok ? '' : ' hidden'}>${esc(notice || errors[loaded.error] || '')}</p>
      ${isRewards ? pendingDraftMarkup(profile) || '<p class="building-card-rewards-complete">已全部领取</p>' : isResult ? `<div class="city-finish"><div class="city-finish-mark" aria-hidden="true">${details.winnerId === 'human' ? '✦' : details.winnerId === 'draw' ? '≈' : '▱'}</div><h3>${details.winnerId === 'human' ? '本局胜利' : details.winnerId === 'draw' ? '平局' : '本局失利'}</h3><p>${esc(details.mapName || '')} · ${details.mode === 'bankruptcy' ? '破产淘汰' : '回合制'}</p><div class="city-finish-cash"><span>最终现金</span><strong>${money(details.cash ?? details.humanCash ?? 0)}</strong></div>${resultMarkup(result)}<div class="city-finish-links"><button type="button" data-city-tab="city">仓库 ↗</button><button type="button" data-city-tab="board">查看本机榜 ↗</button></div></div>` : panel === 'city' ? `${loaded.ok ? pendingDraftMarkup(profile) : ''}<div class="city-wallet"><span>仓库金币</span><strong>${loaded.ok ? money(profile.wallet) : '—'}</strong><small>累计带回 ${money(profile.earned)}</small></div>${inventoryMarkup(profile, loaded.ok)}
      <div class="city-finish-links"><button type="button" data-town-open>回城建造 ↗</button></div>`
      : `<div class="city-filters"><label>地图<select data-city-map>${mapList.map(map => `<option value="${esc(map.id)}"${filterMap === map.id ? ' selected' : ''}>${esc(map.name)}</option>`).join('')}</select></label>${hasArchivedMode ? `<label>记录类型<select data-city-mode><option value="rounds"${filterMode === 'rounds' ? ' selected' : ''}>固定回合</option><option value="bankruptcy"${filterMode === 'bankruptcy' ? ' selected' : ''}>历史淘汰局</option></select></label>` : ''}</div><ol class="city-ranking">${rows.ok && rows.rows.length ? rows.rows.map((r, i) => `<li><span class="city-rank-number">${i + 1}</span><div><strong>${r.winnerId === 'human' ? '胜利' : r.winnerId === 'draw' ? '平局' : '完成对局'}</strong><small>${esc(new Date(r.completedAt).toLocaleDateString('zh-CN'))} · ${r.rounds} 回合</small></div><b>${money(r.cash)}</b></li>`).join('') : '<li class="city-ranking-empty">暂无记录</li>'}</ol>`}
      <footer class="city-sheet-footer${isResult ? ' city-result-footer' : ''}">${isRewards ? pendingBuildingCards(profile).length ? '<button type="button" class="city-close" data-city-close>稍后领取</button>' : '<button type="button" class="city-confirm" data-town-open>回城建造</button>' : isResult ? '<button type="button" class="city-close" data-city-home>返回首页</button><button type="button" class="city-confirm" data-city-replay>再来一局</button>' : resultContext ? '<button type="button" class="city-confirm" data-city-tab="result">返回结算</button>' : '<button type="button" class="city-confirm" data-city-close>完成</button>'}</footer></div>`;
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
    const projectBonus = result.receipt?.harborProjectRewards?.length || 0;
    const collection = result.ok && result.receipt?.collectionId ? `<p class="city-result-collection">+${receiptCollectionTotal(result.receipt)} ${COLLECTIONS[result.receipt.collectionId]?.name || '收藏品'}${projectBonus ? ` · 建设 +${projectBonus}` : ''}</p>` : '';
    const cards = result.ok && result.receipt?.buildingCards?.length ? `<p class="city-result-collection">${[2, 3].includes(result.receipt.cardRewardVersion) ? '建设奖励' : '建筑卡'}：${result.receipt.buildingCards.map(row => `${esc(cardById(row.cardId)?.name || row.cardId)} ×${row.count}`).join('、')}</p>` : '';
    const loaded = store.read(), draft = result.ok && loaded.ok ? draftMarkup(result.receipt, loaded.profile) : '';
    return `<div class="city-result" data-city-result="${esc(result.runId)}"><p>${esc(copy)}</p>${collection}${cards}${draft}<button type="button" data-town-open>回城建造 ↗</button><button type="button" data-city-open>我的仓库 ↗</button>${!result.ok && pending.has(result.runId) ? `<button type="button" data-city-retry="${esc(result.runId)}">重试保存</button>` : ''}</div>`;
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
    render(); dialog.querySelector('[data-building-card-option], [data-city-replay]')?.focus();
  }
  function resetResult() {
    resultContext = null;
    if (dialog?.open) dialog.close();
  }
  function openTown() {
    const waiting = store.getPendingBuildingCards();
    if (waiting.ok && waiting.rows.length) { open('rewards'); return; }
    if (!root.TownBuilder?.open) { open('city'); return; }
    if (dialog?.open) dialog.close();
    root.TownBuilder.open();
  }
  function claimBuildingCard(input) {
    const result = store.claimBuildingCard(input);
    if (result.ok) { draftSelections.delete(input.runId); changed(); }
    return result;
  }
  function handleDraftClick(target) {
    const container = target.closest('[data-building-card-draft]'), loaded = store.read();
    if (!container || !loaded.ok) return;
    const runId = container.dataset.buildingCardDraft, receipt = loaded.profile.receipts.find(row => row.runId === runId);
    if (![2, 3].includes(receipt?.cardRewardVersion)) return;
    if (target.hasAttribute('data-building-card-option')) {
      if (!receipt.buildingCardDraft.offers.includes(target.dataset.buildingCardOption)) return;
      draftSelections.set(runId, target.dataset.buildingCardOption);
      if (dialog.open && dialog.contains(container)) {
        render(); dialog.querySelector(`[data-building-card-option="${target.dataset.buildingCardOption}"]`)?.focus();
      } else container.outerHTML = draftMarkup(receipt, loaded.profile);
      return;
    }
    const result = claimBuildingCard({ runId, cardId: draftSelections.get(runId) });
    if (result.ok) {
      notice = `${cardById(result.action.cardId).name}已收入建筑收藏。`;
      if (dialog.open && dialog.contains(container)) { render(); dialog.querySelector('[data-town-open], [data-building-card-option], [data-city-close]')?.focus(); }
      else container.outerHTML = draftMarkup(receipt, result.profile);
    } else {
      const error = container.querySelector('.building-card-choice-error');
      error.hidden = false; error.textContent = errorText(result);
    }
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
      if (target.hasAttribute('data-building-card-option') || target.hasAttribute('data-building-card-claim')) handleDraftClick(target);
      else if (target.hasAttribute('data-town-open')) openTown();
      else if (target.hasAttribute('data-city-open')) open();
      else if (target.hasAttribute('data-city-close')) dialog.close();
      else if (target.hasAttribute('data-city-home') || target.hasAttribute('data-city-replay')) {
        const callback = target.hasAttribute('data-city-home') ? resultContext?.onHome : resultContext?.onReplay;
        dialog.close(); resultContext = null; if (typeof callback === 'function') callback();
      }
      else if (target.dataset.cityTab) { panel = target.dataset.cityTab; notice = ''; render(); (dialog.querySelector(`[data-city-tab="${panel}"]`) || dialog.querySelector('.city-confirm'))?.focus(); }
      else if (target.hasAttribute('data-city-stipend')) {
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
  for (const action of ['place', 'move', 'store', 'restore', 'merge', 'expand', 'buyLandscape']) townApi[action] = input => {
    const result = store.town[action](input); if (result.ok) { changed(); render(); } return result;
  };
  root.GameProgression = { createRunId, enter, getEntryInfo: store.getEntryInfo, showEntryError, settle, getPendingBuildingCards: store.getPendingBuildingCards, claimBuildingCard, resultMarkup, mount, open, openTown, showResult, resetResult, getProfile: store.read, getStipendInfo: store.getStipendInfo, PROJECTS, COLLECTIONS, BUILDING_CARDS, town: townApi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})(typeof window !== 'undefined' ? window : globalThis);
