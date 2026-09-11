/*
 * GameDrama — presentation only. No access to game state.
 * play({ type, title, message, amount, expectedAmount, from, to,
 *        tiles, tileName, leadChanged?, duration?, sessionId?, payerCashAfter?,
 *        cashAfter?, districtCount?, isLarge?, buildingLevel?, isOpeningBuilding? }): Promise<void>
 * from/to: { id: 'human'|'ai', name, color }. Amounts are positive magnitudes.
 * reset() cancels every animation, pending event and sound; all promises resolve.
 * setMuted(boolean) follows the game's sound preference.
 * Auto-advance allows reading time (3–10 seconds). The visible pause button holds
 * the current event indefinitely; Continue always resolves immediately.
 * Scene highlights are delegated to the optional CityScene.effect(event).
 */
(() => {
  'use strict';

  const SVG = {
    rent: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M18 75V45l16-9 16 9v30M50 75V23l17-9 16 9v52M11 78h78" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M27 48v8m10-8v8m22-24v8m14-8v8m-14 7v8m14-8v8M28 65h9m22 0h14" stroke="currentColor" stroke-width="4"/><circle cx="77" cy="75" r="17" fill="var(--drama-paper)" stroke="currentColor" stroke-width="3"/><path d="m69 68 8 8 8-8m-8 8v10m-7-7h14" stroke="currentColor" stroke-width="3"/></svg>',
    seize: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M35 83V15M36 19c16-12 25 12 45 0v35c-20 12-29-12-45 0" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 84h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 11 80 23v28c0 20-30 39-30 39S20 71 20 51V23L50 11Z" fill="currentColor" fill-opacity=".09" stroke="currentColor" stroke-width="4"/><path d="m35 48 11 11 22-24" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 5 8m85 7 5-6M8 58H1m92 0h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    relief: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="50" r="34" stroke="currentColor" stroke-width="4"/><circle cx="50" cy="50" r="17" stroke="currentColor" stroke-width="4"/><path d="m27 25 11 12m25 26 12 12M25 75l12-12m26-26 12-12" stroke="currentColor" stroke-width="12"/><path d="M7 83c26-1 4 17 25 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    build: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M19 86V42h25v44m0 0V22h34v64M12 86h76M52 33h5m9 0h5M52 46h5m9 0h5M52 59h5m9 0h5M27 53h8m-8 13h8M57 85V72h11v13" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M26 29V10m-8 8 8-8 8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    buy: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="m13 47 37-31 37 31M24 40v43h52V40M44 83V60h15v23" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="72" cy="27" r="16" fill="var(--drama-paper)" stroke="currentColor" stroke-width="3"/><path d="m64 27 6 6 11-13" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bank: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><rect x="17" y="17" width="66" height="66" rx="9" stroke="currentColor" stroke-width="4"/><circle cx="49" cy="50" r="19" stroke="currentColor" stroke-width="4"/><circle cx="49" cy="50" r="5" stroke="currentColor" stroke-width="3"/><path d="M49 31v13m0 12v13M30 50h13m12 0h13M78 33h8m-8 34h8" stroke="currentColor" stroke-width="4"/></svg>',
    card: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><rect x="27" y="14" width="48" height="71" rx="7" transform="rotate(9 51 49)" stroke="currentColor" stroke-width="4"/><path d="M22 26 13 76a6 6 0 0 0 5 7l26 5M51 31l5 12 13 5-13 5-5 13-5-13-13-5 13-5 5-12Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
    income: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><ellipse cx="50" cy="69" rx="32" ry="13" stroke="currentColor" stroke-width="4"/><path d="M18 59v10m64-10v10M18 49v10c0 17 64 17 64 0V49M18 39v10c0 17 64 17 64 0V39" stroke="currentColor" stroke-width="4"/><ellipse cx="50" cy="39" rx="32" ry="13" stroke="currentColor" stroke-width="4"/><path d="M50 27V7m-7 8 7-8 7 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    win: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M30 16h40v27c0 14-9 23-20 23s-20-9-20-23V16ZM30 25H15v14c0 13 10 17 19 17m36-31h15v14c0 13-10 17-19 17M50 66v17m-18 3h36" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="m50 29 4 8 9 1-7 7 2 9-8-4-8 4 2-9-7-7 9-1 4-8Z" fill="currentColor"/></svg>',
    notice: '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="m50 11 10 27 29 12-29 11-10 28-11-28L11 50l28-12 11-27Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="m81 13 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="currentColor"/></svg>'
  };
  const LABELS = {rent:'地产收益', seize:'产权风暴', shield:'绝境脱身', relief:'命运转机', build:'城市生长', buy:'版图扩张', bank:'金库时刻', card:'命运揭晓', income:'现金入账', win:'全城见证', notice:'城市快讯'};
  const TITLES = {rent:'租金到账', seize:'地盘易主', shield:'护盾救场', relief:'绝处逢生', build:'新楼落成', buy:'这块地，归你了', bank:'金库开启', card:'好戏开场', income:'意外之财', win:'本局赢家', notice:'命运转动'};
  let layer, boardStage, transferLayer, audioContext, active, eventNumber = 0, muted = false;
  const queue = [];
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!motionPreference?.matches;
  const fmt = value => Math.round(Math.abs(Number(value) || 0)).toLocaleString('zh-CN');
  const finiteAmount = value => Number.isFinite(Number(value)) ? Math.abs(Number(value)) : 0;
  const optionalNumber = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  // Dialogue uses its own rotation, never the random source used by game dice.
  // Keep this tiny cosmetic history across reset so the next game opens differently.
  const lineCursors = new Map();
  const LINES = {
    rentPay:['又要交租啦？','这一脚，踩得有点贵！','好好好，钱给你！'],
    rentCollect:['承让，租金收下啦！','欢迎光临我的地盘！','这一站，轮到我收钱！'],
    hugePay:['我靠你抢钱啊？！','这一脚，钱包都瘪了！','这租金，认真的吗？！'],
    hugeCollect:['这块地，真给力！','这笔租金，漂亮！','等的就是这一脚！'],
    emptyPay:['没钱了呀！','钱包见底啦！','救命，真的一滴不剩了！'],
    zeroCollect:['下次路过，还来坐坐！','这张账单，可不便宜！','我的地盘可有点厉害！'],
    leadPay:['等等，怎么你反超了？','这一笔也太狠了！','风向说变就变啊！'],
    leadCollect:['轮到我领先啦！','这一笔，反超！','好戏才刚开始！'],
    shield:['护盾在手，这笔免单！','嘿，这次收不到啦！','我的护盾，来得正好！'],
    shieldMiss:['啊？这笔被挡住了！','差一点就到账了！','护盾还真救了你！'],
    relief:['活过来了！还能再来！','好险，终于缓过一口气！','钱到账了，先喘口气！'],
    buy:['拿下了！','好地段到手！','这一块，我收下啦！','我的地盘又大一点！'],
    buyDistrict:['连锁地盘，成了！','这条街，越来越有看头！','好地段，连起来更香！'],
    buyLarge:['这大地块，我拿下了！','这么大一片，归我啦！','大地段到手，舒服！'],
    buyOpening:['连楼一起拿下，舒服！','房子都盖好了，真香！','带着楼到手，漂亮！'],
    seize:['我的地盘啊！','怎么说征就征啊？！','这一下，太突然了！']
  };

  function line(key) {
    const choices = LINES[key];
    const index = lineCursors.get(key) || 0;
    lineCursors.set(key, (index + 1) % choices.length);
    return choices[index];
  }

  function purchaseFacts(event) {
    const districtCount = optionalNumber(event.districtCount);
    const buildingLevel = optionalNumber(event.buildingLevel);
    const built = buildingLevel !== null && buildingLevel > 0;
    return {districtCount, buildingLevel, built, chain:districtCount !== null && districtCount >= 2,
      opening:event.isOpeningBuilding === true && built, large:event.isLarge === true};
  }

  function dialogue(event, type, amount) {
    const say = (player, role, mood, face, key) => ({player, role, mood, face, words:line(key)});
    if (type === 'rent') {
      const cash = optionalNumber(event.payerCashAfter ?? event.from?.cashAfter);
      const exhausted = cash !== null && cash <= 0;
      const payer = exhausted ? ['panic','😱','emptyPay'] : event.leadChanged ? ['surprised','😵','leadPay'] : amount >= 300 ? ['complaint','😤','hugePay'] : ['complaint','😮','rentPay'];
      const collector = event.leadChanged ? ['proud','😎','leadCollect'] : amount <= 0 ? ['proud','😏','zeroCollect'] : amount >= 300 ? ['proud','🤩','hugeCollect'] : ['proud','😄','rentCollect'];
      return [say(event.from,'付款方',...payer), say(event.to,'收租方',...collector)];
    }
    if (type === 'buy') {
      const facts = purchaseFacts(event);
      const key = facts.chain ? 'buyDistrict' : facts.opening || facts.built ? 'buyOpening' : facts.large ? 'buyLarge' : 'buy';
      return [say(event.to,'买家','joyful','🤩',key)];
    }
    if (type === 'shield') {
      const lines = [say(event.to,'免付方','relieved','😌','shield')];
      if (event.from?.name && event.from.id !== event.to?.id) lines.push(say(event.from,'收租方','surprised','😳','shieldMiss'));
      return lines;
    }
    if (type === 'relief') return [say(event.to,'获得救助','relieved','🥹','relief')];
    if (type === 'seize' && event.from?.name) return [say(event.from,'原地主','panic','😱','seize')];
    return [];
  }

  function speechBubbles(lines) {
    if (!lines.length) return null;
    const strip = element('div', 'drama-dialogue' + (lines.length === 1 ? ' is-solo' : ''));
    lines.forEach((spoken, index) => {
      const bubble = element('div', `drama-speech is-${spoken.mood}`);
      bubble.dataset.speaker = spoken.player?.id || spoken.role;
      bubble.style.setProperty('--speech-order', index);
      if (spoken.player?.color) bubble.style.setProperty('--speaker-color', spoken.player.color);
      const who = element('div', 'drama-speaker');
      const face = element('span', 'drama-speaker-face', spoken.face);
      face.setAttribute('aria-hidden', 'true');
      who.append(face, element('b', 'drama-speaker-name', spoken.player?.name || spoken.role), element('span', 'drama-speaker-role', spoken.role));
      bubble.append(who, element('p', 'drama-speech-words', spoken.words));
      strip.appendChild(bubble);
    });
    return strip;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function mount() {
    const stage = document.getElementById('board-stage') || document.querySelector('.board-stage');
    if (!stage) return false;
    boardStage = stage;
    // Viewport placement keeps the controls visible even on a short mobile board.
    // Portaling out also avoids the board's clipping and transformed ancestors.
    if (!layer?.isConnected || layer.parentElement !== document.body) {
      layer?.remove();
      layer = element('div', 'drama-layer');
      layer.id = 'drama-layer';
      layer.hidden = true;
      document.body.appendChild(layer);
    }
    if (!transferLayer?.isConnected) {
      transferLayer = element('div', 'drama-transfers');
      transferLayer.id = 'drama-transfers';
      transferLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(transferLayer);
    }
    return true;
  }

  // Creating/resuming the audio context only from a gesture avoids autoplay prompts.
  function unlockAudio() {
    if (muted) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* Audio is optional. */ }
  }
  document.addEventListener('pointerdown', unlockAudio, {passive:true});
  document.addEventListener('keydown', unlockAudio);

  function tone(job, frequency, offset, duration, volume = .025, wave = 'sine') {
    if (muted || !audioContext || audioContext.state !== 'running' || job.done) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + offset;
      osc.type = wave;
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(start);
      osc.stop(start + duration + .03);
      const sound = {osc, gain};
      job.sounds.add(sound);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); job.sounds.delete(sound); };
    } catch (_) { /* A disabled audio device must not stop the game. */ }
  }

  function sound(job, type, major) {
    if (type === 'shield') {
      [392, 587.33, 783.99].forEach((f, i) => tone(job, f, .03 + i * .055, .42, .022));
    } else if (type === 'seize') {
      tone(job, 98, .15, .22, .048, 'triangle');
      tone(job, 146.83, .19, .25, .028, 'triangle');
    } else if (type === 'rent' || type === 'income' || type === 'bank' || type === 'relief') {
      (major ? [329.63, 440, 554.37, 659.25] : [440, 659.25]).forEach((f, i) => tone(job, f, .16 + i * .065, .22, .019));
      if (major) tone(job, 110, 0, .45, .03, 'triangle');
    } else if (type === 'win') {
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => tone(job, f, .12 * i, .44, .018));
    } else if (type === 'buy') {
      [523.25, 659.25, 783.99].forEach((frequency, i) => tone(job, frequency, .07 + i * .09, .24, .017));
      if (major) tone(job, 1046.5, .38, .36, .012);
    } else if (type === 'build') {
      tone(job, 392, .07, .2, .02); tone(job, 523.25, .17, .28, .02);
    }
  }

  function delay(job, fn, ms) {
    const id = setTimeout(() => {
      job.timers.delete(id);
      if (!job.done) { try { fn(); } catch (_) { job.finish(); } }
    }, ms);
    job.timers.add(id);
    return id;
  }

  function animate(job, node, frames, options) {
    if (!node.animate || job.done) return null;
    const animation = node.animate(frames, options);
    job.animations.add(animation);
    animation.finished.then(() => job.animations.delete(animation), () => job.animations.delete(animation));
    return animation;
  }

  function playerAnchor(player) {
    if (!player || player.id == null) return null;
    const all = Array.from(document.querySelectorAll('[data-player-anchor]'));
    const visible = all.filter(node => {
      if (node.getAttribute('data-player-anchor') !== String(player.id)) return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    });
    return visible.find(node => node.closest('#scoreboard')) || visible.find(node => node.closest('#mini-scoreboard')) || visible[0] || null;
  }

  function anchorCenter(node) {
    const r = node.getBoundingClientRect();
    return {x: r.left + r.width / 2, y:r.top + r.height / 2, rect:r};
  }

  function signedCounter(job, player, amount, sign) {
    if (!amount) return;
    const anchor = playerAnchor(player);
    if (!anchor) return;
    const p = anchorCenter(anchor);
    const node = element('span', 'drama-cash-float ' + (sign === '-' ? 'is-loss' : 'is-gain'), sign + '¥' + fmt(amount));
    node.style.left = p.x + 'px';
    node.style.top = Math.max(22, p.y) + 'px';
    transferLayer.appendChild(node);
    job.nodes.add(node);
    animate(job, node, reduced() ? [{opacity:0}, {opacity:1, offset:.15}, {opacity:1, offset:.8}, {opacity:0}] : [
      {opacity:0, transform:'translate(-50%, 8px) scale(.8)'},
      {opacity:1, transform:'translate(-50%, -12px) scale(1.08)', offset:.18},
      {opacity:1, transform:'translate(-50%, -17px) scale(1)', offset:.68},
      {opacity:0, transform:'translate(-50%, -40px) scale(.96)'}
    ], {duration:1200, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards'});
    if (!reduced()) animate(job, anchor, [{filter:'brightness(1)'}, {filter:'brightness(1.24)'}, {filter:'brightness(1)'}], {duration:650, easing:'ease-out'});
  }

  function coins(job, event) {
    const amount = finiteAmount(event.amount);
    if (!amount || reduced()) return;
    const fromAnchor = playerAnchor(event.from);
    const toAnchor = playerAnchor(event.to);
    const scene = anchorCenter(boardStage?.isConnected ? boardStage : layer);
    const from = fromAnchor ? anchorCenter(fromAnchor) : {x:scene.x, y:scene.y};
    const to = toAnchor ? anchorCenter(toAnchor) : null;
    if (!to) return;
    const count = amount >= 300 || event.leadChanged ? 14 : 7;
    for (let i = 0; i < count; i++) {
      delay(job, () => {
        const node = element('i', 'drama-coin', '¥');
        node.style.left = from.x + 'px';
        node.style.top = from.y + 'px';
        transferLayer.appendChild(node);
        job.nodes.add(node);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const bend = 64 + (i % 4) * 17;
        const side = ((i % 3) - 1) * 12;
        const frames = [];
        for (let step = 0; step <= 12; step++) {
          const t = step / 12;
          const x = dx * t + Math.sin(Math.PI * t) * side;
          const y = dy * t - Math.sin(Math.PI * t) * bend;
          frames.push({transform:`translate(${x}px, ${y}px) rotateY(${t * 720}deg) rotate(${t * 55}deg) scale(${.75 + Math.sin(Math.PI * t) * .3})`, opacity: t === 0 || t === 1 ? 0 : 1, offset:t});
        }
        animate(job, node, frames, {duration:690, easing:'ease-in-out', fill:'forwards'});
      }, 150 + i * 42);
    }
  }

  function confetti(job) {
    if (reduced()) return;
    const colors = ['#d9a94b', '#5aa99a', '#e17c57', '#f7e9bb', '#466f81'];
    for (let i = 0; i < 32; i++) {
      const piece = element('i', 'drama-confetti');
      piece.style.background = colors[i % colors.length];
      piece.style.left = (8 + (i * 37) % 85) + '%';
      piece.style.top = '-12px';
      layer.appendChild(piece);
      animate(job, piece, [
        {transform:'translate3d(0,-10px,0) rotate(0deg)', opacity:0},
        {opacity:1, offset:.08},
        {transform:`translate3d(${(i % 2 ? 1 : -1) * (30 + i * 2)}px, ${layer.clientHeight + 30}px, 0) rotate(${240 + i * 23}deg)`, opacity:0}
      ], {duration:1700 + i % 5 * 170, delay:i % 7 * 80, fill:'forwards', easing:'cubic-bezier(.2,.2,.7,1)'});
    }
  }

  function purchaseBurst(job, card, important) {
    if (reduced()) return;
    const stage = layer.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const decorations = [];
    for (let i = 0; i < (important ? 26 : 16); i++) {
      const side = i % 2 ? 1 : -1;
      const kind = i % 6 === 0 ? 'coin' : i % 3 === 0 ? 'ribbon' : 'star';
      const piece = element('i', `drama-purchase-particle is-${kind}`, kind === 'coin' ? '¥' : kind === 'star' ? '✦' : '');
      piece.setAttribute('aria-hidden', 'true');
      piece.style.left = (side < 0 ? box.left - stage.left + 8 : box.right - stage.left - 8) + 'px';
      piece.style.top = (box.top - stage.top + 22 + (i * 29) % Math.max(30, box.height * .65)) + 'px';
      piece.style.setProperty('--particle-color', ['#efbb43','#2c9b8c','#e98958','#e1b252'][i % 4]);
      layer.appendChild(piece);
      job.nodes.add(piece);
      const drift = side * (22 + (i * 13) % 65);
      const lift = 20 + (i * 17) % 85;
      const animation = animate(job, piece, [
        {transform:'translate(0,0) rotate(0deg) scale(.5)', opacity:0},
        {transform:`translate(${drift * .5}px,${-lift}px) rotate(${side * 70}deg) scale(1)`, opacity:1, offset:.38},
        {transform:`translate(${drift}px,${28 + i % 4 * 12}px) rotate(${side * 150}deg) scale(.7)`, opacity:0}
      ], {duration:1100 + i % 5 * 120, delay:60 + i % 6 * 65, fill:'both', easing:'cubic-bezier(.2,.65,.3,1)'});
      decorations.push({piece, animation});
    }
    // Pausing is for reading: finish the flourish and keep all words on screen.
    job.clearCelebration = () => {
      decorations.forEach(({piece, animation}) => {
        try { animation?.cancel(); } catch (_) {}
        piece.remove();
        job.nodes.delete(piece);
      });
    };
  }

  function stopAutoAdvance(job) {
    if (!job.auto) return;
    for (const key of ['leaveTimer', 'endTimer']) {
      clearTimeout(job.auto[key]);
      job.timers.delete(job.auto[key]);
      job.auto[key] = null;
    }
  }

  function scheduleAutoAdvance(job) {
    const auto = job.auto;
    if (!auto || auto.paused || job.done) return;
    stopAutoAdvance(job);
    auto.started = performance.now();
    auto.leaveTimer = delay(job, () => layer.classList.add('is-leaving'), Math.max(0, auto.remaining - 180));
    auto.endTimer = delay(job, () => job.finish(), auto.remaining);
  }

  function toggleAutoAdvance(job, button, status) {
    const auto = job.auto;
    if (!auto || job.done) return;
    if (!auto.paused) {
      auto.remaining = Math.max(0, auto.remaining - (performance.now() - auto.started));
      auto.paused = true;
      stopAutoAdvance(job);
      layer.classList.remove('is-leaving');
      // Reading should never leave a monetary amount stranded mid-count.
      job.settleAmount?.();
      job.clearCelebration?.();
    } else {
      auto.paused = false;
      scheduleAutoAdvance(job);
    }
    layer.classList.toggle('is-paused', auto.paused);
    button.textContent = auto.paused ? '继续自动' : '停住看';
    button.setAttribute('aria-pressed', String(auto.paused));
    button.setAttribute('aria-label', auto.paused ? '恢复本次演出的自动继续' : '暂停自动继续，停住阅读本次事件');
    status.textContent = auto.paused ? '已停住' : '自动继续';
  }

  function render(job, event) {
    const type = Object.hasOwn(SVG, event.type) ? event.type : 'notice';
    const amount = finiteAmount(event.amount);
    const leadChanged = type === 'rent' && !!event.leadChanged;
    const facts = purchaseFacts(event);
    const importantPurchase = type === 'buy' && (facts.chain || facts.large || facts.built);
    const major = type === 'rent' && (amount >= 300 || leadChanged) || ['seize', 'shield', 'relief', 'win'].includes(type) || type === 'bank' && amount >= 300 || importantPurchase;
    let defaultDuration = type === 'win' ? 6500 : major ? 6000 : type === 'rent' ? 4500 : 3000;
    const messageLength = String(event.message || '').length;
    if (messageLength > 50) defaultDuration = Math.max(defaultDuration, Math.min(10000, 1500 + messageLength * 55));
    const duration = Number.isFinite(Number(event.duration)) && event.duration != null ? Math.max(defaultDuration, Math.min(10000, Number(event.duration))) : defaultDuration;
    layer.replaceChildren();
    layer.className = `drama-layer drama-kind-${type}${major ? ' is-major' : ' is-minor'}${leadChanged ? ' is-lead-change' : ''}${reduced() ? ' is-reduced-motion' : ''}`;
    layer.hidden = false;
    document.body.classList.add('drama-playing');
    layer.style.setProperty('--drama-duration', duration + 'ms');
    const glow = element('div', 'drama-ambient');
    layer.appendChild(glow);
    const card = element('section', 'drama-card');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-atomic', 'true');
    const content = element('div', 'drama-content');
    const meta = element('div', 'drama-meta');
    const kicker = element('span', 'drama-kicker', LABELS[type]);
    kicker.prepend(element('i', 'drama-live-dot'));
    meta.append(kicker, element('span', 'drama-sequence', String(++eventNumber).padStart(2, '0')));
    content.appendChild(meta);
    const speech = speechBubbles(dialogue(event, type, amount));
    if (speech) content.appendChild(speech);
    const body = element('div', 'drama-body');
    const symbol = element('div', 'drama-symbol');
    symbol.innerHTML = SVG[type];
    symbol.appendChild(element('i', 'drama-symbol-orbit'));
    const copy = element('div', 'drama-copy');
    let title = event.title || TITLES[type];
    if (type === 'rent' && amount >= 300) title = event.tiles?.length > 1 ? '连锁收租' : '重磅账单';
    if (leadChanged) title = '这一笔，局势反转！';
    if (type === 'buy') title = facts.chain ? '街区连锁，拿下了！' : facts.built ? '连楼一起，拿下了！' : facts.large ? '大地块，拿下了！' : '拿下了！';
    const heading = element('h3', 'drama-title', title);
    copy.appendChild(heading);
    if (type === 'seize') copy.appendChild(element('span', 'drama-stamp', '征用令'));
    const showAmount = amount > 0 || type === 'shield';
    if (showAmount) {
      const numberLine = element('div', 'drama-amount-line');
      if (type === 'shield') {
        const expected = finiteAmount(event.expectedAmount) || amount;
        if (expected) numberLine.appendChild(element('del', 'drama-expected-amount', '¥' + fmt(expected)));
        numberLine.append(element('span', 'drama-currency', '¥'), element('strong', 'drama-amount', '0'), element('span', 'drama-amount-unit', '本次免付'));
      } else {
        const prefix = ['relief', 'income'].includes(type) ? '+¥' : '¥';
        numberLine.append(element('span', 'drama-currency', prefix));
        const counter = element('strong', 'drama-amount', !reduced() && amount >= 100 ? '0' : fmt(amount));
        numberLine.appendChild(counter);
        if (!reduced() && amount >= 100) {
          counter.setAttribute('aria-label', fmt(amount));
          const steps = 14;
          const countTimers = [];
          for (let i = 0; i < steps; i++) countTimers.push(delay(job, () => {counter.textContent = fmt(amount * (1 - Math.pow(1 - (i + 1) / steps, 3)));}, 95 + i * 32));
          job.settleAmount = () => {
            countTimers.forEach(id => {clearTimeout(id); job.timers.delete(id);});
            counter.textContent = fmt(amount);
          };
        }
        if (type === 'buy') numberLine.appendChild(element('span', 'drama-amount-unit', '买入花费'));
      }
      copy.appendChild(numberLine);
    }
    if (type === 'buy') {
      const ribbon = element('div', 'drama-purchase-ribbon');
      ribbon.appendChild(element('span', 'drama-purchase-tag', '地产到手'));
      if (facts.chain) ribbon.appendChild(element('span', 'drama-purchase-tag', `街区已拥有 ${Math.floor(facts.districtCount)} 处`));
      if (facts.large) ribbon.appendChild(element('span', 'drama-purchase-tag', '大型地产'));
      if (facts.built) ribbon.appendChild(element('span', 'drama-purchase-tag', `${facts.opening ? '开业楼 · ' : ''}Lv.${Math.floor(facts.buildingLevel)} 建筑保留`));
      copy.appendChild(ribbon);
    }
    if (event.message) copy.appendChild(element('p', 'drama-message', event.message));
    const detail = element('div', 'drama-detail');
    if (event.from?.name || event.to?.name) {
      if (event.from?.name) detail.appendChild(element('span', 'drama-person drama-from', event.from.name));
      if (event.from?.name && event.to?.name) detail.appendChild(element('span', 'drama-transfer-arrow', '→'));
      if (event.to?.name) detail.appendChild(element('span', 'drama-person drama-to', event.to.name));
    }
    if (event.tileName) detail.appendChild(element('span', 'drama-place', event.tileName));
    if (leadChanged) {
      const badge = element('span', 'drama-lead-badge', `${event.to?.name || '收款方'} 反超领先`);
      badge.prepend(element('i', 'drama-lead-arrow', '↗'));
      detail.appendChild(badge);
    }
    if (detail.childNodes.length) copy.appendChild(detail);
    body.append(symbol, copy);
    content.appendChild(body);
    card.appendChild(content);
    const footer = element('div', 'drama-footer');
    const timing = element('div', 'drama-timing');
    const autoStatus = element('span', 'drama-auto-status', '自动继续');
    const progress = element('span', 'drama-progress');
    progress.setAttribute('aria-hidden', 'true');
    progress.appendChild(element('i'));
    timing.append(autoStatus, progress);
    const playback = element('div', 'drama-playback-actions');
    const pause = element('button', 'drama-pause', '停住看');
    pause.type = 'button';
    pause.setAttribute('aria-pressed', 'false');
    pause.setAttribute('aria-label', '暂停自动继续，停住阅读本次事件');
    pause.addEventListener('click', () => toggleAutoAdvance(job, pause, autoStatus));
    const skip = element('button', 'drama-skip', '继续');
    skip.type = 'button';
    skip.setAttribute('aria-label', '跳过本次演出，继续游戏');
    skip.addEventListener('click', () => job.finish(), {once:true});
    playback.append(pause, skip);
    footer.append(timing, playback);
    card.appendChild(footer);
    layer.appendChild(card);
    if (!reduced()) {
      animate(job, card, [{opacity:0, transform:'translateY(18px) scale(.96)'}, {opacity:1, transform:'translateY(0) scale(1)'}], {duration:300, easing:'cubic-bezier(.16,1,.3,1)', fill:'both'});
    }
    try {
      const sceneEffect = window.CityScene?.effect(event);
      if (sceneEffect && typeof sceneEffect.catch === 'function') sceneEffect.catch(() => {});
    } catch (_) { /* The board is an optional companion, never a dependency. */ }
    sound(job, type, major);
    if (type === 'rent' && amount >= 300) {
      tone(job, 185, 0, .11, .012, 'triangle');
      tone(job, 139, .10, .14, .010, 'triangle');
    }
    if (['rent', 'bank', 'income', 'relief'].includes(type)) {
      coins(job, event);
      if (type === 'rent' || type === 'bank') delay(job, () => signedCounter(job, event.from, amount, '-'), 280);
      delay(job, () => signedCounter(job, event.to, amount, '+'), 460);
    }
    if (type === 'win') confetti(job);
    if (type === 'buy') {
      purchaseBurst(job, card, importantPurchase);
      delay(job, () => {if (!job.auto?.paused) signedCounter(job, event.to, amount, '-');}, 280);
    }
    job.auto = {remaining:duration, started:0, paused:false, leaveTimer:null, endTimer:null};
    scheduleAutoAdvance(job);
  }

  function drain() {
    if (active || !queue.length) return;
    const request = queue.shift();
    const job = {timers:new Set(), animations:new Set(), sounds:new Set(), nodes:new Set(), done:false};
    active = job;
    job.finish = () => {
      if (job.done) return;
      job.done = true;
      job.timers.forEach(clearTimeout);
      job.timers.clear();
      job.animations.forEach(animation => {try {animation.cancel();} catch (_) {}});
      job.sounds.forEach(({osc, gain}) => {try {osc.stop(); osc.disconnect(); gain.disconnect();} catch (_) {}});
      job.nodes.forEach(node => node.remove());
      if (layer) {layer.hidden = true; layer.replaceChildren();}
      document.body.classList.remove('drama-playing');
      active = null;
      request.resolve();
      // Resolve first so game-state continuations can run before the next event.
      queueMicrotask(drain);
    };
    try {
      if (!mount()) {job.finish(); return;}
      render(job, request.event);
    } catch (error) {
      console.warn('Event presentation skipped:', error);
      job.finish();
    }
  }

  window.GameDrama = Object.freeze({
    play(event) {
      return new Promise(resolve => {
        queue.push({event:event && typeof event === 'object' ? {...event} : {type:'notice'}, resolve});
        drain();
      });
    },
    reset() {
      queue.splice(0).forEach(request => request.resolve());
      active?.finish();
      if (layer) {layer.hidden = true; layer.replaceChildren();}
      document.body.classList.remove('drama-playing');
      transferLayer?.replaceChildren();
      eventNumber = 0;
    },
    setMuted(value) {
      muted = !!value;
      if (muted && active) {
        active.sounds.forEach(({osc, gain}) => {try {osc.stop(); osc.disconnect(); gain.disconnect();} catch (_) {}});
        active.sounds.clear();
      }
    }
  });
})();
