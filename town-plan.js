/* Shared land plan: the ledger, building UI and scene use the same open cells. */
(function (root, factory) {
  const plan = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = plan;
  root.TownPlan = plan;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const districts = Object.freeze([
    { id: 'dock', name: '码头区', fromWidth: 6, fromHeight: 6, width: 8, height: 6, x: 6, y: 0, w: 2, h: 6, coins: 500, collectionId: 'harbor_shell', count: 2, stage: 1 },
    { id: 'garden', name: '花园区', fromWidth: 8, fromHeight: 6, width: 8, height: 8, x: 0, y: 6, w: 8, h: 2, coins: 800, collectionId: 'city_stamp', count: 2, stage: 2 },
    { id: 'avenue', name: '新街区', fromWidth: 8, fromHeight: 8, width: 10, height: 8, x: 8, y: 0, w: 2, h: 8, coins: 1200, collectionId: 'city_stamp', count: 3, stage: 3 },
    { id: 'lookout', name: '观景区', fromWidth: 10, fromHeight: 8, width: 10, height: 10, x: 0, y: 8, w: 10, h: 2, coins: 1600, collectionId: 'alpine_crystal', count: 3, stage: 4 },
  ].map(Object.freeze));
  function stageOf(town) {
    if (Number.isInteger(town?.landStage) && town.landStage >= 0 && town.landStage <= districts.length) return town.landStage;
    return town?.size === 8 ? 2 : 0;
  }
  function bounds(town) {
    const stage = stageOf(town), current = districts[stage - 1];
    return { stage, width: current?.width || 6, height: current?.height || 6 };
  }
  function getLand(town) {
    const { stage, width, height } = bounds(town);
    const cells = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x, y });
    return { stage, width, height, size: Math.max(width, height), cells, next: districts[stage] || null, districts };
  }
  function isRectOpen(town, x, y, width, height) {
    const land = bounds(town);
    return [x, y, width, height].every(Number.isSafeInteger) && x >= 0 && y >= 0 && width > 0 && height > 0
      && x + width <= land.width && y + height <= land.height;
  }
  return Object.freeze({ districts, getLand, isCellOpen: (town, x, y) => isRectOpen(town, x, y, 1, 1), isRectOpen });
});
