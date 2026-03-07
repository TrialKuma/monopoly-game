const CONFIG = {
  maxRounds: 30,
  startCash: 1600,
  startBonus: 300,
  startStopBonus: 160,
  boardLength: 22,
};

const ROUTE_POSITIONS = [
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
  { x: 6, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 },
  { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 },
  { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 },
  { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 },
];

const TILE_NAMES = [
  "市政府", "晨曦街", "花园里", "曦园", "银行金库",
  "金融中心", "金融中心", "摩天楼", "摩天楼",
  "命运转盘", "百味町", "湖畔街", "瀚海阁", "机会广场",
  "温泉庄园", "温泉庄园", "枫叶路", "城建局",
  "中央区", "艺文里", "翻牌驿站", "日落湾",
];

const LARGE_LOT_LINKS = { 6: 5, 8: 7, 15: 14 };

const LOT_THEMES = [
  { key: "villa", label: "住宅区", color: "#86efac" },
  { key: "shop", label: "商业街", color: "#fde68a" },
  { key: "hotel", label: "度假区", color: "#fbcfe8" },
  { key: "tower", label: "商务区", color: "#bfdbfe" },
];

const PLAYER_DEFS = [
  { id: "human", name: "玩家", color: "#2563eb", isAi: false },
  { id: "ai", name: "AI 对手", color: "#ef4444", isAi: true },
];

const DISTRICT_CONFIG = {
  1: "晨曦街区", 2: "晨曦街区", 3: "晨曦街区",
  5: "金融街区", 6: "金融街区", 7: "金融街区", 8: "金融街区",
  10: "湖畔街区", 11: "湖畔街区", 12: "湖畔街区",
  14: "温泉街区", 15: "温泉街区", 16: "温泉街区",
  18: "中央街区", 19: "中央街区", 21: "中央街区",
};

const DISTRICT_COLORS = {
  "晨曦街区": "#86efac",
  "金融街区": "#93c5fd",
  "湖畔街区": "#fde68a",
  "温泉街区": "#f9a8d4",
  "中央街区": "#c4b5fd",
};

const SPECIAL_TILES = {
  4:  { type: "bank", label: "金库", color: "#bfdbfe", description: "存钱或提款！" },
  9:  { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "翻牌选卡发动！" },
  13: { type: "chance", label: "机会格", color: "#fbcfe8", description: "触发随机事件。" },
  17: { type: "construction", label: "城建局", color: "#fef08a", description: "建造或拆除！" },
  20: { type: "card_draw", label: "翻牌格", color: "#e9d5ff", description: "翻牌选卡发动！" },
};

const CARD_POOL = [
  { id: "teleport", name: "传送术", icon: "🌀", description: "传送自己或对手到随机地产格" },
  { id: "boost", name: "加速引擎", icon: "⚡", description: "选择一方，下次掷骰结果翻倍" },
  { id: "slow", name: "减速陷阱", icon: "🐌", description: "选择一方，下次掷骰结果减半" },
  { id: "launch", name: "命定骰", icon: "🎯", description: "选择前进1~6步" },
  { id: "rewind", name: "时光回溯", icon: "⏪", description: "选择一方后退3步" },
  { id: "swap", name: "换位魔法", icon: "🔄", description: "和对手交换位置" },
  { id: "freeze", name: "绊脚术", icon: "🪤", description: "对手下回合无法移动，但仍需结算地块" },
  { id: "combo", name: "连击鼓", icon: "🥁", description: "获得额外一回合" },
  { id: "shield", name: "护盾术", icon: "🛡️", description: "免疫下一次过路费" },
  { id: "doubleRent", name: "收租翻倍", icon: "💎", description: "地产下次被踩收费×2" },
  { id: "propertySwap", name: "地产互换", icon: "🔀", description: "交出你的一块地产，随机获得对手一块" },
  { id: "reverse", name: "逆行术", icon: "🔃", description: "选择一方，反转其前进方向" },
];

const boardEl = document.getElementById("board");
const scoreboardEl = document.getElementById("scoreboard");
const logListEl = document.getElementById("log-list");
const turnTitleEl = document.getElementById("turn-title");
const turnDescriptionEl = document.getElementById("turn-description");
const roundChipEl = document.getElementById("round-chip");
const diceBoxEl = document.getElementById("dice-box");
const rollBtn = document.getElementById("roll-btn");
const restartBtn = document.getElementById("restart-btn");
const soundToggleBtn = document.getElementById("sound-toggle-btn");
const musicToggleBtn = document.getElementById("music-toggle-btn");
const centerDiceEl = document.getElementById("center-dice");
const centerDiceValueEl = document.getElementById("center-dice-value");
const centerTitleEl = document.getElementById("center-title");
const centerDescriptionEl = document.getElementById("center-description");
const centerPlayerBadgeEl = document.getElementById("center-player-badge");
const centerPhaseBadgeEl = document.getElementById("center-phase-badge");
const eventOverlayEl = document.getElementById("event-overlay");
const eventLabelEl = document.getElementById("event-label");
const eventTitleEl = document.getElementById("event-title");
const eventMessageEl = document.getElementById("event-message");
const eventActionsEl = document.getElementById("event-actions");
const eventIconWrapEl = document.getElementById("event-icon-wrap");
const roundProgressBarEl = document.getElementById("round-progress-bar");
const tileTooltipEl = document.getElementById("tile-tooltip");

const EVENT_ICON_MAP = {
  "购买提示": { emoji: "🏠", cls: "event-buy" },
  "升级提示": { emoji: "🔧", cls: "event-build" },
  "过路费提示": { emoji: "💰", cls: "event-toll" },
  "功能地块": { emoji: "✨", cls: "event-special" },
  "市政府补给": { emoji: "🏛️", cls: "event-start" },
  "市政府征用": { emoji: "📜", cls: "event-start" },
  "AI 行动": { emoji: "🤖", cls: "event-info" },
  "翻牌事件": { emoji: "🎴", cls: "event-card" },
  "传送门": { emoji: "🌀", cls: "event-special" },
  "城建局": { emoji: "🏗️", cls: "event-build" },
  "骰6再动": { emoji: "🎲", cls: "event-special" },
  "绊脚效果": { emoji: "🪤", cls: "event-info" },
  "卡牌效果": { emoji: "🃏", cls: "event-card" },
  "金融中心": { emoji: "📈", cls: "event-special" },
  "温泉休息": { emoji: "♨️", cls: "event-info" },
  "温泉庄园": { emoji: "♨️", cls: "event-info" },
  "破产救助": { emoji: "🆘", cls: "event-toll" },
  "等待救援": { emoji: "🆘", cls: "event-info" },
  "破产淘汰": { emoji: "💸", cls: "event-toll" },
  "先手决定": { emoji: "🪙", cls: "event-special" },
  "模式选择": { emoji: "⚙️", cls: "event-special" },
};

const SOUND_PREF_KEY = "monopoly-sfx-enabled";
const MUSIC_PREF_KEY = "monopoly-bgm-enabled";
const HISTORY_KEY = "monopoly_history";
const SOUND_LIBRARY = {
  dice: { src: "assets/sfx/dice.wav", volume: 0.6, voices: 3 },
  step: { src: "assets/sfx/step.wav", volume: 0.22, voices: 4 },
  land: { src: "assets/sfx/land.wav", volume: 0.4, voices: 2 },
  buy: { src: "assets/sfx/buy.wav", volume: 0.5, voices: 2 },
  build: { src: "assets/sfx/build.wav", volume: 0.48, voices: 2 },
  toll: { src: "assets/sfx/toll.wav", volume: 0.5, voices: 2 },
  card: { src: "assets/sfx/card.wav", volume: 0.42, voices: 2 },
  special: { src: "assets/sfx/special.wav", volume: 0.44, voices: 2 },
  win: { src: "assets/sfx/win.wav", volume: 0.55, voices: 1 },
};
const BGM_CONFIG = {
  fallbackSrc: "assets/bgm/city-loop-deluxe.wav",
  volume: 0.42,
  bpm: 108,
  beatsPerBar: 4,
  loopBars: 8,
  scheduleAheadTime: 1.1,
  schedulerIntervalMs: 160,
};
const BGM_LIBRARY = {
  piano: "_tone_0000_JCLive_sf2_file",
  bell: "_tone_0100_JCLive_sf2_file",
  vibes: "_tone_0110_JCLive_sf2_file",
  bass: "_tone_0320_JCLive_sf2_file",
  strings: "_tone_0480_JCLive_sf2_file",
  kick: "_drum_36_6_JCLive_sf2_file",
  snare: "_drum_38_6_JCLive_sf2_file",
  hatClosed: "_drum_42_6_JCLive_sf2_file",
  hatOpen: "_drum_46_6_JCLive_sf2_file",
};
const NOTE_OFFSETS = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
const BGM_PROGRESSION = [
  ["C4", "E4", "G4", "B4"],
  ["G3", "B3", "D4", "G4"],
  ["A3", "C4", "E4", "G4"],
  ["E3", "G3", "B3", "E4"],
  ["F3", "A3", "C4", "F4"],
  ["C4", "E4", "G4", "C5"],
  ["D3", "F3", "A3", "D4"],
  ["G3", "B3", "D4", "F4"],
];
const BGM_BASS = ["C2", "G1", "A1", "E1", "F1", "C2", "D1", "G1"];
const BGM_LEAD = [
  ["E5", "G5", "A5", "G5", "E5", "D5", "C5", "D5"],
  ["D5", "B4", "D5", "G5", "F5", "D5", "B4", "G4"],
  ["C5", "E5", "A5", "C6", "A5", "E5", "C5", "B4"],
  ["B4", "D5", "G5", "B5", "G5", "D5", "B4", "A4"],
  ["A4", "C5", "F5", "A5", "G5", "F5", "E5", "C5"],
  ["G4", "C5", "E5", "G5", "E5", "D5", "C5", "G4"],
  ["A4", "D5", "F5", "A5", "F5", "D5", "C5", "A4"],
  ["B4", "D5", "G5", "A5", "G5", "F5", "D5", "B4"],
];
const BGM_SPARKLE = [
  [null, "G5", null, "E5", null, "G5", null, "B5"],
  [null, "D5", null, "B4", null, "D5", null, "A5"],
  [null, "E5", null, "C5", null, "E5", null, "A5"],
  [null, "B4", null, "G4", null, "B4", null, "D5"],
  [null, "C5", null, "A4", null, "C5", null, "F5"],
  [null, "E5", null, "C5", null, "E5", null, "G5"],
  [null, "F5", null, "D5", null, "F5", null, "A5"],
  [null, "G5", null, "D5", null, "G5", null, "B5"],
];

let state = {};
let sessionCounter = 0;
let modalResolver = null;
const soundState = { enabled: loadSoundPreference(), pools: {} };
const bgmState = {
  enabled: loadMusicPreference(),
  unlocked: false,
  usingSampleEngine: false,
  fallbackAudio: null,
  audioContext: null,
  player: null,
  gainNode: null,
  schedulerId: null,
  nextLoopTime: 0,
};

function loadBooleanPreference(key, defaultValue = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value !== "off";
  } catch {
    return defaultValue;
  }
}

function loadSoundPreference() {
  return loadBooleanPreference(SOUND_PREF_KEY);
}

function loadMusicPreference() {
  return loadBooleanPreference(MUSIC_PREF_KEY);
}

function ensureSoundPool(key) {
  if (soundState.pools[key]) return soundState.pools[key];
  const cfg = SOUND_LIBRARY[key];
  if (!cfg) return [];
  const pool = Array.from({ length: cfg.voices || 1 }, () => {
    const audio = new Audio(cfg.src);
    audio.preload = "auto";
    audio.volume = cfg.volume;
    return audio;
  });
  soundState.pools[key] = pool;
  return pool;
}

function warmSoundCache() {
  Object.keys(SOUND_LIBRARY).forEach((key) => { ensureSoundPool(key); });
}

function ensureFallbackBgmAudio() {
  if (bgmState.fallbackAudio) return bgmState.fallbackAudio;
  const audio = new Audio(BGM_CONFIG.fallbackSrc);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = BGM_CONFIG.volume;
  bgmState.fallbackAudio = audio;
  return audio;
}

function stopAllSounds() {
  Object.values(soundState.pools).flat().forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function playManagedAudio(audio) {
  const promise = audio.play();
  if (promise?.catch) promise.catch(() => {});
}

function updateSoundToggleButton() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = `音效：${soundState.enabled ? "开" : "关"}`;
  soundToggleBtn.setAttribute("aria-pressed", String(soundState.enabled));
}

function updateMusicToggleButton() {
  if (!musicToggleBtn) return;
  musicToggleBtn.textContent = `音乐：${bgmState.enabled ? "开" : "关"}`;
  musicToggleBtn.setAttribute("aria-pressed", String(bgmState.enabled));
}

function noteToMidi(note) {
  if (note === null) return null;
  const match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!match) return null;
  const [, key, octaveText] = match;
  return (parseInt(octaveText, 10) + 1) * 12 + NOTE_OFFSETS[key];
}

function barTime(barIndex, beatOffset = 0) {
  return (barIndex * BGM_CONFIG.beatsPerBar + beatOffset) * (60 / BGM_CONFIG.bpm);
}

function canUseSampleBgm() {
  return typeof WebAudioFontPlayer === "function"
    && typeof window[BGM_LIBRARY.piano] !== "undefined"
    && typeof window[BGM_LIBRARY.bass] !== "undefined"
    && typeof window[BGM_LIBRARY.strings] !== "undefined"
    && typeof window[BGM_LIBRARY.kick] !== "undefined";
}

