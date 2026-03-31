import createREGL from 'https://cdn.skypack.dev/regl';

import { setupCamera } from './core/camera.js';
import { createStarRenderer } from './core/stars.js';
import { selectStarAt } from './core/select.js';
import { createJumpRenderer } from './core/jumps.js';

import {
  createVoronoiComputeController,
  renderVoronoi
} from './modules/voronoi.js';

import { createSlicerGrid } from './modules/slicerGrid.js';
import { setupOrbitControl } from './modules/orbitControl.js';

import { initTheme } from './modules/uiTheme.js';

import { createLeftPanel, createRightPanel } from './modules/uiPanels.js';

import {
  createStarLabelUI,
  createCanvasLabelRenderer,
  createCanvasIconRenderer
} from './modules/labels.js';

import {
  loadStarOwnership,
  getOwnedStars,
  getOwnerId,
  buildOwnerMap,
  buildTerritoryColors,
  getIconName,
  getOwnerColorHex,
  createOwnershipSignature
} from './modules/starOwnership.js';

/* ============================================================================
 * CONFIG
 * ========================================================================== */


const APP_STATE = {
  resolution: 2,
  showRegionHighlights: false,
  showConstellationHighlights: true,
  showJumps: true,
  showGalaxyGrid: true,
  showCanvasLabels: true,
  showTerritories: true
};

const VORONOI_VISUAL = {
  enabled: true,

  showTerritoryFaces: true,
  showBorderFaces: true,
  showBorderLines: true,

  territoryFaceAlpha: 0.04,
  borderFaceAlpha: 0.22,
  borderLineAlpha: 0.5,

  stripeOverlay: true,
  stripeSpacing: 12,
  stripeWidth: 4,
  stripeStrength: 0.55,

  borderInnerGlow: true,
  borderGlowSize: 8,
  borderGlowIntensity: 0.35
};

const VORONOI_BUILD_OPTIONS = {
  contextK: 6,
  contextScaleMultiplier: 2.4,
  prefilterScaleMultiplier: 3.5,

  ghostSites: true,
  ghostClearanceMultiplier: 0.8,
  ghostCoverageThreshold: 0.35,
  maxGhostDistanceMultiplier: 1.1,

  frontierGhosts: true,
  frontierDirectionCount: 24,
  frontierGhostRadiusMultiplier: 1.1,
  frontierGhostClampMin: 0.9,
  frontierGhostClampMax: 2.5,
  frontierCoverageCos: 0.82,
  frontierCoverageDistanceMultiplier: 1.5,
  frontierOuterBias: 0.15,
  frontierThreshold: 0.55,
  frontierGhostCap: 14,

  gapGhosts: true,
  gapPairDistanceMultiplier: 2.8,
  gapGhostOffsetMultiplier: 0.4,
  gapGhostPerPair: 2
};

const CLICK_DRAG_THRESHOLD_SQ = 25;

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function getHighlightStars(starData, selectedStar, state) {
  if (!selectedStar) return [];

  return starData.filter((star) => {
    if (star.id === selectedStar.id) return false;

    return (
      (state.showRegionHighlights &&
        star.regionID === selectedStar.regionID) ||
      (state.showConstellationHighlights &&
        star.constellationID === selectedStar.constellationID)
    );
  });
}


function applyResolutionScale(canvas, labelRenderer, scale) {
  canvas.width = window.innerWidth * scale;
  canvas.height = window.innerHeight * scale;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.style.imageRendering = 'auto';
  labelRenderer.resize(scale);
}

/* ============================================================================
 * APP
 * ========================================================================== */

