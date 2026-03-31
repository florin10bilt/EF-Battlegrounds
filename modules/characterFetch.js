const WORLD_PACKAGE =
  '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75';

const PLAYER_PROFILE_TYPE = `${WORLD_PACKAGE}::character::PlayerProfile`;
const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const TRIBE_API_BASE = 'https://world-api-utopia.uat.pub.evefrontier.com/v2/tribes';

// 24 hours in seconds
export const FACTION_COOLDOWN_SECONDS = 86400;

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data?.error ? JSON.stringify(data.error) : `${res.status}`);
  return data.result;
}

function findField(obj, fieldName) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findField(item, fieldName);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    if (fieldName in obj) return obj[fieldName];
    for (const value of Object.values(obj)) {
      const found = findField(value, fieldName);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

async function getObject(objectId) {
  const result = await rpc('sui_getObject', [objectId, { showType: true, showContent: true }]);
  return result?.data ?? {};
}

async function getTribeName(tribeId) {
  try {
    const res = await fetch(`${TRIBE_API_BASE}/${tribeId}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const tribe = await res.json();
    return tribe?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches character info from the Sui chain for a given wallet address.
 * Returns { characterId, characterName, tribeId, tribeName, characterAddress, ownerCapId }
 * or throws on error / no character found.
 */
export async function fetchCharacter(walletAddress) {
  const result = await rpc('suix_getOwnedObjects', [
    walletAddress,
    {
      filter: { StructType: PLAYER_PROFILE_TYPE },
      options: { showType: true, showContent: true }
    }
  ]);

  const owned = result?.data ?? [];
  if (!owned.length) throw new Error('NO CHARACTER FOUND ON THIS WALLET');

  const profileId = owned[0]?.data?.objectId;
  const profileObj = await getObject(profileId);
  const characterId = findField(profileObj.content, 'character_id');
  if (!characterId) throw new Error('NO CHARACTER_ID IN PROFILE');

  const characterObj = await getObject(characterId);
  const name = findField(characterObj.content, 'name') ?? null;
  const tribeId = findField(characterObj.content, 'tribe_id') ?? null;
  const characterAddress = findField(characterObj.content, 'character_address') ?? null;
  const ownerCapId = findField(characterObj.content, 'owner_cap_id') ?? null;
  const tribeName = tribeId !== null ? await getTribeName(tribeId) : null;

  return { characterId, characterName: name, tribeId, tribeName, characterAddress, ownerCapId };
}

/**
 * Loads stored character record from server.
 * Returns the record or null if not found.
 */
export async function loadStoredCharacter(walletAddress) {
  try {
    const res = await fetch(`/api/characters/${walletAddress}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.character : null;
  } catch {
    return null;
  }
}

/**
 * Saves character record to server.
 * record: { characterId, characterName, tribeId, tribeName, faction, ... }
 */
export async function saveCharacter(walletAddress, record) {
  try {
    const res = await fetch(`/api/characters/${walletAddress}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    const data = await res.json();
    return data.ok ? data.character : null;
  } catch {
    return null;
  }
}

/**
 * Returns seconds remaining on faction cooldown, or 0 if cooldown has expired / not set.
 */
export function factionCooldownRemaining(factionSetAt) {
  if (!factionSetAt) return 0;
  const elapsed = Math.floor(Date.now() / 1000) - factionSetAt;
  return Math.max(0, FACTION_COOLDOWN_SECONDS - elapsed);
}
