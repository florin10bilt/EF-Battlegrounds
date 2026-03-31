// Legacy exports (kept for compatibility with uiTools.js etc.)
export const UI_COLOR = '#fff';
export const UI_COLOR_RGBA = [1, 1, 1, 0.9];

export const UI_FONT = 'VT323, monospace';
export const UI_FONT_SIZE_1 = '16px';

// Amber CRT terminal theme (static constants, kept for reference)
export const AMBER = '#ffb000';
export const AMBER_BG = '#000000';
export const AMBER_BORDER = '1px solid #ffb000';
export const AMBER_DIM = '#996600';

/* ============================================================================
 * THEME SYSTEM
 * ========================================================================== */

export const THEMES = {
  amber: { name: 'AMBER', primary: '#ff7300', secondary: '#ffffff', dim: '#996600' },
  white: { name: 'WHITE', primary: '#ffffff', secondary: '#ffb000', dim: '#888888' },
  green: { name: 'GREEN', primary: '#00ff9c', secondary: '#ffffff', dim: '#006644' }
};

export const THEME_NAMES = Object.keys(THEMES);

export function setTheme(name) {
  const t = THEMES[name] ?? THEMES.amber;
  const root = document.documentElement;
  root.style.setProperty('--ui-primary', t.primary);
  root.style.setProperty('--ui-secondary', t.secondary);
  root.style.setProperty('--ui-dim', t.dim);
}

export function initTheme(name = 'amber') {
  setTheme(name);
}

/* ============================================================================
 * FACTION COLORS
 * Centralized here instead of ownership JSON.
 * ========================================================================== */

export const FACTION_COLORS = {
  0: '#1100ff',
  1: '#ff5900',
  2: '#5be6ff'
};

export function getFactionColorHex(ownerId, fallback = '#ffffff') {
  return FACTION_COLORS[Number(ownerId)] ?? fallback;
}

export function hexToRgb01(hex) {
  const clean = String(hex).replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  const value = parseInt(full, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  ];
}

export function getFactionColorRgb(ownerId, fallback = [1, 1, 1]) {
  const hex = FACTION_COLORS[Number(ownerId)];
  return hex ? hexToRgb01(hex) : fallback;
}

export function buildFactionColorMap(ownerIds) {
  const out = {};
  for (const ownerId of ownerIds) {
    out[ownerId] = getFactionColorRgb(ownerId);
  }
  return out;
}