async function main() {
  initTheme('amber');

  const canvas = document.getElementById('gl');
  const regl = createREGL({
    canvas,
    attributes: { antialias: true }
  });

  const debug = { log() {}, clear() {}, element: null };

  const camera = setupCamera(canvas);

  const ownership = await loadStarOwnership();
  const TERRITORY_COLORS = buildTerritoryColors(ownership);

  const orbitState = { enabled: false };
  const orbitStep = setupOrbitControl(camera, canvas, orbitState);


  const labelUI = createStarLabelUI(canvas);
  const labelRenderer = createCanvasLabelRenderer(canvas, camera);
  const iconRenderer = createCanvasIconRenderer(canvas, camera);

  applyResolutionScale(canvas, labelRenderer, APP_STATE.resolution);
  iconRenderer.resize(APP_STATE.resolution);

  window.addEventListener('resize', () => {
    applyResolutionScale(canvas, labelRenderer, APP_STATE.resolution);
    iconRenderer.resize(APP_STATE.resolution);
  });

  const {
    drawStars,
    starData,
    updateHighlightColors,
    setVisibilityMask,
    updateStarVisuals,
    markVisualsDirty
  } = await createStarRenderer(regl, camera, debug, {
  getStarIconName: (star) => getIconName(star, ownership),
  getStarColorHex: (star) => getOwnerColorHex(star, ownership)
});

  for (const star of starData) {
    star.ownerColorHex = getOwnerColorHex(star, ownership);
  }

  const ownedStars = getOwnedStars(starData, ownership);

  const drawJumps = await createJumpRenderer(regl, camera, debug);

  debug.log(`Loaded ${starData.length} stars`);

  setVisibilityMask(starData.map((star) => getOwnerId(star, ownership) == null));

  const galaxyGrid = createSlicerGrid(regl, camera, starData, {
    cellSize: 400000,
    verticalLimit: 800000,
    alpha: 0.08,
    enabled: true
  });

  const voronoiController = createVoronoiComputeController({
    getStars: () => starData,
    getSelectedStars: (stars) => getOwnedStars(stars, ownership),
    buildOwnerMap: (selectedStars) => buildOwnerMap(selectedStars, ownership),
    selectionOptions: VORONOI_BUILD_OPTIONS,
    computeOptions: {
      minFaceArea: 1500,
      getBoundsPadding: (selection) =>
        Math.max(8000, selection.localScale * 2.5)
    },
    cacheKey: 'star-ownership-v1',
    cacheSignature: JSON.stringify({
      source: 'starOwnership.json',
      ownership: createOwnershipSignature(ownership),
      options: VORONOI_BUILD_OPTIONS
    }),
    onStateChange: ({ cells, ownerMap }) => {
      window.voronoiCells = cells;
      window.voronoiOwners = ownerMap;
    }
  });


  let selectedStar = null;
  let mouseDownPoint = [0, 0];

  // Active captures — polled every 5s, used for 3D map highlighting
  let activeCaptureEntries = [];
  async function pollActiveCaptures() {
    try {
      const res = await fetch('/api/captures/active');
      if (!res.ok) return;
      const d = await res.json();
      if (!d.ok) return;
      activeCaptureEntries = Object.values(d.active ?? {}).map((entry) => ({
        ...entry,
        _star: starData.find((s) => String(s.id) === String(entry.starId))
      }));
    } catch (_) {}
  }
  setInterval(pollActiveCaptures, 5000);
  pollActiveCaptures();

  function syncStarVisuals() {
    markVisualsDirty();
    updateStarVisuals();

    if (selectedStar) {
      updateHighlightColors(
        selectedStar.id,
        APP_STATE.showRegionHighlights,
        APP_STATE.showConstellationHighlights
      );
    }
  }

  function updateSelection(nextSelectedStar) {
    selectedStar = nextSelectedStar;

    if (selectedStar) {
      labelUI.select(selectedStar);
    } else {
      labelUI.clear();
    }

    rightPanel.setSelectedStar(selectedStar);
    syncStarVisuals();
  }

  const leftPanel = createLeftPanel({
    ownership,
    starData,
    onStarClick: (starId) => {
      const star = starData.find(s => String(s.id) === String(starId));
      if (star?.position) camera.flyTo(star.position);
      if (star) updateSelection(star);
    }
  });

  const rightPanel = createRightPanel({
    state: APP_STATE,
    applyResolutionScale: (scale) => applyResolutionScale(canvas, labelRenderer, scale),
    onStateChange: () => syncStarVisuals(),
    onOwnershipChange: async () => {
      const fresh = await loadStarOwnership();
      ownership.systems = fresh.systems;
      ownership.factions = fresh.factions;
      for (const star of starData) {
        star.ownerColorHex = getOwnerColorHex(star, ownership);
      }
      const newOwned = getOwnedStars(starData, ownership);
      ownedStars.splice(0, ownedStars.length, ...newOwned);
      syncStarVisuals();
    },
    ownership,
    voronoiController,
    starData
  });

  syncStarVisuals();

  canvas.addEventListener('mousedown', (event) => {
    mouseDownPoint = [event.clientX, event.clientY];
  });

  canvas.addEventListener('click', (event) => {
    const dx = event.clientX - mouseDownPoint[0];
    const dy = event.clientY - mouseDownPoint[1];

    if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_SQ) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((((event.clientY - rect.top) / rect.height) * 2) - 1);

    const pickedStar = selectStarAt(ndcX, ndcY, camera, starData);

    updateSelection(pickedStar || null);
  });

  canvas.addEventListener('dblclick', () => {
    const picked = labelUI.getSelected?.();
    if (picked?.position) {
      camera.flyTo(picked.position);
    }
  });

  regl.frame(() => {
    leftPanel.updatePerf(starData.length, regl.stats.drawCalls);

    orbitStep();
    camera.update();

    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    });

    if (APP_STATE.showGalaxyGrid) {
      galaxyGrid.draw();
    }

    if (APP_STATE.showJumps) {
      drawJumps();
    }

    drawStars();

    const voronoiCells = voronoiController.getCells();
    if (
      APP_STATE.showTerritories &&
      VORONOI_VISUAL.enabled &&
      voronoiCells.length
    ) {
      renderVoronoi(
        regl,
        camera,
        voronoiCells,
        voronoiController.getOwnerMap(),
        {
          ownerColors: TERRITORY_COLORS,

          showTerritoryFaces: VORONOI_VISUAL.showTerritoryFaces,
          showBorderFaces: VORONOI_VISUAL.showBorderFaces,
          showBorderLines: VORONOI_VISUAL.showBorderLines,

          territoryFaceAlpha: VORONOI_VISUAL.territoryFaceAlpha,
          borderFaceAlpha: VORONOI_VISUAL.borderFaceAlpha,
          borderLineAlpha: VORONOI_VISUAL.borderLineAlpha,

          stripeOverlay: VORONOI_VISUAL.stripeOverlay,
          stripeSpacing: VORONOI_VISUAL.stripeSpacing,
          stripeWidth: VORONOI_VISUAL.stripeWidth,
          stripeStrength: VORONOI_VISUAL.stripeStrength,

          borderInnerGlow: VORONOI_VISUAL.borderInnerGlow,
          borderGlowSize: VORONOI_VISUAL.borderGlowSize,
          borderGlowIntensity: VORONOI_VISUAL.borderGlowIntensity
        }
      );
    }

    const selectedIsCapturing = selectedStar != null &&
      activeCaptureEntries.some((e) => String(e.starId) === String(selectedStar.id));
    if (selectedIsCapturing) {
      labelUI.clear();
    } else {
      labelUI.update(camera, canvas.width, canvas.height);
    }

    if (APP_STATE.showCanvasLabels) {
      iconRenderer.update(ownedStars, activeCaptureEntries);
      labelRenderer.update(
        APP_STATE.showRegionHighlights || APP_STATE.showConstellationHighlights
          ? getHighlightStars(starData, selectedStar, APP_STATE)
          : []
      );
    } else {
      iconRenderer.update([], activeCaptureEntries);
      labelRenderer.update([]);
    }
  });
}

await main();