function ensureBgmEngine() {
  if (!canUseSampleBgm()) return null;
  if (bgmState.player && bgmState.audioContext && bgmState.gainNode) return bgmState;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  const audioContext = bgmState.audioContext || new AudioContextCtor();
  const player = bgmState.player || new WebAudioFontPlayer();
  const gainNode = bgmState.gainNode || audioContext.createGain();
  gainNode.gain.value = BGM_CONFIG.volume;
  gainNode.connect(audioContext.destination);
  Object.values(BGM_LIBRARY).forEach((name) => {
    player.loader.decodeAfterLoading(audioContext, name);
  });
  bgmState.audioContext = audioContext;
  bgmState.player = player;
  bgmState.gainNode = gainNode;
  bgmState.usingSampleEngine = true;
  return bgmState;
}

function queuePresetNote(presetName, when, pitch, duration, volume = 0.5) {
  const engine = ensureBgmEngine();
  if (!engine || pitch === null) return;
  engine.player.queueWaveTable(
    engine.audioContext,
    engine.gainNode,
    window[presetName],
    when,
    pitch,
    duration,
    volume,
  );
}

function scheduleBgmLoop(startTime) {
  const beat = 60 / BGM_CONFIG.bpm;
  for (let bar = 0; bar < BGM_CONFIG.loopBars; bar++) {
    const chord = BGM_PROGRESSION[bar];
    const lead = BGM_LEAD[bar];
    const sparkle = BGM_SPARKLE[bar];
    const bassRoot = noteToMidi(BGM_BASS[bar]);
    const barStart = startTime + barTime(bar);

    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[0]), beat * 3.8, 0.17);
    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[2]), beat * 3.6, 0.13);
    queuePresetNote(BGM_LIBRARY.strings, barStart, noteToMidi(chord[3]), beat * 3.6, 0.12);

    queuePresetNote(BGM_LIBRARY.piano, barStart, noteToMidi(chord[0]), beat * 1.55, 0.34);
    queuePresetNote(BGM_LIBRARY.piano, barStart, noteToMidi(chord[1]), beat * 1.45, 0.28);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 2, noteToMidi(chord[1]), beat * 1.4, 0.26);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 2, noteToMidi(chord[2]), beat * 1.4, 0.22);
    queuePresetNote(BGM_LIBRARY.piano, barStart + beat * 3.5, noteToMidi(chord[0]), beat * 0.3, 0.15);

    queuePresetNote(BGM_LIBRARY.bass, barStart, bassRoot, beat * 0.9, 0.42);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat, bassRoot, beat * 0.65, 0.28);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat * 2, bassRoot + 7, beat * 0.85, 0.35);
    queuePresetNote(BGM_LIBRARY.bass, barStart + beat * 3, bassRoot, beat * 0.8, 0.3);

    for (let step = 0; step < 8; step++) {
      const when = barStart + step * (beat * 0.5);
      queuePresetNote(BGM_LIBRARY.hatClosed, when, 42, 0.05, 0.11);
      if (step % 2 === 1) {
        queuePresetNote(BGM_LIBRARY.bell, when, noteToMidi(sparkle[step]), beat * 0.28, 0.12);
      }
    }

    queuePresetNote(BGM_LIBRARY.kick, barStart, 36, 0.18, 0.5);
    queuePresetNote(BGM_LIBRARY.snare, barStart + beat, 38, 0.16, 0.22);
    queuePresetNote(BGM_LIBRARY.kick, barStart + beat * 2, 36, 0.18, 0.44);
    queuePresetNote(BGM_LIBRARY.snare, barStart + beat * 3, 38, 0.16, 0.24);
    queuePresetNote(BGM_LIBRARY.hatOpen, barStart + beat * 3.5, 46, 0.12, 0.12);

    for (let step = 0; step < lead.length; step++) {
      queuePresetNote(
        BGM_LIBRARY.vibes,
        barStart + step * (beat * 0.5),
        noteToMidi(lead[step]),
        beat * (step % 2 === 0 ? 0.42 : 0.34),
        0.24,
      );
    }
  }
}

function setSoundEnabled(enabled) {
  soundState.enabled = enabled;
  if (!enabled) stopAllSounds();
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // 忽略本地存储不可用的情况。
  }
  updateSoundToggleButton();
}

function syncBgmPlayback() {
  if (bgmState.gainNode) bgmState.gainNode.gain.value = BGM_CONFIG.volume;
  if (!bgmState.enabled || !bgmState.unlocked || document.hidden) {
    stopBgmPlayback();
    return;
  }
  startBgmPlayback();
}

function unlockBgmPlayback() {
  if (bgmState.unlocked) return;
  bgmState.unlocked = true;
  const engine = ensureBgmEngine();
  if (engine?.audioContext?.state === "suspended") {
    engine.audioContext.resume().catch(() => {});
  }
  syncBgmPlayback();
}

function setMusicEnabled(enabled) {
  bgmState.enabled = enabled;
  try {
    localStorage.setItem(MUSIC_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // 忽略本地存储不可用的情况。
  }
  updateMusicToggleButton();
  syncBgmPlayback();
}

function startBgmPlayback() {
  const engine = ensureBgmEngine();
  if (engine) {
    if (engine.audioContext.state === "suspended") {
      engine.audioContext.resume().catch(() => {});
    }
    if (engine.schedulerId) return;
    engine.nextLoopTime = Math.max(engine.audioContext.currentTime + 0.12, engine.nextLoopTime || 0);
    const schedule = () => {
      while (engine.nextLoopTime < engine.audioContext.currentTime + BGM_CONFIG.scheduleAheadTime) {
        scheduleBgmLoop(engine.nextLoopTime);
        engine.nextLoopTime += barTime(BGM_CONFIG.loopBars);
      }
    };
    schedule();
    engine.schedulerId = window.setInterval(schedule, BGM_CONFIG.schedulerIntervalMs);
    return;
  }
  const audio = ensureFallbackBgmAudio();
  audio.volume = BGM_CONFIG.volume * 0.45;
  playManagedAudio(audio);
}

function stopBgmPlayback() {
  if (bgmState.schedulerId) {
    window.clearInterval(bgmState.schedulerId);
    bgmState.schedulerId = null;
  }
  if (bgmState.player && bgmState.audioContext) {
    bgmState.player.cancelQueue(bgmState.audioContext);
    bgmState.nextLoopTime = bgmState.audioContext.currentTime + 0.12;
  }
  if (bgmState.fallbackAudio) {
    bgmState.fallbackAudio.pause();
  }
}

function playSound(key, options = {}) {
  if (!soundState.enabled) return;
  const cfg = SOUND_LIBRARY[key];
  if (!cfg) return;
  const pool = ensureSoundPool(key);
  if (!pool.length) return;
  const audio = pool.find((item) => item.paused || item.ended) || pool[0];
  const volumeMultiplier = options.volumeMultiplier ?? 1;
  audio.pause();
  audio.currentTime = 0;
  audio.playbackRate = options.rate ?? 1;
  audio.volume = Math.max(0, Math.min(1, cfg.volume * volumeMultiplier));
  playManagedAudio(audio);
}

function defaultEffects() {
  return { speedBoost: false, speedSlow: false, shield: false, doubleRent: false, frozen: false, extraTurn: false, reversed: false, hotSpringRest: false, bankruptcyRelief: false };
}

function initializeGame() {
  if (modalResolver) { modalResolver("cancel"); modalResolver = null; }
  state = {
    sessionId: ++sessionCounter,
    round: 1,
    currentPlayerIndex: 0,
    phase: "await_roll",
    board: createBoard(),
    players: PLAYER_DEFS.map((p) => ({
      ...p,
      cash: CONFIG.startCash,
      displayedCash: CONFIG.startCash,
      cashDelta: 0, cashDeltaVisible: false, cashPulse: false,
      cashAnimFrame: null, cashChangeToken: 0, pendingCashDelta: 0,
      position: 0,
      effects: defaultEffects(),
    })),
    lastDice: null, logs: [], gameOver: false, busy: false,
    passedStartThisTurn: false, bankPool: 0,
    gameMode: state?.gameMode ?? "rounds",
    statusTitle: "", statusDescription: "",
    animation: { currentTile: null, landedTile: null, diceRolling: false, diceResult: false, boardBurst: false },
    modal: defaultModal(),
  };
  pushLog(`游戏开始，双方初始资金均为 ${formatMoney(CONFIG.startCash)}。`);
  setHumanTurnStatus();
  updateSoundToggleButton();
  updateMusicToggleButton();
  render();
}

function defaultModal() {
  return { visible: false, label: "行动提示", title: "", message: "", buttons: [], cardDraw: false };
}

// ─── 开始界面控制 ─────────────────────────────────────────
const startScreenEl = document.getElementById("start-screen");
const historyOverlayEl = document.getElementById("history-overlay");
const historyListEl = document.getElementById("history-list");
const startPlayBtn = document.getElementById("start-play-btn");
const startHistoryBtn = document.getElementById("start-history-btn");
const historyCloseBtn = document.getElementById("history-close-btn");
const modeEyebrowEl = document.getElementById("mode-eyebrow");

function showStartScreen() {
  startScreenEl?.classList.remove("hidden");
}
function hideStartScreen() {
  startScreenEl?.classList.add("hidden");
}
function showHistoryOverlay() {
  renderHistoryList();
  historyOverlayEl?.classList.remove("hidden");
}
function hideHistoryOverlay() {
  historyOverlayEl?.classList.add("hidden");
}

startPlayBtn?.addEventListener("click", () => void startNewGame());
startHistoryBtn?.addEventListener("click", showHistoryOverlay);
historyCloseBtn?.addEventListener("click", hideHistoryOverlay);
historyOverlayEl?.addEventListener("click", (e) => {
  if (e.target === historyOverlayEl) hideHistoryOverlay();
});

// ─── 历史对局记录 ──────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveGameResult(reason, winnerId) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const record = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    mode: state.gameMode,
    rounds: state.round - 1,
    winner: winnerId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, cash: p.cash })),
  };
  const history = loadHistory();
  history.unshift(record);
  if (history.length > 50) history.splice(50);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}
function renderHistoryList() {
  if (!historyListEl) return;
  const history = loadHistory();
  if (history.length === 0) {
    historyListEl.innerHTML = `<div class="history-empty">暂无历史对局记录</div>`;
    return;
  }
  historyListEl.innerHTML = history.map((rec) => {
    const modeLabel = rec.mode === "bankruptcy" ? "破产淘汰制" : `30 回合制（${rec.rounds} 回合）`;
    const winnerName = rec.winner === "draw"
      ? "平局"
      : (rec.players?.find((p) => p.id === rec.winner)?.name ?? rec.winner);
    const isHumanWin = rec.winner === "human";
    const isDraw = rec.winner === "draw";
    const resultCls = isDraw ? "draw" : (isHumanWin ? "win" : "lose");
    const resultText = isDraw ? "⚖️ 平局" : (isHumanWin ? `🏆 ${winnerName} 胜` : `💔 ${winnerName} 胜`);
    const cashRow = rec.players
      ? rec.players.map((p) => `${p.name} ¥${p.cash}`).join("　vs　")
      : "";
    return `<div class="history-record">
      <div class="history-record-date">${rec.date}<br>${rec.time}</div>
      <div class="history-record-result ${resultCls}">${resultText}</div>
      <div class="history-record-cash">${cashRow}</div>
      <div class="history-record-mode">${modeLabel}</div>
    </div>`;
  }).join("");
}

// ─── 模式选择 ──────────────────────────────────────────────
async function selectGameMode(sid) {
  const choice = await showModal({
    label: "模式选择",
    title: "选择游戏模式",
    message: "30 回合制：满30回合后现金最多者胜。\n破产淘汰制：无力偿还过路费即告破产，对手获胜。",
    buttons: [
      { id: "rounds", label: "🕐 30 回合制", variant: "primary" },
      { id: "bankruptcy", label: "💸 破产淘汰制", variant: "ghost" },
    ],
  });
  if (!isSessionActive(sid)) return undefined;
  return choice === "bankruptcy" ? "bankruptcy" : "rounds";
}

async function coinFlipForFirstPlayer(sid) {
  await showModal({
    label: "先手决定",
    title: "掷硬币！",
    message: "正面 = 玩家先手\n反面 = AI 先手\n\n抛出硬币，决定谁率先行动！",
    buttons: [{ id: "flip", label: "🪙 抛出硬币", variant: "primary" }],
  });
  if (!isSessionActive(sid)) return undefined;
  const humanFirst = Math.random() < 0.5;
  pushLog(`先手决定：硬币 ${humanFirst ? "正面" : "反面"}，${humanFirst ? "玩家" : "AI 对手"}先手！`);
  await showContinueModal({
    label: "先手决定",
    title: humanFirst ? "🪙 正面！玩家先手！" : "🪙 反面！AI 先手！",
    message: humanFirst
      ? "玩家获得先手权，祝你好运！"
      : "AI 率先行动，准备好应对挑战！",
  });
  if (!isSessionActive(sid)) return undefined;
  return humanFirst;
}

async function startNewGame() {
  hideStartScreen();
  initializeGame();
  const sid = state.sessionId;

  // 模式选择
  const mode = await selectGameMode(sid);
  if (!isSessionActive(sid) || mode === undefined) { showStartScreen(); return; }
  state.gameMode = mode;
  updateModeEyebrow();

  // 硬币决定先手
  const humanFirst = await coinFlipForFirstPlayer(sid);
  if (!isSessionActive(sid) || humanFirst === undefined) { showStartScreen(); return; }
  if (!humanFirst) {
    state.currentPlayerIndex = 1;
    setAiTurnStatus();
    render();
    void startAiTurnWithDelay(sid);
  } else {
    setHumanTurnStatus();
    render();
  }
}

