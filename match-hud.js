/* Mirrors scene state onto the page so the floating match UI can follow it:
   day/night, local/whole-map camera, and round progress. */
(() => {
  'use strict';
  const ENTER_NIGHT = 0.6, LEAVE_NIGHT = 0.4;
  let phase = '', view = '';
  function sync() {
    if (document.hidden) return;
    const scene = window.CityScene;
    const atmosphere = scene?.getAtmosphere?.();
    if (atmosphere && typeof atmosphere.night === 'number') {
      // Two thresholds keep the UI from flickering while dusk hovers around the switch point.
      const next = phase === 'night' ? (atmosphere.night < LEAVE_NIGHT ? 'day' : 'night') : (atmosphere.night > ENTER_NIGHT ? 'night' : 'day');
      if (next !== phase) document.body.dataset.cityPhase = phase = next;
    }
    const camera = scene?.getView?.();
    if (camera) {
      const next = camera.local ? 'local' : 'overview';
      if (next !== view) document.body.dataset.cityView = view = next;
    }
  }
  setInterval(sync, 800);
  document.addEventListener('visibilitychange', sync);
  // The camera buttons change the view immediately; do not wait for the next tick.
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-camera]')) requestAnimationFrame(() => requestAnimationFrame(sync));
  }, true);

  // The round-progress bar is hidden on phones; its width drives the line under the round counter.
  const bar = document.getElementById('round-progress-bar');
  const header = document.querySelector('.board-header');
  if (bar && header) {
    const copy = () => header.style.setProperty('--round-progress', bar.style.width || '0%');
    new MutationObserver(copy).observe(bar, { attributes: true, attributeFilter: ['style'] });
    copy();
  }
  window.MatchHud = { sync };
})();
