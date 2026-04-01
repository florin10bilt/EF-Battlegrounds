import {
  getFactionColorHex,
  getFactionColorRgb
} from './uiTheme.js';

const ICON_NAMES = ['ring', 'dot', 'square', 'diamond'];

export async function loadStarOwnership() {
  const response = await fetch('./data/starOwnership.json', { cache: 'no-store' });
  const text = await response.text();

  if (!text.trim()) {
    return { version: 1, factions: {}, systems: {} };
  }

  const raw = JSON.parse(text);

  return {
    version: raw.version ?? 1,
    factions: raw.factions ?? {},
    systems: raw.systems ?? {}
  };
}

export function getOwnerId(star, ownership) {
  const entry = ownership?.systems?.[String(star?.id)];
  if (!Array.isArray(entry)) return null;

  const ownerId = entry[0];
  return ownerId == null ? null : Number(ownerId);
}

export function getIconId(star, ownership) {
  const entry = ownership?.systems?.[String(star?.id)];
  if (!Array.isArray(entry)) return 0;

  const ownerId = entry[0];
  const explicitIconId = entry[1];

  if (explicitIconId != null) {
    return Number(explicitIconId);
  }

  const faction = ownership?.factions?.[String(ownerId)];
  if (Array.isArray(faction) && faction[1] != null) {
    return Number(faction[1]);
  }

  return 0;
}

export function getIconName(star, ownership) {
  const iconId = getIconId(star, ownership);
  return ICON_NAMES[iconId] ?? 'dot';
}

export function getOwnerColorHex(star, ownership) {
  const ownerId = getOwnerId(star, ownership);
  if (ownerId == null) return null;
  return getFactionColorHex(ownerId, '#ffffff');
}

export function getOwnerColorRgb(star, ownership) {
  const ownerId = getOwnerId(star, ownership);
  if (ownerId == null) return [1, 1, 1];
  return getFactionColorRgb(ownerId, [1, 1, 1]);
}

export function getOwnedStars(stars, ownership) {
  return stars.filter((star) => getOwnerId(star, ownership) != null);
}

export function buildOwnerMap(stars, ownership) {
  const out = {};

  for (const star of stars) {
    const ownerId = getOwnerId(star, ownership);
    if (ownerId != null) {
      out[star.name] = ownerId;
    }
  }

  return out;
}

export function buildTerritoryColors(ownership) {
  const out = {};
  const factionIds = Object.keys(ownership?.factions ?? {});

  for (const ownerId of factionIds) {
    out[ownerId] = getFactionColorRgb(ownerId, [1, 1, 1]);
  }

  return out;
}

export function countConstellationsByFaction(starData, ownership) {
  const factionConsts = new Map();

  for (const star of starData) {
    const id = getOwnerId(star, ownership);
    if (id != null && star.constellationID != null) {
      if (!factionConsts.has(id)) factionConsts.set(id, new Set());
      factionConsts.get(id).add(star.constellationID);
    }
  }

  const counts = new Map();
  for (const [id, s] of factionConsts) counts.set(id, s.size);
  return counts;
}

export function getFactionName(ownerId, ownership) {
  return ownerId === 1 ? 'AMBER' : ownerId === 2 ? 'TEAL' : `FACTION_${ownerId}`;
}

export function countSystemsByFaction(starData, ownership) {
  const counts = new Map();

  for (const star of starData) {
    const id = getOwnerId(star, ownership);
    if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

export function createOwnershipSignature(ownership) {
  return JSON.stringify({
    version: ownership?.version ?? 1,
    factions: ownership?.factions ?? {},
    systems: ownership?.systems ?? {}
  });
}