function updateModeEyebrow() {
  if (!modeEyebrowEl) return;
  modeEyebrowEl.textContent = state.gameMode === "bankruptcy"
    ? "破产淘汰制 · 环形地图休闲对战"
    : "30 回合制 · 环形地图休闲对战";
}

function createBoard() {
  const lotConfigs = {
    1:  { price: 80,  buildCosts: [0, 40, 70, 110],  tolls: [20, 60, 130, 220],  themeIdx: 0 },
    2:  { price: 90,  buildCosts: [0, 42, 75, 115],  tolls: [22, 65, 140, 235],  themeIdx: 0 },
    3:  { price: 95,  buildCosts: [0, 44, 78, 120],  tolls: [24, 68, 148, 246],  themeIdx: 0 },
    5:  { price: 240, buildCosts: [0, 80, 130, 185], tolls: [55, 140, 280, 460], themeIdx: 3 },
    7:  { price: 210, buildCosts: [0, 72, 118, 172], tolls: [48, 125, 250, 415], themeIdx: 3 },
    10: { price: 140, buildCosts: [0, 55, 95, 140],  tolls: [34, 90, 180, 300],  themeIdx: 1 },
    11: { price: 150, buildCosts: [0, 58, 100, 145], tolls: [36, 95, 190, 315],  themeIdx: 1 },
    12: { price: 170, buildCosts: [0, 62, 105, 155], tolls: [40, 105, 210, 345], themeIdx: 1 },
    14: { price: 280, buildCosts: [0, 90, 145, 210], tolls: [65, 160, 320, 530], themeIdx: 2 },
    16: { price: 180, buildCosts: [0, 65, 110, 160], tolls: [42, 110, 220, 360], themeIdx: 2 },
    18: { price: 70,  buildCosts: [0, 35, 65, 100],  tolls: [18, 55, 120, 200],  themeIdx: 0 },
    19: { price: 80,  buildCosts: [0, 40, 70, 110],  tolls: [20, 60, 130, 220],  themeIdx: 0 },
    21: { price: 90,  buildCosts: [0, 42, 75, 115],  tolls: [22, 65, 140, 235],  themeIdx: 0 },
  };

  const board = ROUTE_POSITIONS.map((pos, index) => {
    const tile = {
      index, name: TILE_NAMES[index], x: pos.x, y: pos.y,
      isStart: index === 0,
      isSpecial: !!SPECIAL_TILES[index],
      special: SPECIAL_TILES[index] || null,
        lot: null,
      isLargeSecondary: !!LARGE_LOT_LINKS[index],
      largePrimaryIndex: LARGE_LOT_LINKS[index] ?? null,
    };
    if (tile.isStart || tile.isSpecial || tile.isLargeSecondary) return tile;
    const cfg = lotConfigs[index];
    if (!cfg) return tile;
    const isLarge = Object.values(LARGE_LOT_LINKS).includes(index);
    tile.lot = {
      ownerId: null, level: 0,
      price: cfg.price, buildCosts: cfg.buildCosts, tolls: cfg.tolls,
      theme: LOT_THEMES[cfg.themeIdx],
        district: DISTRICT_CONFIG[index],
      isLarge,
    };
    return tile;
  });

  board.forEach((tile) => {
    if (tile.isLargeSecondary && tile.largePrimaryIndex !== null) {
      tile.lot = board[tile.largePrimaryIndex].lot;
    }
  });
  return board;
}

