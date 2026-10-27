/* One line-icon set for cards, faces, weather, services, town materials and results. */
(function (root) {
  'use strict';
  const dot = (x, y, r = .95) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
  const PATHS = {
    // Item cards
    buyProperty: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M12 10.5v6M9 13.5h6"/>',
    sellProperty: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/><path d="M9 12h7M9 15.5h4.5"/>',
    teleport: '<path d="M12.4 12.5a1 1 0 0 1 2 0 2 2 0 0 1-4 0 3 3 0 0 1 6 0 4 4 0 0 1-8 0 5 5 0 0 1 10 0 6 6 0 0 1-12 0"/>',
    boost: `<rect x="3.5" y="8.5" width="10" height="10" rx="2.2"/><rect x="10.5" y="4" width="10" height="10" rx="2.2" fill="var(--icon-paper,#fffaf0)"/>${dot(6.8, 11.8)}${dot(10.2, 15.2)}${dot(13.8, 7.3)}${dot(17.2, 10.7)}`,
    slow: '<path d="M3 18h12.5a4.5 4.5 0 0 0 4.5-4.5V12"/><path d="M14.5 18a5.5 5.5 0 1 1 0-11 3.8 3.8 0 0 1 0 7.6 2.2 2.2 0 0 1 0-4.4"/><path d="M20 12V8.5M17.5 12.5V9.5"/>',
    launch: '<rect x="4" y="4" width="16" height="16" rx="3.2"/><circle cx="12" cy="12" r="3"/><path d="M12 6.5v2.2M12 15.3v2.2M6.5 12h2.2M15.3 12h2.2"/>',
    motorcycle: '<circle cx="6" cy="16.5" r="2.6"/><circle cx="18" cy="16.5" r="2.6"/><path d="M8.6 16.5h4.7l2.6-7.5h2.6"/><path d="M13.3 16.5 10.8 11H7"/><path d="M15.9 9 15 6.3h-2.2"/>',
    rewind: '<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.2"/><path d="M4.2 4.2v3.7h3.7"/><path d="M12 8v4.4l3 1.8"/>',
    swap: '<path d="M5 8.5h13.5L15 5"/><path d="M19 15.5H5.5L9 19"/>',
    freeze: '<path d="M4 11.5a8 6.5 0 0 0 16 0z"/><path d="m4 11.5 2-3.2 2 3.2 2-3.2 2 3.2 2-3.2 2 3.2 2-3.2 2 3.2"/><path d="M12 18v3"/>',
    combo: '<ellipse cx="12" cy="10.5" rx="7" ry="2.7"/><path d="M5 10.5v6c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-6"/><path d="M8 3.5 11 8M16 3.5 13 8"/>',
    shield: '<path d="M12 3.5 19 6v5.6c0 4.4-3.1 7.7-7 8.9-3.9-1.2-7-4.5-7-8.9V6z"/><path d="m8.8 12 2.2 2.2 4.3-4.5"/>',
    doubleRent: '<path d="M7 4.5h10l3.5 5L12 20 3.5 9.5z"/><path d="M3.5 9.5h17M9.2 9.5 12 20l2.8-10.5M7 4.5l2.2 5L12 4.5l2.8 5 2.2-5"/>',
    propertySwap: '<path d="M3.5 12.5 7 9.5l3.5 3v5h-7zM13.5 12.5l3.5-3 3.5 3v5h-7z"/><path d="M8.5 5.5h7.5l-2-2M15.5 20.5H8l2 2"/>',
    reverse: '<path d="M17 20v-8.5a5 5 0 0 0-10 0V16"/><path d="m4 13 3 3 3-3"/>',
    // Board services
    start: '<path d="M4 20h16M5.5 20v-7.5M9.5 20v-7.5M14.5 20v-7.5M18.5 20v-7.5M3.5 12.5h17L12 7z"/><path d="M12 7V3l3 1.1L12 5.2"/>',
    bank: '<ellipse cx="12" cy="7" rx="6.5" ry="2.5"/><path d="M5.5 7v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V7M5.5 12v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/>',
    construction: '<path d="M6.5 20V5H18"/><path d="m6.5 8.5 4-3.5M16 5v4.5"/><path d="M14.5 9.5h3v2.8h-3z"/><path d="M4 20h6"/>',
    cardDraw: '<rect x="4.5" y="6" width="9" height="13" rx="1.6" transform="rotate(-10 9 12.5)"/><rect x="10" y="5" width="9" height="13" rx="1.6" transform="rotate(9 14.5 11.5)" fill="var(--icon-paper,#fffaf0)"/>',
    shop: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    rush: '<path d="m5 6 6 6-6 6M12 6l6 6-6 6"/>',
    wheel: `<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/>${dot(12, 12, 1.7)}`,
    junction: '<path d="M12 21v-7l-5-5M12 14l5-5"/><path d="M4.5 9.5V6H8M19.5 9.5V6H16"/>',
    onsen: '<path d="M4 14h16a8 4.6 0 0 1-16 0z"/><path d="M8.5 10.5c-1.1-1.3 1.1-2.2 0-3.5M12 10.5c-1.1-1.3 1.1-2.2 0-3.5M15.5 10.5c-1.1-1.3 1.1-2.2 0-3.5"/>',
    chart: '<path d="M4 20h16M6.5 16.5l4-4 3 2.5 4.5-5.5"/><path d="M14.5 9.5H18V13"/>',
    relief: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="m6.3 6.3 3.3 3.3M14.4 14.4l3.3 3.3M17.7 6.3l-3.3 3.3M9.6 14.4l-3.3 3.3"/>',
    ai: `<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5.5"/><circle cx="12" cy="4.4" r="1.1"/>${dot(9.5, 13)}${dot(14.5, 13)}<path d="M9.5 16.3h5"/>`,
    notice: '<path d="m12 3.5 2.3 6.2 6.2 2.3-6.2 2.3L12 20.5l-2.3-6.2L3.5 12l6.2-2.3z"/>',
    // Weather
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    rain: '<path d="M4 12a8 8 0 0 1 16 0z"/><path d="M12 12v5.5a2 2 0 0 1-4 0M12 4V3"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 6l2.4-1.4M9.6 19.4 12 18l2.4 1.4"/>',
    // Town materials and landscapes
    stamp: '<path d="M9 4h6v5l2 2v3H7v-3l2-2z"/><path d="M5 17h14v3H5z"/>',
    shell: '<path d="M12 19.5 4.5 10a9 9 0 0 1 15 0z"/><path d="M12 19.5 8.6 7.6M12 19.5l3.4-11.9M12 19.5V7"/>',
    crystal: '<path d="m12 3 5 6.2-5 11.8-5-11.8z"/><path d="M7 9.2h10M12 3v18"/>',
    garden: '<path d="M12 21v-8"/><path d="M8 6.5c0 4 1.8 6.5 4 6.5s4-2.5 4-6.5l-2 1.5-2-3-2 3z"/><path d="M12 17.5c-2.4 0-3.9-1.4-4.4-3.4M12 18.8c2.4 0 3.9-1.4 4.4-3.4"/>',
    waterfront: '<path d="M12 4v11"/><path d="m12 5 6 9h-6"/><path d="m11 7.5-4 6.5h4"/><path d="M4 17h16l-2 3H6z"/>',
    skyline: '<path d="M9.5 9h5l1.5 11H8z"/><path d="m9 9 .5-3h5l.5 3M12 3.5V6"/><path d="M8.6 14h6.8"/><path d="m4 7.5 3 .8M20 7.5l-3 .8"/>',
    // Results and events
    win: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
    draw: '<path d="M12 4v16M7.5 20h9M5 7h14"/><path d="m5 7-2.5 5h5zM19 7l-2.5 5h5z"/>',
    lose: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
    quake: '<path d="M3.5 20.5h17"/><path d="m6.5 20.5-1.6-10 5.2-1.4 1.5 11.4"/><path d="M13.5 20.5v-6l5 .8v5.2"/><path d="m7 12.5 2.1 1.6-1.2 2 1.4 1.8"/><path d="m14.6 6.4 1.6 2 2.1-1 1 2.6"/>',
  };
  const FACES = {
    surprised: `${dot(9, 10)}${dot(15, 10)}<circle cx="12" cy="15.3" r="1.8"/>`,
    smug: '<path d="M7.8 10h2.6M13.6 10h2.6"/><path d="M9 15c1.5.9 4 .9 6-.8"/>',
    cool: '<path d="M6.5 9.6h11"/><rect x="7" y="9.6" width="4" height="2.6" rx="1.1" fill="currentColor"/><rect x="13" y="9.6" width="4" height="2.6" rx="1.1" fill="currentColor"/><path d="M9.2 15.3c1.8 1.3 3.8 1.3 5.6 0"/>',
    panic: '<circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8.5 16c1-.9 1.8-.9 2.5 0s1.6.9 2.5 0 1.6-.9 2.5 0"/>',
    angry: `<path d="m7.5 8.4 3 1.2M16.5 8.4l-3 1.2"/>${dot(9.3, 11.4)}${dot(14.7, 11.4)}<path d="M9 16h6"/>`,
    relieved: '<path d="M7.8 10.6c.7-.9 1.9-.9 2.6 0M13.6 10.6c.7-.9 1.9-.9 2.6 0"/><path d="M9 14.6c1.7 1.4 4.3 1.4 6 0"/>',
  };
  const FACE_BY_EMOJI = { '😲': 'surprised', '😳': 'surprised', '😮': 'surprised', '😏': 'smug', '😎': 'cool', '😱': 'panic', '😤': 'angry', '😌': 'relieved', '🥹': 'relieved' };
  const CARD_ICONS = { buyProperty: 'buyProperty', sellProperty: 'sellProperty', teleport: 'teleport', boost: 'boost', slow: 'slow', launch: 'launch', motorcycle: 'motorcycle', rewind: 'rewind', swap: 'swap', freeze: 'freeze', combo: 'combo', shield: 'shield', doubleRent: 'doubleRent', propertySwap: 'propertySwap', reverse: 'reverse' };
  const SERVICE_ICONS = { start: 'start', bank: 'bank', construction: 'construction', card_draw: 'cardDraw', chance: 'shop', teleport: 'teleport', rush: 'rush', event: 'wheel', junction: 'junction' };
  const wrap = (name, body) => `<svg class="game-icon game-icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  function svg(name) { return PATHS[name] ? wrap(name, PATHS[name]) : ''; }
  function face(face) {
    const mood = FACES[face] ? face : FACE_BY_EMOJI[face];
    return mood ? wrap(`face-${mood}`, `<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".14"/>${FACES[mood]}`) : '';
  }
  root.GameIcons = { svg, face, card: id => svg(CARD_ICONS[id]), service: type => svg(SERVICE_ICONS[type]), has: name => Boolean(PATHS[name]) };
})(typeof window !== 'undefined' ? window : globalThis);