function currentPlayer() { return state.players[state.currentPlayerIndex]; }
function getPlayerById(id) { return state.players.find((p) => p.id === id); }
function getOpponent(player) { return state.players.find((p) => p.id !== player.id); }
function formatMoney(n) { return `¥${n}`; }
function rollDice() { return Math.floor(Math.random() * 6) + 1; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isSessionActive(sid) { return state.sessionId === sid; }

function pushLog(msg) {
  state.logs.push(`第 ${state.gameMode === "bankruptcy" ? state.round : Math.min(state.round, CONFIG.maxRounds)} 回合 · ${msg}`);
  if (state.logs.length > 24) state.logs.shift();
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function updatePlayerCash(player, delta, animateNow = true) {
  if (!delta) return;
  player.cash += delta;
  if (!animateNow) { player.pendingCashDelta += delta; return; }
  const merged = delta + player.pendingCashDelta;
  player.pendingCashDelta = 0;
  startCashAnimation(player, player.displayedCash ?? (player.cash - merged), player.cash, merged);
}

function startCashAnimation(player, prev, next, delta) {
  player.cashDelta = delta;
  player.cashDeltaVisible = true;
  player.cashPulse = true;
  player.cashChangeToken += 1;
  const token = player.cashChangeToken;
  const sid = state.sessionId;
  if (player.cashAnimFrame) cancelAnimationFrame(player.cashAnimFrame);
  const start = performance.now();
  const dur = 760;
  const step = (now) => {
    if (state.sessionId !== sid || player.cashChangeToken !== token) return;
    const t = Math.min((now - start) / dur, 1);
    player.displayedCash = Math.round(prev + (next - prev) * t);
    render();
    if (t < 1) player.cashAnimFrame = requestAnimationFrame(step);
    else { player.displayedCash = next; player.cashAnimFrame = null; render(); }
  };
  player.cashAnimFrame = requestAnimationFrame(step);
  setTimeout(() => {
    if (state.sessionId !== sid || player.cashChangeToken !== token) return;
    player.cashDeltaVisible = false; player.cashPulse = false; render();
  }, 1300);
}

function flushQueuedCashAnimations() {
  state.players.forEach((p) => {
    if (!p.pendingCashDelta) return;
    const d = p.pendingCashDelta; p.pendingCashDelta = 0;
    startCashAnimation(p, p.displayedCash ?? (p.cash - d), p.cash, d);
  });
}

function getRoundLabel() {
  return state.gameMode === "bankruptcy"
    ? `第 ${state.round} 回合`
    : `第 ${state.round} / ${CONFIG.maxRounds} 回合`;
}

function setHumanTurnStatus() {
  state.phase = "await_roll"; state.busy = false;
  state.statusTitle = `${getRoundLabel()}：${currentPlayer().name} 行动`;
  state.statusDescription = "点击掷骰子开始行动！掷出6点可获得额外一个完整回合。";
  clearHighlights(); hideModal(false);
}

function setAiTurnStatus() {
  state.phase = "locked"; state.busy = true;
  state.statusTitle = `${getRoundLabel()}：${currentPlayer().name} 行动`;
  state.statusDescription = "AI 正在掷骰并自动完成买地、升级和收费。";
  clearHighlights(); hideModal(false);
}

function clearHighlights() {
  state.animation.currentTile = null; state.animation.landedTile = null;
  state.animation.diceResult = false; state.animation.boardBurst = false;
}

function render() {
  renderBoard(); renderScoreboard(); renderMiniScoreboard(); renderLogs(); renderStatus(); updateControls(); renderModal();
}

function renderBoard() {
  boardEl.className = `board${state.animation.boardBurst ? " burst" : ""}`;
  boardEl.innerHTML = "";
  state.board.forEach((tile) => {
    if (tile.isLargeSecondary) return;
    const el = document.createElement("div");
    const cls = ["tile"];
    const isLargePrimary = tile.lot?.isLarge;
    const secTile = isLargePrimary ? state.board.find((t) => t.largePrimaryIndex === tile.index) : null;
    const checkIdx = secTile ? [tile.index, secTile.index] : [tile.index];
    if (tile.isStart) cls.push("start");
    if (tile.isSpecial) { cls.push("special"); cls.push(`special-${tile.special.type}`); }
    if (checkIdx.some((i) => state.animation.currentTile === i)) cls.push("walking");
    if (checkIdx.some((i) => state.animation.landedTile === i)) cls.push("landed");
    if (tile.lot?.ownerId) { cls.push("owned", `owned-${tile.lot.ownerId}`); }
    if (isLargePrimary) cls.push("large-lot-merged");
    const here = state.players.filter((p) => checkIdx.includes(p.position));
    if (here.length > 0) {
      cls.push("has-players");
      el.style.setProperty("--player-here-a", hexToRgba(here[0].color, 0.45));
      el.style.setProperty("--player-here-b", hexToRgba(here[here.length - 1].color, 0.25));
    }
    el.className = cls.join(" ");
    if (isLargePrimary && secTile) {
      if (tile.x === secTile.x) {
        el.style.gridColumn = String(tile.x);
        el.style.gridRow = `${Math.min(tile.y, secTile.y)} / span 2`;
      } else {
        el.style.gridColumn = `${Math.min(tile.x, secTile.x)} / span 2`;
        el.style.gridRow = String(tile.y);
      }
    } else {
      el.style.gridColumn = String(tile.x);
      el.style.gridRow = String(tile.y);
    }
    if (tile.lot?.ownerId) el.style.setProperty("--owner-accent", getPlayerById(tile.lot.ownerId).color);
    else el.style.removeProperty("--owner-accent");

    el.dataset.tileIndex = tile.index;
    if (tile.isStart) el.innerHTML = renderStartTile(tile);
    else if (tile.isSpecial) el.innerHTML = renderSpecialTile(tile);
    else if (isLargePrimary) el.innerHTML = renderLargeLotMerged(tile, secTile);
    else el.innerHTML = renderLotTile(tile);
    boardEl.appendChild(el);
  });
}

function renderStartTile(tile) {
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span></div>
    <span class="lot-badge" style="background:#fde68a;">市政府</span>
    <div class="lot-body"><div class="lot-owner">经过领 ${formatMoney(CONFIG.startBonus)}</div></div>
    <div class="sprite-wrap">${createStartSvg()}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderLotTile(tile) {
  const lot = tile.lot;
  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerText = owner ? owner.name : "待售";
  const ownerStyle = owner ? `style="color:${owner.color};"` : "";
  const tag = lot.level > 0 ? `<span class="building-tag">Lv.${lot.level}</span>` : "";
  const sprite = lot.level > 0
    ? createBuildingSvg(lot.theme.key, lot.level, owner?.color ?? lot.theme.color)
    : createLotBaseSprite(!!lot.ownerId);
  const distColor = DISTRICT_COLORS[lot.district] || "#e2e8f0";
  const forSaleBadge = !owner ? `<span class="for-sale-badge">待售 <b>¥${lot.price}</b></span>` : "";
  const tollRow = owner ? `<div class="lot-price-toll">收费 ${formatMoney(lot.tolls[lot.level])}</div>` : "";
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span>${forSaleBadge}</div>
    <span class="lot-badge" style="background:${lot.theme.color};">${lot.theme.label}</span>
    <div class="lot-body"><div class="lot-owner" ${ownerStyle}>${ownerText}</div>${tollRow}</div>
    <div class="sprite-wrap">${tag}${sprite}</div>
    <div class="district-bar" style="background:${distColor};">${lot.district}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderLargeLotMerged(tile, secTile) {
  const lot = tile.lot;
  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerText = owner ? owner.name : "待售";
  const ownerStyle = owner ? `style="color:${owner.color};"` : "";
  const tag = lot.level > 0 ? `<span class="building-tag">Lv.${lot.level}</span>` : "";
  const sprite = lot.level > 0
    ? createBuildingSvg(lot.theme.key, lot.level, owner?.color ?? lot.theme.color, true)
    : createLotBaseSprite(!!lot.ownerId);
  const distColor = DISTRICT_COLORS[lot.district] || "#e2e8f0";
  const isVertical = secTile && tile.x === secTile.x;
  let cellA, cellB;
  if (isVertical) {
    cellA = tile.y < (secTile?.y ?? 99) ? tile.index : secTile.index;
    cellB = tile.y < (secTile?.y ?? 99) ? secTile.index : tile.index;
  } else {
    cellA = tile.x < (secTile?.x ?? 99) ? tile.index : secTile.index;
    cellB = tile.x < (secTile?.x ?? 99) ? secTile.index : tile.index;
  }
  const forSaleBadge = !owner ? `<span class="for-sale-badge">待售 <b>¥${lot.price}</b></span>` : "";
  const tollRow = owner ? `<div class="lot-price-toll">收费 ${formatMoney(lot.tolls[lot.level])}</div>` : "";
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span>${forSaleBadge}</div>
    <span class="lot-badge" style="background:${lot.theme.color};">${lot.theme.label}·大型地产</span>
    <div class="lot-body"><div class="lot-owner" ${ownerStyle}>${ownerText}</div>${tollRow}</div>
    <div class="sprite-wrap">${tag}${sprite}</div>
    <div class="district-bar" style="background:${distColor};">${lot.district}</div>
    <div class="large-lot-cells${isVertical ? " vertical" : ""}">
      <div class="large-lot-cell">${renderTokens(cellA)}</div>
      <div class="large-lot-cell">${renderTokens(cellB)}</div>
    </div>`;
}

function renderSpecialTile(tile) {
  let extra = "";
  if (tile.special.type === "bank") {
    const pool = state.bankPool || 0;
    const threshold = 200;
    extra = pool >= threshold
      ? `<div class="bank-pool bank-full">金库 ${formatMoney(pool)} 可提！</div>`
      : `<div class="bank-pool">金库 ${formatMoney(pool)} / ${formatMoney(threshold)}</div>`;
  }
  return `<div class="tile-header"><span class="tile-name">${tile.name}</span></div>
    <span class="lot-badge" style="background:${tile.special.color};">${tile.special.label}</span>
    <div class="lot-body"><div class="lot-owner">${tile.special.description}</div>
    <div class="lot-price">停留生效</div></div>
    ${extra}
    <div class="sprite-wrap">${createSpecialSvg(tile.special.type)}</div>
    <div class="token-row">${renderTokens(tile.index)}</div>`;
}

function renderTokens(idx) {
  return state.players
    .filter((p) => p.position === idx)
    .map((p) => {
      const bc = state.animation.landedTile === idx ? " token-bounce" : "";
      return `<span class="token${bc}" style="background:${p.color};--token-color:${p.color};" title="${p.name}">${p.name[0]}</span>`;
    }).join("");
}

function renderScoreboard() {
  const winner = state.gameOver ? getWinnerText() : "";
  scoreboardEl.innerHTML = "";
  if (winner) {
    const wb = document.createElement("div");
    wb.className = "winner-banner";
    wb.innerHTML = `<div class="winner-text">${winner}</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button class="play-again-btn" type="button">🎮 再来一局</button>
        <button class="view-history-btn" type="button">📋 历史记录</button>
      </div>`;
    scoreboardEl.appendChild(wb);
  }
  state.players.forEach((p) => {
    const lots = state.board.filter((t) => t.lot?.ownerId === p.id && !t.isLargeSecondary);
    const totalLv = lots.reduce((s, t) => s + t.lot.level, 0);
    const card = document.createElement("div");
    card.className = `player-card${p.id === currentPlayer().id && !state.gameOver ? " active" : ""}${p.cashPulse ? " cash-changing" : ""}`;
    const dc = Math.round(p.displayedCash ?? p.cash);
    const dt = p.cashDelta > 0 ? `+${formatMoney(p.cashDelta)}` : `-${formatMoney(Math.abs(p.cashDelta))}`;
    const efx = [];
    if (p.effects.speedBoost) efx.push("⚡加速");
    if (p.effects.speedSlow) efx.push("🐌减速");
    if (p.effects.shield) efx.push("🛡️护盾");
    if (p.effects.doubleRent) efx.push("💎翻倍");
    if (p.effects.frozen) efx.push("🪤绊脚");
    if (p.effects.hotSpringRest) efx.push("♨️休息中");
    if (p.effects.bankruptcyRelief) efx.push("🆘等待救援");
    if (p.effects.extraTurn) efx.push("🥁连击");
    if (p.effects.reversed) efx.push("🔃逆行");
    const efxHtml = efx.length > 0 ? `<div class="player-effects">${efx.map((e) => `<span class="effect-chip">${e}</span>`).join("")}</div>` : "";
    card.innerHTML = `
      <div class="player-title">
        <div class="player-name"><span class="player-dot" style="background:${p.color};"></span><span>${p.name}</span></div>
        <span class="meta-chip">${p.isAi ? "AI" : "玩家"}</span>
      </div>
      <div class="player-cash-row">
        <span class="player-cash-label">剩余金钱</span>
        <div class="player-cash-main">
          <span class="player-cash-value${p.cashPulse ? " animate" : ""}">${formatMoney(dc)}</span>
          ${p.cashDeltaVisible ? `<span class="player-cash-delta ${p.cashDelta > 0 ? "positive" : "negative"}">${dt}</span>` : ""}
        </div>
      </div>
      ${efxHtml}
      <div class="player-meta">
        <span class="meta-chip">地产 ${lots.length} 块</span>
        <span class="meta-chip">建筑等级 ${totalLv}</span>
        <span class="meta-chip">位置 ${state.board[p.position].name}</span>
      </div>`;
    scoreboardEl.appendChild(card);
  });
}

function renderMiniScoreboard() {
  const el = document.getElementById("mini-scoreboard");
  if (!el) return;
  const [p0, p1] = state.players;
  const activeId = state.gameOver ? null : currentPlayer().id;
  const mkPlayer = (p, alignRight) => {
    const dc = Math.round(p.displayedCash ?? p.cash);
    const dt = p.cashDelta > 0 ? `+${p.cashDelta}` : `${p.cashDelta}`;
    const deltaHtml = p.cashDeltaVisible
      ? `<span class="mini-delta ${p.cashDelta > 0 ? "pos" : "neg"}">${dt}</span>` : "";
    return `<div class="mini-player${p.id === activeId ? " active" : ""}${alignRight ? " mini-player-right" : ""}">
      <span class="mini-dot" style="background:${p.color};"></span>
      <span class="mini-name">${p.isAi ? "AI" : "玩家"}</span>
      <span class="mini-cash">¥${dc}</span>${deltaHtml}
    </div>`;
  };
  el.innerHTML = mkPlayer(p0, false) + `<span class="mini-vs">vs</span>` + mkPlayer(p1, true);
}

function getLogPlayerColor(text) {
  for (const p of PLAYER_DEFS) { if (text.includes(p.name)) return p.color; }
  return "#94a3b8";
}

function renderLogs() {
  logListEl.innerHTML = state.logs.slice().reverse().map((item) => {
    const c = getLogPlayerColor(item);
    return `<div class="log-item"><span class="log-dot" style="background:${c};"></span><span class="log-text">${item}</span></div>`;
  }).join("");
}

function renderStatus() {
  document.body.dataset.turn = currentPlayer().id;
  turnTitleEl.textContent = state.statusTitle;
  turnDescriptionEl.textContent = state.statusDescription;
  if (state.gameMode === "bankruptcy") {
    roundChipEl.textContent = `第 ${state.round} 回合 · 破产淘汰制`;
    roundProgressBarEl.style.width = "0%";
  } else {
    roundChipEl.textContent = `第 ${Math.min(state.round, CONFIG.maxRounds)} / ${CONFIG.maxRounds} 回合`;
    roundProgressBarEl.style.width = `${Math.min((state.round - 1) / CONFIG.maxRounds * 100, 100)}%`;
  }
  diceBoxEl.textContent = state.lastDice ?? "-";
  if (state.lastDice) centerDiceValueEl.innerHTML = renderDiceFaceSvg(state.lastDice);
  else centerDiceValueEl.textContent = "-";
  const isIdle = !state.animation.diceRolling && !state.animation.diceResult && !state.gameOver && !state.modal.visible;
  centerDiceEl.classList.toggle("idle", isIdle);
  centerDiceEl.classList.toggle("rolling", state.animation.diceRolling);
  centerDiceEl.classList.toggle("result", state.animation.diceResult === true);
  centerTitleEl.textContent = state.statusTitle;
  centerDescriptionEl.textContent = state.statusDescription;
  centerPlayerBadgeEl.textContent = `当前：${currentPlayer().name}`;
  centerPhaseBadgeEl.textContent = getPhaseLabel();
}

function renderModal() {
  const m = state.modal;
  eventOverlayEl.classList.toggle("visible", m.visible);
  eventLabelEl.textContent = m.label || "行动提示";
  eventTitleEl.textContent = m.title || "";
  eventMessageEl.textContent = m.message || "";
  const ico = EVENT_ICON_MAP[m.label] || { emoji: "📋", cls: "event-info" };
  eventIconWrapEl.innerHTML = m.visible ? `<div class="event-icon ${ico.cls}">${ico.emoji}</div>` : "";
  if (m.cardDraw) {
    eventActionsEl.className = "event-actions card-draw-actions";
    eventActionsEl.innerHTML = m.buttons
      .map((b) => `<button class="modal-btn ${b.variant || "ghost"}" data-action="${b.id}">${b.label}</button>`).join("");
  } else {
    eventActionsEl.className = "event-actions";
    eventActionsEl.innerHTML = m.buttons
      .map((b) => `<button class="modal-btn ${b.variant || "ghost"}" data-action="${b.id}">${b.label}</button>`).join("");
  }
}

function updateControls() {
  rollBtn.disabled = state.gameOver || state.busy || currentPlayer().isAi || state.phase !== "await_roll";
}

function getPhaseLabel() {
  if (state.gameOver) return "已结束";
  if (state.animation.diceRolling) return "骰子滚动中";
  if (state.animation.currentTile !== null) return "棋子移动中";
  if (state.modal.visible) return "等待确认";
  if (currentPlayer().isAi && state.busy) return "AI 思考中";
  return state.phase === "await_roll" ? "等待掷骰" : "结算中";
}

async function playHumanTurn() {
  if (state.gameOver || state.busy || currentPlayer().isAi || state.phase !== "await_roll") return;
  await processTurn(currentPlayer());
}

async function playAiTurn() {
  if (state.gameOver || !currentPlayer().isAi) return;
  await processTurn(currentPlayer());
}

async function processTurn(player, isExtraTurn = false) {
  const sid = state.sessionId;
  state.busy = true; state.phase = "locked"; state.passedStartThisTurn = false;
  hideModal(false); render();

  if (player.effects.bankruptcyRelief) {
    player.effects.bankruptcyRelief = false;
    player.effects.frozen = false;
    player.effects.hotSpringRest = false;
    pushLog(`${player.name} 正在等待救援资金，本回合无法行动。`);
    state.statusTitle = `${player.name} 等待救援`;
    state.statusDescription = "资金告急，等待救援资金到账，本回合跳过。";
    render();
    await showContinueModal({ label: "等待救援", title: `${player.name} 等待救援资金`, message: "破产救助期间无法行动，救援资金已到账，下回合恢复行动！" });
    if (!isSessionActive(sid)) return;
    endTurn(); return;
  }

  if (player.effects.hotSpringRest) {
    player.effects.hotSpringRest = false;
    pushLog(`${player.name} 在温泉庄园休息完毕，恢复行动。`);
    state.statusTitle = `${player.name} 休息结束`;
    state.statusDescription = "温泉休息结束，准备恢复行动。";
    render();
    await showContinueModal({ label: "温泉休息", title: `♨️ ${player.name} 休息结束`, message: "温泉庄园的休息时间已过，下回合可以正常行动。" });
    if (!isSessionActive(sid)) return;
    if (player.effects.frozen) {
      player.effects.frozen = false;
      pushLog(`${player.name} 刚从温泉醒来就被绊脚术绊住！重新入住温泉并结算！`);
      await showContinueModal({ label: "绊脚效果", title: `${player.name} 被绊住！`, message: "绊脚术生效，无法移动，重新结算当前地块！" });
      if (!isSessionActive(sid)) return;
      const frozenTile = state.board[player.position];
      state.animation.landedTile = frozenTile.index;
      render();
      await resolveLanding(player, frozenTile, sid);
      if (!isSessionActive(sid) || state.gameOver) return;
    }
    endTurn(); return;
  }

  if (player.effects.frozen) {
    player.effects.frozen = false;
    pushLog(`${player.name} 被绊脚术绊住，无法移动，但需结算当前地块！`);
    state.statusTitle = `${player.name} 被绊住`;
    state.statusDescription = "绊脚术生效，无法移动，结算当前所在地块。";
    render();
    await showContinueModal({ label: "绊脚效果", title: `${player.name} 被绊住！`, message: "绊脚术生效，本回合无法移动，但仍需结算当前所在地块。" });
    if (!isSessionActive(sid)) return;
    const frozenTile = state.board[player.position];
    state.animation.landedTile = frozenTile.index;
    render();
    await resolveLanding(player, frozenTile, sid);
    if (!isSessionActive(sid) || state.gameOver) return;
    endTurn(); return;
  }

  const dice = await animateDiceRoll(sid);
  if (!isSessionActive(sid) || dice === null) return;

  let actualSteps = dice;
  let speedMsg = "";
  if (player.effects.speedBoost) {
    player.effects.speedBoost = false;
    actualSteps = dice * 2;
    speedMsg = `加速引擎生效！${dice}→${actualSteps} 步！`;
  } else if (player.effects.speedSlow) {
    player.effects.speedSlow = false;
    actualSteps = Math.max(1, Math.ceil(dice / 2));
    speedMsg = `减速陷阱生效！${dice}→${actualSteps} 步。`;
  }
  pushLog(`${player.name} 掷出 ${dice} 点${speedMsg ? "。" + speedMsg : "。"}`);

  await animateMovement(player, actualSteps, sid);
  if (!isSessionActive(sid)) return;

  const tile = state.board[player.position];
  pushLog(`${player.name} 抵达 ${tile.name}。`);
  playSound(tile.isSpecial || tile.isStart ? "special" : "land", { rate: tile.isSpecial ? 0.96 : 1 });
  state.animation.currentTile = null;
  state.animation.landedTile = tile.index;
  render();
  await sleep(300);
  if (!isSessionActive(sid)) return;

  await resolveLanding(player, tile, sid);
  if (!isSessionActive(sid) || state.gameOver) return;

  let extra = false;
  if (!isExtraTurn && dice === 6) extra = true;
  if (player.effects.extraTurn) { player.effects.extraTurn = false; extra = true; }

  if (extra) {
    clearHighlights(); render();
    await showContinueModal({
      label: "骰6再动",
      title: "再来一回合！",
      message: `${player.name} 获得额外一个完整回合！`,
    });
    if (!isSessionActive(sid) || state.gameOver) return;
    await processTurn(player, true);
    return;
  }
  endTurn();
}

async function animateDiceRoll(sid) {
  const final = rollDice();
  playSound("dice", { rate: 0.92 + Math.random() * 0.06 });
  state.animation.diceRolling = true;
  state.statusTitle = `${currentPlayer().name} 正在掷骰`;
  state.statusDescription = "骰子正在滚动...";
  render();
  for (let i = 0; i < 10; i++) {
    state.lastDice = rollDice(); render();
    if (i === 4) playSound("dice", { rate: 0.98 + Math.random() * 0.06 });
    await sleep(70 + i * 10);
    if (!isSessionActive(sid)) return null;
  }
  state.lastDice = final;
  state.animation.diceRolling = false;
  state.animation.diceResult = true;
  state.animation.boardBurst = true;
  playSound("land", { volumeMultiplier: 0.55, rate: 1.18 + (final / 6) * 0.08 });
  state.statusTitle = `${currentPlayer().name} 掷出了 ${final} 点`;
  state.statusDescription = final === 6 ? "骰出6点！本次行动后将获得额外一个完整回合！" : "开始前进。";
  render();
  await sleep(500);
  if (!isSessionActive(sid)) return null;
  state.animation.diceResult = false;
  state.animation.boardBurst = false;
  render();
  return final;
}

async function animateMovement(player, steps, sid) {
  const dir = player.effects.reversed ? -1 : 1;
  for (let step = 1; step <= steps; step++) {
    const prev = player.position;
    const next = (player.position + dir + CONFIG.boardLength) % CONFIG.boardLength;
    player.position = next;
    playSound("step", {
      rate: 0.95 + Math.random() * 0.14,
      volumeMultiplier: step === steps ? 0.85 : 0.65,
    });
    state.animation.currentTile = next;
    state.animation.landedTile = step === steps ? next : null;
    state.statusTitle = `${player.name} 前进中`;
    state.statusDescription = `第 ${step} / ${steps} 步，抵达 ${state.board[next].name}。`;
    const crossedStart = (dir === 1 && next === 0) || (dir === -1 && prev === 0);
    let startUpgradeMsg = "";
    if (crossedStart) {
      state.passedStartThisTurn = true;
      updatePlayerCash(player, CONFIG.startBonus, false);
      const buildable = state.board.filter((t) => t.lot?.ownerId === player.id && t.lot.level === 0 && !t.isLargeSecondary);
      if (buildable.length > 0) {
        const target = buildable[Math.floor(Math.random() * buildable.length)];
        target.lot.level = 1;
        startUpgradeMsg = `\n${target.name} 自动建造至 Lv.1！`;
        pushLog(`${player.name} 经过市政府，获得 ${formatMoney(CONFIG.startBonus)}。${target.name} 自动建造至 Lv.1。`);
      } else {
        pushLog(`${player.name} 经过市政府，获得 ${formatMoney(CONFIG.startBonus)} 奖励。`);
      }
    }
    render();
    await sleep(step === steps ? 260 : 180);
    if (!isSessionActive(sid)) return;
    if (crossedStart) {
      render();
      await showContinueModal({
        label: "市政府补给", title: "市政府补给",
        message: `${player.name} 经过市政府，领取了 ${formatMoney(CONFIG.startBonus)} 补给资金。${startUpgradeMsg}`,
      });
      if (!isSessionActive(sid)) return;
    }
  }
}

async function resolveStartTakeover(player, sid) {
  const opp = getOpponent(player);
  const oppTiles = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);

  if (oppTiles.length === 0) {
    const fallback = 100;
    updatePlayerCash(player, fallback, false);
    pushLog(`${player.name} 停留市政府，对手暂无地产可征用，获得 ${formatMoney(fallback)} 补贴。`);
    await showContinueModal({ label: "市政府征用", title: "市政府征用 — 无可用目标", message: `对手暂无地产可征用，改为获得 ${formatMoney(fallback)} 补贴。` });
    return;
  }

  if (player.isAi) {
    const sorted = [...oppTiles].sort((a, b) => {
      const valA = a.lot.tolls[a.lot.level] + a.lot.level * 80;
      const valB = b.lot.tolls[b.lot.level] + b.lot.level * 80;
      return valB - valA;
    });
    const target = sorted[0];
    const refund = target.lot.price;
    target.lot.ownerId = null;
    updatePlayerCash(opp, refund, false);
    playSound("special", { rate: 0.88 });
    pushLog(`市政府征用令！${opp.name} 的 ${target.name}（Lv.${target.lot.level}）被强制拍卖，退还买地成本 ${formatMoney(refund)}！`);
    render();
    await showContinueModal({
      label: "市政府征用", title: "📜 AI 发动征用令！",
      message: `${opp.name} 的 ${target.name}（Lv.${target.lot.level}）被强制拍卖！地产变为无主状态，建筑保留。\n买地成本 ${formatMoney(refund)} 已退还给 ${opp.name}。`,
    });
    return;
  }

  const btns = oppTiles.map((t) => ({
    id: `seize_${t.index}`,
    label: `${t.name}（Lv.${t.lot.level}）退还 ${formatMoney(t.lot.price)}`,
    variant: "danger",
  }));
  btns.push({ id: "skip", label: "跳过（不征用）", variant: "secondary" });
  const dec = await showModal({
    label: "市政府征用", title: "📜 市政府征用令 — 选择目标",
    message: `停留市政府！你可以选择对手的一处地产强制拍卖。地产变为无主状态，建筑保留，买地成本退还给对手。`,
    buttons: btns,
  });
  if (!isSessionActive(sid)) return;

  if (dec === "skip" || dec === "cancel") {
    pushLog(`${player.name} 停留市政府，放弃了征用机会。`);
    await showContinueModal({ label: "市政府征用", title: "放弃征用", message: "你选择了跳过市政府征用令。" });
    return;
  }

  const idx = parseInt(dec.replace("seize_", ""), 10);
  const target = state.board[idx];
  if (!target?.lot) return;
  const refund = target.lot.price;
  target.lot.ownerId = null;
  updatePlayerCash(opp, refund, false);
  playSound("special", { rate: 0.88 });
  pushLog(`市政府征用令！${opp.name} 的 ${target.name}（Lv.${target.lot.level}）被强制拍卖，退还买地成本 ${formatMoney(refund)}！`);
  render();
  await showContinueModal({
    label: "市政府征用", title: "征用成功！",
    message: `${target.name}（Lv.${target.lot.level}）被强制拍卖！地产变为无主状态，建筑保留。\n买地成本 ${formatMoney(refund)} 已退还给 ${opp.name}。`,
  });
}

async function resolveLargeLotEffect(player, tile, sid) {
  if (!isSessionActive(sid)) return;
  const primaryIdx = tile.isLargeSecondary ? tile.largePrimaryIndex : tile.index;
  const lot = tile.lot;
  if (!lot || lot.level === 0) return;

  if (primaryIdx === 5 && lot.ownerId === player.id) {
    const bonusTable = [0, 60, 120, 200];
    const bonus = bonusTable[lot.level];
    updatePlayerCash(player, bonus, false);
    pushLog(`${player.name} 的金融中心（Lv.${lot.level}）带来额外收益 ${formatMoney(bonus)}！`);
    render();
    await showContinueModal({
      label: "金融中心",
      title: "📈 金融中心运转！",
      message: `Lv.${lot.level} 建筑额外收益 ${formatMoney(bonus)} 入账！`,
    });
  } else if (primaryIdx === 14 && lot.ownerId && lot.ownerId !== player.id) {
    if (player.effects.hotSpringRest) {
      pushLog(`${player.name} 已经在温泉休息中，不会重复入住。`);
    } else {
      player.effects.hotSpringRest = true;
      pushLog(`${player.name} 沉醉于温泉庄园的魔力，下回合被迫休息！`);
      render();
      await showContinueModal({
        label: "温泉庄园",
        title: "♨️ 温泉魔力！",
        message: `${player.name} 沉浸在温泉庄园中，下回合将被迫休息一回合！`,
      });
    }
  }
}

async function resolveLanding(player, tile, sid) {
  if (tile.isStart) {
    await resolveStartTakeover(player, sid);
    return;
  }

  if (tile.isSpecial) { await resolveSpecialTile(player, tile, sid); return; }

  const lot = tile.lot;
  if (!lot) return;

  if (!lot.ownerId) {
    if (player.cash < lot.price) {
      pushLog(`${player.name} 资金不足，无法购买 ${tile.name}。`);
      await showContinueModal({ label: "购买提示", title: `${tile.name} 暂不可购买`, message: `售价 ${formatMoney(lot.price)}，你只有 ${formatMoney(player.cash)}。` });
      return;
    }
    if (player.isAi) {
      if (shouldAiBuy(player, lot)) {
        buyLot(player, tile, false); render();
        await showContinueModal({ label: "AI 行动", title: `AI 买下了 ${tile.name}`, message: `花费 ${formatMoney(lot.price)}。` });
      } else {
        pushLog(`AI 对手放弃购买 ${tile.name}。`);
        await showContinueModal({ label: "AI 行动", title: `AI 放弃购买 ${tile.name}`, message: "AI 选择保留现金。" });
      }
      return;
    }
    const dec = await showModal({
      label: "购买提示", title: `购买 ${tile.name}？`,
      message: `${lot.theme.label}${lot.isLarge ? "（大型地产·命中率翻倍）" : ""} 售价 ${formatMoney(lot.price)}，当前现金 ${formatMoney(player.cash)}。`,
      buttons: [
        { id: "buy", label: `购买 ${formatMoney(lot.price)}`, variant: "primary" },
        { id: "skip", label: "暂不购买", variant: "ghost" },
      ],
    });
    if (!isSessionActive(sid)) return;
    if (dec === "buy") { buyLot(player, tile); render(); await sleep(420); }
    return;
  }

  if (lot.ownerId === player.id) {
    await resolveLargeLotEffect(player, tile, sid);
    if (!isSessionActive(sid) || state.gameOver) return;

    if (lot.level >= 3) {
      await showContinueModal({ label: "升级提示", title: `${tile.name} 已满级`, message: `Lv.3 最高等级，收费 ${formatMoney(lot.tolls[3])}。` });
      return;
    }
    const cost = lot.buildCosts[lot.level + 1];
    if (player.isAi) {
      if (player.cash >= cost && shouldAiBuild(player, lot, cost)) {
        buildLot(player, tile, false); render();
        await showContinueModal({ label: "AI 行动", title: `AI 升级了 ${tile.name}`, message: `建筑提升到 Lv.${lot.level}。` });
      } else {
        pushLog(`AI 跳过 ${tile.name}。`);
        await showContinueModal({ label: "AI 行动", title: `AI 跳过 ${tile.name}`, message: "保持现状。" });
      }
      return;
    }
    if (player.cash < cost) {
      await showContinueModal({ label: "升级提示", title: `${tile.name} 暂无法升级`, message: `升级需 ${formatMoney(cost)}，你只有 ${formatMoney(player.cash)}。` });
      return;
    }
    const dec = await showModal({
      label: "升级提示", title: `升级 ${tile.name}？`,
      message: `当前 Lv.${lot.level}，收费 ${formatMoney(lot.tolls[lot.level])}。花 ${formatMoney(cost)} 升到 Lv.${lot.level + 1}（收费 ${formatMoney(lot.tolls[lot.level + 1])}）。`,
      buttons: [
        { id: "build", label: `升级 ${formatMoney(cost)}`, variant: "primary" },
        { id: "skip", label: "跳过", variant: "ghost" },
      ],
    });
    if (!isSessionActive(sid)) return;
    if (dec === "build") { buildLot(player, tile); render(); await sleep(420); }
    return;
  }

  const owner = getPlayerById(lot.ownerId);
  if (player.effects.shield) {
    player.effects.shield = false;
    pushLog(`${player.name} 的护盾术生效，免交 ${tile.name} 的过路费！`);
    await showContinueModal({ label: "过路费提示", title: "护盾术生效！", message: `${player.name} 免交过路费！` });
    await resolveLargeLotEffect(player, tile, sid);
    return;
  }
  const toll = collectToll(player, owner, tile);
  render();
  if (toll.actualPayment < toll.toll) {
    if (state.gameMode === "bankruptcy") {
      pushLog(`${player.name} 无力偿还 ${formatMoney(toll.toll)} 过路费，宣告破产！游戏结束。`);
      await showContinueModal({
        label: "破产淘汰",
        title: "💸 破产！游戏结束",
        message: `${player.name} 仅剩 ${formatMoney(toll.actualPayment)}，差 ${formatMoney(toll.toll - toll.actualPayment)} 无力偿还。\n${owner.name} 获胜！`,
      });
      finishGame("bankruptcy");
      return;
    }
    const relief = 200;
    player.effects.bankruptcyRelief = true;
    player.effects.frozen = false;
    player.effects.hotSpringRest = false;
    updatePlayerCash(player, relief, false);
    pushLog(`${player.name} 现金耗尽，进入破产救助：等待救援资金，发放 ${formatMoney(relief)} 救助金。`);
    await showContinueModal({
      label: "破产救助",
      title: "资金告急！",
      message: `${player.name} 仅支付了 ${formatMoney(toll.actualPayment)}，差 ${formatMoney(toll.toll - toll.actualPayment)} 无力偿还。\n进入等待救援资金状态：下回合跳过行动，同时领取 ${formatMoney(relief)} 救助金重新出发。`,
    });
  } else {
    await showContinueModal({ label: "过路费提示", title: `支付 ${formatMoney(toll.actualPayment)} 过路费`, message: toll.message });
  }
  await resolveLargeLotEffect(player, tile, sid);
}

async function resolveSpecialTile(player, tile, sid) {
  if (tile.special.type === "bank") {
    playSound("special", { rate: 0.9 });
    const threshold = 200;
    if (state.bankPool >= threshold) {
      const payout = state.bankPool;
      state.bankPool = 0;
      updatePlayerCash(player, payout, false);
      pushLog(`${player.name} 在银行提走了全部存款 ${formatMoney(payout)}！`);
      render();
      await showContinueModal({
        label: "功能地块", title: "金库大丰收！",
        message: `金库已满，${player.name} 提走了全部 ${formatMoney(payout)}！金库清零重新开始。`,
      });
    } else {
      const bankDice = await animateDiceRoll(sid);
      if (!isSessionActive(sid) || bankDice === null) return;
      const deposit = bankDice * 30;
      const actual = Math.min(deposit, player.cash);
      if (actual > 0) {
        updatePlayerCash(player, -actual, false);
        state.bankPool += actual;
      }
      pushLog(`${player.name} 掷出 ${bankDice} 点，被迫存入 ${formatMoney(actual)}（金库累计 ${formatMoney(state.bankPool)}）。`);
      render();
      await showContinueModal({
        label: "功能地块", title: `强制存款！掷出 ${bankDice} 点`,
        message: `${player.name} 被迫向金库存入 ${formatMoney(actual)}。\n金库累计：${formatMoney(state.bankPool)} / ${formatMoney(threshold)}`,
      });
    }
    return;
  }

  if (tile.special.type === "chance") {
    await resolveChance(player, tile, sid);
    return;
  }

  if (tile.special.type === "teleport") {
    await resolveTeleportTile(player, sid);
    return;
  }

  if (tile.special.type === "construction") {
    await resolveConstruction(player, sid);
    return;
  }

  if (tile.special.type === "card_draw") {
    await resolveCardDraw(player, sid);
    return;
  }
}

async function resolveChance(player, tile, sid) {
  playSound("special", { rate: 1.04 });
  const roll = Math.random();
  let msg = "";
  let handled = false;
  if (roll < 0.09) {
    const b = 320; updatePlayerCash(player, b, false);
    msg = `投资大获成功！获得 ${formatMoney(b)} 回报！`;
  } else if (roll < 0.22) {
    const b = 160; updatePlayerCash(player, b, false);
    msg = `好运降临，获得 ${formatMoney(b)}。`;
  } else if (roll < 0.33) {
    const b = 80; updatePlayerCash(player, b, false);
    msg = `小额奖励，获得 ${formatMoney(b)}。`;
  } else if (roll < 0.38) {
    msg = "一切如常，什么也没有发生。";
  } else if (roll < 0.50) {
    const l = Math.min(player.cash, 80); updatePlayerCash(player, -l, false);
    msg = `临时维修支出，支付 ${formatMoney(l)}。`;
  } else if (roll < 0.59) {
    const l = Math.min(player.cash, 150); updatePlayerCash(player, -l, false);
    msg = `突发罚款！损失 ${formatMoney(l)}！`;
  } else if (roll < 0.70) {
    const opp = getOpponent(player);
    const s = Math.min(opp.cash, 100);
    updatePlayerCash(player, s, false); updatePlayerCash(opp, -s, false);
    msg = `商业间谍！从 ${opp.name} 夺取 ${formatMoney(s)}！`;
  } else if (roll < 0.82) {
    const emptyLots = state.board.filter((t) => t.lot && !t.lot.ownerId && !t.isLargeSecondary);
    if (emptyLots.length === 0) {
      const b = 80; updatePlayerCash(player, b, false);
      msg = `政府公示空地购买机会，但已无空地可买，获得 ${formatMoney(b)} 补偿。`;
    } else {
      const weighted = emptyLots.map((t) => ({ tile: t, weight: t.lot.isLarge ? 0.3 : 1 }));
      const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
      let wRoll = Math.random() * totalWeight;
      let selected = weighted[0].tile;
      for (const w of weighted) { wRoll -= w.weight; if (wRoll <= 0) { selected = w.tile; break; } }
      handled = true;
      pushLog(`${player.name} 在 ${tile.name} 触发空地购买机会：${selected.name}！`);
      if (player.isAi) {
        if (shouldAiBuy(player, selected.lot)) {
          buyLot(player, selected, false); render();
          await showContinueModal({ label: "功能地块", title: "空地购买机会！", message: `AI 趁机买下了 ${selected.name}（${formatMoney(selected.lot.price)}）！` });
        } else {
          await showContinueModal({ label: "功能地块", title: "空地购买机会", message: `AI 放弃购买 ${selected.name}。` });
        }
      } else {
        if (player.cash < selected.lot.price) {
          await showContinueModal({ label: "功能地块", title: "空地购买机会", message: `发现空地 ${selected.name}（${formatMoney(selected.lot.price)}），但你只有 ${formatMoney(player.cash)}，无法购买。` });
        } else {
          const dec = await showModal({
            label: "功能地块", title: `🏗️ 空地购买机会！`,
            message: `政府公示：${selected.name}（${selected.lot.theme.label}）以底价 ${formatMoney(selected.lot.price)} 出售！\n当前现金：${formatMoney(player.cash)}`,
            buttons: [
              { id: "buy", label: `购买 ${formatMoney(selected.lot.price)}`, variant: "primary" },
              { id: "skip", label: "放弃", variant: "ghost" },
            ],
          });
          if (!isSessionActive(sid)) return;
          if (dec === "buy") { buyLot(player, selected); render(); await sleep(420); }
        }
      }
    }
  } else {
    const opp = getOpponent(player);
    const t = state.board.find((x) => x.lot?.ownerId === opp.id && x.lot.level > 0 && !x.isLargeSecondary);
    if (t) { t.lot.level -= 1; msg = `自然灾害！${opp.name} 的 ${t.name} 降级到 Lv.${t.lot.level}！`; }
    else { const b = 100; updatePlayerCash(player, b, false); msg = `对手无建筑可损坏，改领 ${formatMoney(b)} 补偿。`; }
  }
  if (!handled) {
    pushLog(`${player.name} 在 ${tile.name} 触发机会事件。${msg}`);
    await showContinueModal({ label: "功能地块", title: `${tile.name} 生效`, message: msg });
  }
}

async function resolveTeleportTile(player, sid) {
  playSound("special", { rate: 1.08 });
  const lots = state.board.filter((t) => t.lot !== null);
  if (lots.length === 0) return;
  const target = lots[Math.floor(Math.random() * lots.length)];
  player.position = target.index;
  pushLog(`${player.name} 踏入传送门，被传送到了 ${target.name}！`);
  state.animation.landedTile = target.index;
    render();
  await showContinueModal({
    label: "传送门", title: "传送门启动！",
    message: `${player.name} 被传送到了 ${target.name}！下回合将从此处出发。`,
  });
}

async function resolveConstruction(player, sid) {
  playSound("build", { rate: 0.92 });
  const opp = getOpponent(player);
  const canBuild = state.board.filter((t) => t.lot?.ownerId === player.id && t.lot.level < 3 && !t.isLargeSecondary);
  const canDemolish = state.board.filter((t) => t.lot?.ownerId === opp.id && t.lot.level > 0 && !t.isLargeSecondary);

  if (!canBuild.length && !canDemolish.length) {
    const b = 120; updatePlayerCash(player, b, false);
    pushLog(`${player.name} 在城建局无事可做，领取 ${formatMoney(b)} 补贴。`);
    await showContinueModal({ label: "城建局", title: "城建局", message: `暂无可建造或拆除的目标，获得 ${formatMoney(b)} 补贴。` });
    return;
  }

  if (player.isAi) {
    const preferDemolish = canDemolish.length > 0 && canDemolish.some((t) => t.lot.level >= 2);
    if (preferDemolish) {
      const sorted = [...canDemolish].sort((a, b) => b.lot.level - a.lot.level);
      const target = sorted[Math.floor(Math.random() * Math.min(2, sorted.length))];
      target.lot.level -= 1;
      pushLog(`${player.name} 在城建局拆除了 ${target.name} 一级建筑！降至 Lv.${target.lot.level}。`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择拆除！", message: `${opp.name} 的 ${target.name} 被拆除一级，降至 Lv.${target.lot.level}！` });
    } else if (canBuild.length > 0) {
      const target = canBuild[Math.floor(Math.random() * canBuild.length)];
      target.lot.level += 1;
      pushLog(`${player.name} 在城建局免费建造了 ${target.name}，升至 Lv.${target.lot.level}。`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择建造！", message: `${player.name} 的 ${target.name} 免费升至 Lv.${target.lot.level}！` });
    } else {
      const target = canDemolish[Math.floor(Math.random() * canDemolish.length)];
      target.lot.level -= 1;
      pushLog(`${player.name} 在城建局拆除了 ${target.name} 一级建筑！`);
      render();
      await showContinueModal({ label: "城建局", title: "AI 选择拆除！", message: `${opp.name} 的 ${target.name} 被拆除一级，降至 Lv.${target.lot.level}！` });
    }
    return;
  }

  const btns = [];
  if (canBuild.length > 0) btns.push({ id: "build", label: `随机建造（${canBuild.length} 处可选）`, variant: "primary" });
  if (canDemolish.length > 0) btns.push({ id: "demolish", label: `随机拆除对手（${canDemolish.length} 处可拆）`, variant: "danger" });
  const dec = await showModal({
    label: "城建局", title: "城建局 — 选择行动",
    message: "你可以免费升级一处自己的地产，或拆除对手一层建筑！",
    buttons: btns,
  });
  if (!isSessionActive(sid)) return;

  if (dec === "build") {
    const target = canBuild[Math.floor(Math.random() * canBuild.length)];
    target.lot.level += 1;
    pushLog(`${player.name} 在城建局免费建造了 ${target.name}，升至 Lv.${target.lot.level}。`);
    render();
    await showContinueModal({ label: "城建局", title: "建造完成！", message: `${target.name} 免费升级到 Lv.${target.lot.level}！` });
  } else if (dec === "demolish") {
    const target = canDemolish[Math.floor(Math.random() * canDemolish.length)];
    target.lot.level -= 1;
    pushLog(`${player.name} 在城建局拆除了 ${opp.name} 的 ${target.name} 一级建筑！`);
    render();
    await showContinueModal({ label: "城建局", title: "拆除完成！", message: `${opp.name} 的 ${target.name} 降至 Lv.${target.lot.level}！` });
  }
}

async function resolveCardDraw(player, sid) {
  playSound("card", { rate: 1.02 });
  const shuffled = [...CARD_POOL].sort(() => Math.random() - 0.5);
  const drawn = shuffled.slice(0, 3);
  let selected;

  if (player.isAi) {
    selected = aiChooseCard(drawn, player);
    pushLog(`${player.name} 翻牌选择了 ${selected.icon} ${selected.name}。`);
    await showContinueModal({
      label: "翻牌事件", title: `AI 选择了 ${selected.icon} ${selected.name}`,
      message: `效果：${selected.description}`,
    });
    if (!isSessionActive(sid)) return;
  } else {
    const dec = await showModal({
      label: "翻牌事件", title: "选择一张卡牌发动！", message: "",
      cardDraw: true,
      buttons: drawn.map((c) => ({
        id: c.id,
        label: `<span class="card-icon">${c.icon}</span><span class="card-name">${c.name}</span><span class="card-desc">${c.description}</span>`,
        variant: "primary",
      })),
    });
    if (!isSessionActive(sid)) return;
    selected = drawn.find((c) => c.id === dec) || drawn[0];
    pushLog(`${player.name} 选择了 ${selected.icon} ${selected.name}。`);
  }

  await executeCardEffect(player, selected, sid);
}

function setTargetHighlight(enabled) {
  document.querySelectorAll(".token").forEach((el) => {
    el.classList.toggle("token-target-highlight", enabled);
  });
}

async function chooseCardTarget(player, card, sid) {
  if (player.isAi) {
    const opp = getOpponent(player);
    const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary);
    const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);
    switch (card.id) {
      case "teleport": return "opponent";
      case "boost": {
        for (let s = 1; s <= 3; s++) {
          const idx = (opp.position + s * 2) % CONFIG.boardLength;
          const t = state.board[idx];
          if (t.lot?.ownerId === player.id && t.lot.level >= 2) return "opponent";
        }
        return "self";
      }
      case "slow": {
        for (let s = 1; s <= 3; s++) {
          const dir = player.effects.reversed ? -1 : 1;
          const idx = (player.position + s * dir + CONFIG.boardLength) % CONFIG.boardLength;
          const t = state.board[idx];
          if ((t.lot && !t.lot.ownerId) || (t.lot?.ownerId === player.id && t.lot.level < 3)) return "self";
        }
        return "opponent";
      }
      case "rewind": return oppLots.length > 0 ? "opponent" : "self";
      case "reverse": return "opponent";
      default: return "opponent";
    }
  }
  setTargetHighlight(true);
  render();
  const choice = await showModal({
    label: "卡牌效果",
    title: `${card.icon} ${card.name} — 选择目标`,
    message: card.description,
    buttons: [
      { id: "self", label: `对自己使用`, variant: "primary" },
      { id: "opponent", label: `对对手使用`, variant: "danger" },
    ],
  });
  setTargetHighlight(false);
  if (!isSessionActive(sid)) return null;
  return choice === "self" ? "self" : "opponent";
}

async function executeCardEffect(player, card, sid) {
  const opp = getOpponent(player);

  switch (card.id) {
    case "teleport": {
      const target_who = await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid)) return;
      const target_player = target_who === "self" ? player : opp;
      playSound("special", { rate: 1.1 });
      const lots = state.board.filter((t) => t.lot !== null);
      if (lots.length === 0) break;
      const dest = lots[Math.floor(Math.random() * lots.length)];
      target_player.position = dest.index;
      state.animation.landedTile = dest.index;
      pushLog(`传送术！${target_player.name} 被传送到 ${dest.name}！`);
      render();
      await showContinueModal({ label: "卡牌效果", title: `${target_player.name} 传送到 ${dest.name}！`, message: `${target_player.name} 下回合将从 ${dest.name} 出发。` });
      break;
    }
    case "launch": {
      playSound("special", { rate: 1.06 });
      let steps;
      if (player.isAi) {
        let bestStep = 1, bestScore = -9999;
        for (let s = 1; s <= 6; s++) {
          const dir = player.effects.reversed ? -1 : 1;
          const idx = (player.position + s * dir + CONFIG.boardLength) % CONFIG.boardLength;
          const t = state.board[idx];
          let score = 0;
          if (t.lot && !t.lot.ownerId) score += 5;
          else if (t.lot?.ownerId === player.id && t.lot.level < 3) score += 4;
          else if (t.lot?.ownerId === opp.id) score -= t.lot.tolls[t.lot.level] / 40;
          if (t.isSpecial && (t.special.type === "card_draw" || t.special.type === "construction")) score += 3;
          if (score > bestScore) { bestScore = score; bestStep = s; }
        }
        steps = bestStep;
      } else {
        const btns = [];
        for (let s = 1; s <= 6; s++) {
          const dir = player.effects.reversed ? -1 : 1;
          const idx = (player.position + s * dir + CONFIG.boardLength) % CONFIG.boardLength;
          btns.push({ id: String(s), label: `${s} 步 → ${state.board[idx].name}`, variant: "primary" });
        }
        const choice = await showModal({
          label: "卡牌效果", title: "🎯 命定骰 — 选择步数",
          message: "选择你想要前进的步数：",
          buttons: btns,
        });
        if (!isSessionActive(sid)) return;
        steps = parseInt(choice, 10) || 1;
      }
      pushLog(`命定骰！${player.name} 选择前进 ${steps} 步！`);
      await showContinueModal({ label: "卡牌效果", title: "命定骰启动！", message: `${player.name} 即将前进 ${steps} 步！` });
      if (!isSessionActive(sid)) return;
      await animateMovement(player, steps, sid);
      if (!isSessionActive(sid) || state.gameOver) return;
      state.animation.currentTile = null;
      state.animation.landedTile = player.position;
      render();
      await resolveLanding(player, state.board[player.position], sid);
      break;
    }
    case "rewind": {
      const target_who = await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid)) return;
      const target_player = target_who === "self" ? player : opp;
      playSound("special", { rate: 0.94 });
      pushLog(`时光回溯！${target_player.name} 被迫后退 3 步！`);
      await showContinueModal({ label: "卡牌效果", title: "时光回溯！", message: `${target_player.name} 被迫后退 3 步！` });
      if (!isSessionActive(sid)) return;
      for (let i = 0; i < 3; i++) {
        target_player.position = (target_player.position - 1 + CONFIG.boardLength) % CONFIG.boardLength;
        state.animation.currentTile = target_player.position;
        render(); await sleep(180);
        if (!isSessionActive(sid)) return;
      }
      state.animation.currentTile = null;
      state.animation.landedTile = target_player.position;
      render();
      await showContinueModal({ label: "卡牌效果", title: `${target_player.name} 到达 ${state.board[target_player.position].name}`, message: `${target_player.name} 下回合将从此处出发。` });
      break;
    }
    case "swap": {
      playSound("special", { rate: 1 });
      const tmp = player.position;
      player.position = opp.position;
      opp.position = tmp;
      pushLog(`换位魔法！${player.name} 和 ${opp.name} 交换了位置！`);
      state.animation.landedTile = player.position;
      render();
      await showContinueModal({
        label: "卡牌效果", title: "换位魔法！",
        message: `${player.name} 现在在 ${state.board[player.position].name}，${opp.name} 在 ${state.board[opp.position].name}。`,
      });
      break;
    }
    case "boost": {
      const target_who = await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid)) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.speedBoost = true;
      pushLog(`加速引擎！${target_player.name} 下次掷骰翻倍！`);
      await showContinueModal({ label: "卡牌效果", title: "加速引擎启动！", message: `${target_player.name} 的下次掷骰结果将翻倍！` });
      break;
    }
    case "slow": {
      const target_who = await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid)) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.speedSlow = true;
      pushLog(`减速陷阱！${target_player.name} 下次掷骰减半！`);
      await showContinueModal({ label: "卡牌效果", title: "减速陷阱！", message: `${target_player.name} 的下次掷骰结果将减半！` });
      break;
    }
    case "freeze":
      if (opp.effects.bankruptcyRelief) {
        pushLog(`绊脚术对 ${opp.name} 无效！对方正在等待救援资金，免疫控制效果。`);
        await showContinueModal({ label: "卡牌效果", title: "🪤 绊脚术 — 无效！", message: `${opp.name} 正处于破产救助状态，免疫绊脚术！` });
      } else {
        opp.effects.frozen = true;
        pushLog(`绊脚术！${opp.name} 下回合无法移动，但仍需结算地块！`);
        await showContinueModal({ label: "卡牌效果", title: "🪤 绊脚术！", message: `${opp.name} 被绊住，下回合无法移动，但仍需结算当前所在地块！` });
      }
      break;
    case "combo":
      player.effects.extraTurn = true;
      pushLog(`连击鼓！${player.name} 将获得额外回合！`);
      await showContinueModal({ label: "卡牌效果", title: "连击鼓！", message: `${player.name} 本回合结束后将获得额外回合！` });
      break;
    case "shield":
      player.effects.shield = true;
      pushLog(`护盾术！${player.name} 将免疫下一次过路费！`);
      await showContinueModal({ label: "卡牌效果", title: "护盾术！", message: `${player.name} 下次路过对手地产免交过路费！` });
      break;
    case "doubleRent":
      player.effects.doubleRent = true;
      pushLog(`收租翻倍！${player.name} 的地产下次被踩收费×2！`);
      await showContinueModal({ label: "卡牌效果", title: "收租翻倍！", message: `${player.name} 的地产下次被踩时过路费翻倍！` });
      break;
    case "propertySwap": {
      playSound("special", { rate: 1.02 });
      const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary);
      const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary);
      if (myLots.length === 0 || oppLots.length === 0) {
        const b = 100;
        updatePlayerCash(player, b, false);
        const reason = myLots.length === 0 ? "你没有地产可交出" : "对手没有地产可获取";
        pushLog(`地产互换失败：${reason}，获得 ${formatMoney(b)} 补偿。`);
        await showContinueModal({ label: "卡牌效果", title: "地产互换 — 无法执行", message: `${reason}，改为获得 ${formatMoney(b)} 补偿金。` });
        break;
      }
      let giveIdx;
      if (player.isAi) {
        const sorted = [...myLots].sort((a, b) => (a.lot.level + a.lot.price / 100) - (b.lot.level + b.lot.price / 100));
        giveIdx = sorted[0].index;
      } else {
        const btns = myLots.map((t) => ({
          id: String(t.index),
          label: `${t.name}（Lv.${t.lot.level}）`,
          variant: "primary",
        }));
        const dec = await showModal({
          label: "卡牌效果", title: "🔀 地产互换 — 选择交出的地产",
          message: "选择你要交出的一块地产，你将随机获得对手的一块地产。建筑等级保留不变。",
          buttons: btns,
        });
        if (!isSessionActive(sid)) return;
        giveIdx = parseInt(dec, 10);
        if (isNaN(giveIdx)) giveIdx = myLots[0].index;
      }
      const giveTile = state.board[giveIdx];
      const getTile = oppLots[Math.floor(Math.random() * oppLots.length)];
      giveTile.lot.ownerId = opp.id;
      getTile.lot.ownerId = player.id;
      if (giveTile.lot.isLarge) {
        const sec = state.board.find((t) => t.isLargeSecondary && t.largePrimaryIndex === giveTile.index);
        if (sec) sec.lot = giveTile.lot;
      }
      if (getTile.lot.isLarge) {
        const sec = state.board.find((t) => t.isLargeSecondary && t.largePrimaryIndex === getTile.index);
        if (sec) sec.lot = getTile.lot;
      }
      pushLog(`地产互换！${player.name} 交出 ${giveTile.name}（Lv.${giveTile.lot.level}），获得 ${getTile.name}（Lv.${getTile.lot.level}）！`);
      render();
      await showContinueModal({
        label: "卡牌效果", title: "地产互换完成！",
        message: `交出：${giveTile.name}（Lv.${giveTile.lot.level}）\n获得：${getTile.name}（Lv.${getTile.lot.level}）`,
      });
      break;
    }
    case "reverse": {
      const target_who = await chooseCardTarget(player, card, sid);
      if (!isSessionActive(sid)) return;
      const target_player = target_who === "self" ? player : opp;
      target_player.effects.reversed = !target_player.effects.reversed;
      const dirText = target_player.effects.reversed ? "逆时针" : "顺时针";
      pushLog(`逆行术！${target_player.name} 的前进方向变为${dirText}！`);
      render();
      await showContinueModal({
        label: "卡牌效果", title: "🔃 逆行术！",
        message: `${target_player.name} 的前进方向已变为${dirText}！`,
      });
      break;
    }
  }
}

function buyLot(player, tile, animate = true) {
  const lot = tile.lot;
  updatePlayerCash(player, -lot.price, animate);
  lot.ownerId = player.id;
  playSound("buy", { rate: lot.isLarge ? 0.92 : 1 });
  pushLog(`${player.name} 花 ${formatMoney(lot.price)} 买下了 ${tile.name}。`);
}

function buildLot(player, tile, animate = true) {
  const lot = tile.lot;
  const next = lot.level + 1;
  const cost = lot.buildCosts[next];
  updatePlayerCash(player, -cost, animate);
  lot.level = next;
  playSound("build", { rate: 0.96 + next * 0.03 });
  pushLog(`${player.name} 花 ${formatMoney(cost)} 将 ${tile.name} 升到 Lv.${next}。`);
}

function collectToll(visitor, owner, tile) {
  const distTiles = getDistrictOwnerLots(tile.lot.district, owner.id);
  const cnt = distTiles.length;
  let mult = getDistrictTollMultiplier(cnt);
  let doubleActive = false;
  if (owner.effects.doubleRent) { mult *= 2; owner.effects.doubleRent = false; doubleActive = true; }
  const base = distTiles.reduce((s, t) => s + t.lot.tolls[t.lot.level], 0);
  const toll = Math.round(base * mult);
  const actual = Math.min(visitor.cash, toll);
  updatePlayerCash(visitor, -actual, false);
  updatePlayerCash(owner, actual, false);
  playSound("toll", { rate: doubleActive ? 0.9 : 1 });
  const mText = mult > 1 ? `，系数 x${mult}` : "";
  const dText = doubleActive ? "（收租翻倍生效！）" : "";
  if (actual < toll) pushLog(`${visitor.name} 现金不足，仅支付 ${formatMoney(actual)} 给 ${owner.name}。`);
  else pushLog(`${visitor.name} 支付 ${formatMoney(actual)} 过路费给 ${owner.name}。`);
  return {
    actualPayment: actual, toll,
    message: `${tile.lot.district}连锁收费：${owner.name} 拥有 ${cnt} 块地${mText}${dText}，合计 ${formatMoney(actual)}。`,
  };
}

function getDistrictOwnerLots(district, ownerId) {
  const seen = new Set();
  return state.board.filter((t) => {
    if (!t.lot || t.lot.district !== district || t.lot.ownerId !== ownerId) return false;
    if (seen.has(t.lot)) return false;
    seen.add(t.lot); return true;
  });
}

function getDistrictTollMultiplier(n) {
  if (n >= 3) return 1.5;
  if (n === 2) return 1.2;
  return 1;
}

function findUpgradeableOwnedLot(pid) {
  const c = state.board.filter((t) => t.lot?.ownerId === pid && t.lot.level < 3 && !t.isLargeSecondary);
  if (!c.length) return null;
  return c.sort((a, b) => a.lot.level - b.lot.level || a.lot.price - b.lot.price)[0];
}

function shouldAiBuy(player, lot) {
  const reserve = 180;
  const distOwned = getDistrictOwnerLots(lot.district, player.id);
  const distTotal = new Set(state.board.filter((t) => t.lot?.district === lot.district).map((t) => t.lot)).size;
  if (distOwned.length + 1 >= distTotal && player.cash - lot.price >= 60) return true;
  const oppOwns = state.board.filter((t) => t.lot?.district === lot.district && t.lot.ownerId && t.lot.ownerId !== player.id).length;
  if (oppOwns >= 2 && player.cash - lot.price >= reserve) return true;
  return player.cash - lot.price >= reserve || lot.price <= 120;
}

function shouldAiBuild(player, lot, cost) {
  const reserve = 150;
  const dist = getDistrictOwnerLots(lot.district, player.id);
  if (dist.length >= 2 && player.cash - cost >= 100) return true;
  if (lot.level === 0 && player.cash - cost >= reserve) return true;
  return player.cash - cost >= reserve * 1.5;
}

function aiChooseCard(cards, player) {
  const opp = getOpponent(player);
  const myLots = state.board.filter((t) => t.lot?.ownerId === player.id && !t.isLargeSecondary).length;
  const oppLots = state.board.filter((t) => t.lot?.ownerId === opp.id && !t.isLargeSecondary).length;
  const prio = {
    rewind: oppLots > 0 ? 9 : 2, freeze: oppLots > 0 ? 7 : 3,
    slow: oppLots > 0 ? 7 : 3, doubleRent: myLots >= 2 ? 8 : 2,
    combo: 6, boost: 5, shield: oppLots >= 3 ? 7 : 3,
    launch: 6, teleport: 5, swap: 4,
    propertySwap: (myLots > 0 && oppLots > 0) ? 6 : 1,
    reverse: 5,
  };
  return cards.sort((a, b) => (prio[b.id] || 3) - (prio[a.id] || 3))[0];
}

function endTurn() {
  if (state.gameOver) return;
  hideModal(false); clearHighlights(); state.busy = false;
  if (state.currentPlayerIndex === state.players.length - 1) {
    state.round += 1; state.currentPlayerIndex = 0;
  } else { state.currentPlayerIndex += 1; }
  if (state.gameMode === "rounds" && state.round > CONFIG.maxRounds) { finishGame("rounds"); return; }
  if (currentPlayer().isAi) { setAiTurnStatus(); render(); void startAiTurnWithDelay(state.sessionId); }
  else { setHumanTurnStatus(); render(); }
}

async function startAiTurnWithDelay(sid) {
  await sleep(720);
  if (isSessionActive(sid) && currentPlayer().isAi && !state.gameOver) await playAiTurn();
}

function finishGame(reason = "rounds") {
  state.gameOver = true; state.phase = "locked"; state.busy = false; hideModal(false);
  const rank = [...state.players].sort((a, b) => b.cash - a.cash);
  const top = rank[0];
  const tied = rank.filter((p) => p.cash === top.cash);
  const roundLabel = reason === "bankruptcy" ? "破产淘汰" : `第 ${state.round - 1} 回合`;
  if (tied.length > 1) {
    state.statusTitle = "游戏结束：平局";
    state.statusDescription = `${tied.map((p) => p.name).join("、")} 以 ${formatMoney(top.cash)} 并列第一。`;
    pushLog(`${roundLabel}结束，平局！双方 ${formatMoney(top.cash)}。`);
  } else {
    state.statusTitle = "游戏结束";
    state.statusDescription = `${top.name} 以 ${formatMoney(top.cash)} 获胜！`;
    const loser = rank[rank.length - 1];
    pushLog(`${roundLabel}结束，${top.name}（${formatMoney(top.cash)}）击败${loser.name}（${formatMoney(loser.cash)}）！`);
  }
  saveGameResult(reason, tied.length > 1 ? "draw" : top.id);
  playSound("win");
  render();
}

function getWinnerText() {
  if (!state.gameOver) return "";
  const r = [...state.players].sort((a, b) => b.cash - a.cash);
  if (r[0].cash === r[1].cash) return `平局：双方 ${formatMoney(r[0].cash)}。`;
  return `胜者：${r[0].name}，最终现金 ${formatMoney(r[0].cash)}。`;
}

function showModal({ label = "行动提示", title, message, buttons, cardDraw = false }) {
  if (modalResolver) { modalResolver("cancel"); modalResolver = null; }
  state.modal = { visible: true, label, title, message, buttons, cardDraw };
  state.phase = "await_modal"; state.busy = false; render();
  return new Promise((r) => { modalResolver = r; });
}

async function showContinueModal(cfg) {
  await showModal({ ...cfg, buttons: [{ id: "continue", label: "确定", variant: "primary" }] });
  flushQueuedCashAnimations();
}

function hideModal(shouldResolve = true, actionId = "cancel") {
  state.modal = defaultModal();
  if (shouldResolve && modalResolver) { const r = modalResolver; modalResolver = null; r(actionId); }
  render();
}

function renderDiceFaceSvg(v) {
  const pos = {
    1: [[25,25]], 2: [[12,12],[38,38]], 3: [[12,12],[25,25],[38,38]],
    4: [[12,12],[38,12],[12,38],[38,38]], 5: [[12,12],[38,12],[25,25],[12,38],[38,38]],
    6: [[12,12],[38,12],[12,25],[38,25],[12,38],[38,38]],
  };
  const dots = (pos[v] || pos[1]).map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="white"/>`).join("");
  return `<svg viewBox="0 0 50 50" width="100%" height="100%">${dots}</svg>`;
}

function createStartSvg() {
  return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#dbeafe"/>
    <path d="M26 18 L45 8 L64 18 V50 H26 Z" fill="#2563eb"/>
    <rect x="37" y="28" width="16" height="22" rx="3" fill="#eff6ff"/>
    <path d="M45 8 V56" stroke="#fef08a" stroke-width="3"/>
    <path d="M45 8 L54 16" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
}

function createSpecialSvg(type) {
  if (type === "bank") return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#dbeafe"/>
    <path d="M18 24 L45 10 L72 24" fill="#60a5fa"/>
    <rect x="22" y="24" width="46" height="24" rx="5" fill="#eff6ff"/>
    <rect x="28" y="30" width="6" height="18" rx="2" fill="#2563eb"/>
    <rect x="42" y="30" width="6" height="18" rx="2" fill="#2563eb"/>
    <rect x="56" y="30" width="6" height="18" rx="2" fill="#2563eb"/>
  </svg>`;
  if (type === "chance") return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#f5d0fe"/>
    <circle cx="45" cy="34" r="18" fill="#f472b6"/>
    <path d="M41 22 C50 21 56 28 53 35 C51 39 48 41 47 46" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="46" cy="52" r="3.4" fill="#fff"/>
  </svg>`;
  if (type === "teleport") return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#a7f3d0"/>
    <circle cx="45" cy="34" r="18" fill="none" stroke="#10b981" stroke-width="4" stroke-dasharray="8 4"/>
    <circle cx="45" cy="34" r="10" fill="#34d399"/>
    <path d="M40 34 L45 26 L50 34" fill="#fff"/>
    <path d="M40 34 L45 42 L50 34" fill="#fff" opacity="0.5"/>
  </svg>`;
  if (type === "construction") return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#fef3c7"/>
    <rect x="30" y="28" width="30" height="24" rx="4" fill="#f59e0b"/>
    <rect x="34" y="22" width="22" height="10" rx="3" fill="#fbbf24"/>
    <path d="M45 12 L48 22 H42 Z" fill="#dc2626"/>
    <rect x="38" y="36" width="6" height="16" rx="2" fill="#fff"/>
    <rect x="48" y="36" width="6" height="16" rx="2" fill="#fff"/>
    <path d="M28 52 H62" stroke="#92400e" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  if (type === "card_draw") return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#ede9fe"/>
    <rect x="28" y="16" width="20" height="30" rx="4" fill="#c4b5fd" transform="rotate(-8 38 31)"/>
    <rect x="35" y="14" width="20" height="30" rx="4" fill="#a78bfa"/>
    <rect x="42" y="12" width="20" height="30" rx="4" fill="#8b5cf6" transform="rotate(8 52 27)"/>
    <text x="52" y="31" font-size="14" fill="#fff" text-anchor="middle" font-weight="bold">?</text>
  </svg>`;
  return `<svg class="building-sprite" viewBox="0 0 90 70" aria-hidden="true">
    <ellipse cx="45" cy="58" rx="28" ry="8" fill="#e2e8f0"/>
    <rect x="28" y="22" width="34" height="28" rx="8" fill="#94a3b8"/>
  </svg>`;
}

function createLotBaseSprite(isOwned) {
  const src = isOwned
    ? "assets/buildings/plot-foundation-owned.png"
    : "assets/buildings/plot-empty-unowned.png";
  const alt = isOwned ? "已购地基" : "待售空地";
  return `<img class="building-sprite" src="${src}" alt="${alt}" draggable="false">`;
}

function createBuildingSvg(type, level, color, isLarge = false) {
  let filename;
  if (type === "hotel") {
    filename = isLarge ? `hotel-large-lv${level}` : `hotel-small-lv${level}`;
  } else {
    filename = `${type}-lv${level}`;
  }
  return `<img class="building-sprite" src="assets/buildings/${filename}.png" alt="${type} Lv.${level}" draggable="false">`;
}



// ─── 地块 Tooltip ────────────────────────────────────────────────────────────
let tooltipLongPressTimer = null;

function buildTooltipContent(idx) {
  // 若是大地块副格，映射到主格
  let tile = state.board[idx];
  if (!tile) return "";
  if (tile.isLargeSecondary && tile.largePrimaryIndex != null)
    tile = state.board[tile.largePrimaryIndex];

  if (tile.isStart) {
    const preview = `<div class="tt-preview tt-preview-special">${createStartSvg()}</div>`;
    return `<button class="tt-close" aria-label="关闭">✕</button>
      <div class="tt-name">起点 · 市政府</div>
      <span class="tt-badge" style="background:#fde68a;">奖励地块</span>
      ${preview}
      <div class="tt-row">经过自动领取 ¥${CONFIG.startBonus}</div>
      <div class="tt-row">停留可强制收购对手一处地产</div>`;
  }

  if (tile.isSpecial) {
    const s = tile.special;
    const preview = `<div class="tt-preview tt-preview-special">${createSpecialSvg(s.type)}</div>`;
    return `<button class="tt-close" aria-label="关闭">✕</button>
      <div class="tt-name">${tile.name}</div>
      <span class="tt-badge" style="background:${s.color};">${s.label}</span>
      ${preview}
      <div class="tt-row">${s.description}</div>`;
  }

  const lot = tile.lot;
  if (!lot) return `<div class="tt-name">${tile.name}</div>`;

  const owner = lot.ownerId ? getPlayerById(lot.ownerId) : null;
  const ownerColor = owner ? owner.color : "#64748b";
  const ownerText = owner ? owner.name : "待售";
  const dots = [1, 2, 3].map(l =>
    `<span class="tt-dot${l <= lot.level ? " filled" : ""}"></span>`).join("");
  const largeMark = lot.isLarge ? `<span class="tt-large-tag">大型</span>` : "";

  // 建筑预览：已建则显示对应等级建筑图，未建则显示地基
  const spriteHtml = lot.level > 0
    ? createBuildingSvg(lot.theme.key, lot.level, owner?.color ?? "#64748b", lot.isLarge)
    : createLotBaseSprite(!!lot.ownerId);
  // 背景色用主题色淡化，与格子保持一致感
  const previewBg = lot.level > 0
    ? `background:linear-gradient(160deg,${lot.theme.color}33,${lot.theme.color}11)`
    : `background:rgba(255,255,255,0.04)`;
  const preview = `<div class="tt-preview" style="${previewBg}">${spriteHtml}</div>`;

  let tollBlock = "";
  if (owner) {
    tollBlock = `<div class="tt-toll">收费 ¥${lot.tolls[lot.level]}</div>
      <div class="tt-toll-label">Lv.0 ¥${lot.tolls[0]}　Lv.1 ¥${lot.tolls[1]}　Lv.2 ¥${lot.tolls[2]}　Lv.3 ¥${lot.tolls[3]}</div>`;
  } else {
    tollBlock = `<div class="tt-price-row"><span>售价 ¥${lot.price}</span><span>基础收费 ¥${lot.tolls[0]}</span></div>`;
  }

  const upgradeHint = (owner && lot.level < 3)
    ? `<div class="tt-upgrade">↑ 升至 Lv.${lot.level + 1} 需 ¥${lot.buildCosts[lot.level + 1]}</div>` : "";

  return `<button class="tt-close" aria-label="关闭">✕</button>
    <div class="tt-name">${tile.name}${largeMark}</div>
    <span class="tt-badge" style="background:${lot.theme.color};">${lot.theme.label}</span>
    <div class="tt-owner-row">
      <span style="color:${ownerColor};font-weight:700;">${ownerText}</span>
      <div class="tt-level-dots">${dots}</div>
    </div>
    ${preview}
    <div class="tt-divider"></div>
    ${tollBlock}
    ${upgradeHint}
    <div class="tt-district">📍 ${lot.district || "—"}</div>`;
}

function positionTooltip(anchorEl) {
  if (!tileTooltipEl) return;
  // 手机 (无 hover 能力): 固定居中
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    tileTooltipEl.style.cssText =
      "left:50%;top:50%;transform:translate(-50%,-50%);";
    return;
  }
  // 桌面: 贴近格子，避免超出视口
  const r = anchorEl.getBoundingClientRect();
  const w = 218, h = tileTooltipEl.offsetHeight || 260;
  let left = r.right + 10;
  let top = r.top;
  if (left + w > window.innerWidth - 8) left = r.left - w - 10;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  if (top < 8) top = 8;
  tileTooltipEl.style.cssText = `left:${left}px;top:${top}px;transform:none;`;
}

function showTileTooltip(idx, anchorEl) {
  if (!tileTooltipEl || !state.board) return;
  tileTooltipEl.innerHTML = buildTooltipContent(idx);
  tileTooltipEl.classList.remove("hidden");
  positionTooltip(anchorEl);
  // 关闭按钮 (手机)
  tileTooltipEl.querySelector(".tt-close")?.addEventListener("click", hideTileTooltip);
}

function hideTileTooltip() {
  tileTooltipEl?.classList.add("hidden");
}

// 桌面: 鼠标悬浮
boardEl.addEventListener("mouseover", (e) => {
  const tile = e.target.closest(".tile[data-tile-index]");
  if (!tile) { hideTileTooltip(); return; }
  showTileTooltip(Number(tile.dataset.tileIndex), tile);
});
boardEl.addEventListener("mouseleave", hideTileTooltip);

// 手机: 长按 500ms
boardEl.addEventListener("touchstart", (e) => {
  const tile = e.target.closest(".tile[data-tile-index]");
  if (!tile) return;
  clearTimeout(tooltipLongPressTimer);
  tooltipLongPressTimer = setTimeout(() => {
    showTileTooltip(Number(tile.dataset.tileIndex), tile);
  }, 500);
}, { passive: true });
boardEl.addEventListener("touchend",   () => clearTimeout(tooltipLongPressTimer), { passive: true });
boardEl.addEventListener("touchmove",  () => clearTimeout(tooltipLongPressTimer), { passive: true });
// 点击棋盘空白处关闭
boardEl.addEventListener("click", (e) => {
  if (!e.target.closest(".tile")) hideTileTooltip();
});

eventActionsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (btn) hideModal(true, btn.dataset.action);
});
soundToggleBtn?.addEventListener("click", () => {
  const nextEnabled = !soundState.enabled;
  setSoundEnabled(nextEnabled);
  if (nextEnabled) playSound("card", { volumeMultiplier: 0.55, rate: 1.06 });
});
musicToggleBtn?.addEventListener("click", () => {
  unlockBgmPlayback();
  setMusicEnabled(!bgmState.enabled);
});
document.addEventListener("pointerdown", unlockBgmPlayback, { once: true });
document.addEventListener("keydown", unlockBgmPlayback, { once: true });
document.addEventListener("visibilitychange", syncBgmPlayback);
rollBtn.addEventListener("click", () => void playHumanTurn());
restartBtn.addEventListener("click", () => { initializeGame(); showStartScreen(); });
scoreboardEl.addEventListener("click", (e) => {
  if (e.target.closest(".play-again-btn")) void startNewGame();
  if (e.target.closest(".view-history-btn")) showHistoryOverlay();
});
warmSoundCache();
ensureBgmEngine();
ensureFallbackBgmAudio();
showStartScreen();
