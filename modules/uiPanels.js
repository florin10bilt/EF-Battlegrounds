import {
  UI_FONT,
  THEMES,
  THEME_NAMES,
  setTheme,
  getFactionColorHex
} from './uiTheme.js';
import {
  getOwnerId,
  getIconId,
  getFactionName,
  countSystemsByFaction
} from './starOwnership.js';
import {
  fetchCharacter,
  loadStoredCharacter,
  saveCharacter,
  factionCooldownRemaining
} from './characterFetch.js';

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

const PANEL_WIDTH = '240px';
const FONT_SIZE = '14px';

const DEV_WALLET = '0x36186c31727accc04f45aea50e4dcbec5dee3f4e63616853054992ee5c1c43e6';

const P = 'var(--ui-primary)';
const D = 'var(--ui-dim)';

// Inject custom scrollbar styles once
(function injectScrollbarCSS() {
  const style = document.createElement('style');
  style.textContent = `
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--ui-dim); border-radius: 0; }
    ::-webkit-scrollbar-thumb:hover { background: var(--ui-primary); }
    * { scrollbar-width: thin; scrollbar-color: var(--ui-dim) transparent; }
  `;
  document.head.appendChild(style);
})();

// Shared active captures cache — updated by left panel poll, read by right panel
let _activeCapturesCache = {}; // token → entry
let _refreshSelectedCapture = null; // set by right panel to update capture block live

/* ============================================================================
 * INTERNAL HELPERS
 * ========================================================================== */

function baseText(el) {
  el.style.fontFamily = UI_FONT;
  el.style.fontSize = FONT_SIZE;
  el.style.color = P;
  return el;
}

function getFrontierNow() {
  return new Date();
}

function formatFrontierClock(date = getFrontierNow()) {
  const day = date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const time = date.toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${day} ${time} UTC`;
}

function formatFrontierTag(date = getFrontierNow()) {
  const time = date.toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `[${time}]`;
}

function makeCollapsiblePanel(side) {
  const panel = document.createElement('div');
  const offsetVar = side === 'left' ? '--left-panel-offset' : '--right-panel-offset';

  Object.assign(panel.style, {
    position: 'fixed',
    top: '0',
    bottom: '0',
    [side]: '0',
    width: PANEL_WIDTH,
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: UI_FONT,
    fontSize: FONT_SIZE,
    color: P,
    zIndex: 1000,
    boxSizing: 'border-box',
    userSelect: 'none',
    overflow: 'visible'
  });
  document.body.appendChild(panel);

  const content = document.createElement('div');
  Object.assign(content.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  });
  panel.appendChild(content);

  document.documentElement.style.setProperty(offsetVar, PANEL_WIDTH);

  return { panel, content };
}

function makeModule(title, { startOpen = true } = {}) {
  const root = document.createElement('div');
  Object.assign(root.style, {
    borderBottom: `1px solid ${P}`,
    flexShrink: '0'
  });

  const label = `+--[ ${title.toUpperCase()} ]`;

  const header = document.createElement('div');
  header.textContent = label;
  Object.assign(header.style, {
    padding: '3px 6px',
    color: P,
    fontFamily: UI_FONT,
    fontSize: FONT_SIZE,
    borderBottom: `1px solid ${P}`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    cursor: 'pointer',
    boxSizing: 'border-box'
  });

  const body = document.createElement('div');
  Object.assign(body.style, {
    padding: '4px 8px',
    display: startOpen ? 'block' : 'none',
    color: P,
    fontFamily: UI_FONT,
    fontSize: FONT_SIZE,
    lineHeight: '1.4em'
  });

  let isOpen = startOpen;
  header.addEventListener('click', () => {
    isOpen = !isOpen;
    body.style.display = isOpen ? 'block' : 'none';
    header.textContent = isOpen ? label : `${label} [MIN]`;
  });

  root.appendChild(header);
  root.appendChild(body);
  return { root, body };
}

function colorSquare(hex) {
  return `<span style="color:${hex}">[&#9632;]</span>`;
}

function makeSplitBar(segments, totalWidth = 22) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const el = document.createElement('div');
  el.style.fontFamily = UI_FONT;
  el.style.fontSize = FONT_SIZE;

  if (total === 0) {
    el.textContent = `[${'─'.repeat(totalWidth)}]`;
    return el;
  }

  let html = '[';
  let filled = 0;
  for (const seg of segments) {
    const chars = Math.round((seg.count / total) * totalWidth);
    html += `<span style="color:${seg.color}">${'#'.repeat(chars)}</span>`;
    filled += chars;
  }
  const remaining = totalWidth - filled;
  if (remaining > 0) html += `<span style="color:${D}">${'─'.repeat(remaining)}</span>`;
  html += ']';

  el.innerHTML = html;
  return el;
}

/* ============================================================================
 * LEFT PANEL
 * ========================================================================== */

export function createLeftPanel({ ownership, starData, onStarClick = null, onOwnershipChange = null }) {
  const { content } = makeCollapsiblePanel('left');

  /* ── APP_IDENT ─────────────────────────────────────────────────── */
  const ident = document.createElement('div');
  Object.assign(ident.style, {
    padding: '5px 8px 4px',
    borderBottom: `1px solid ${P}`,
    flexShrink: '0'
  });

  ident.innerHTML = `
    <div style="font-size:18px;letter-spacing:0.06em;font-family:${UI_FONT};color:${P}">FRONTIER FACTIONAL WARFARE</div>
    <div style="color:${D};font-size:${FONT_SIZE};font-family:${UI_FONT}">FFW // TERRITORY MAP SYS</div>
    <div style="color:${D};font-size:12px;font-family:${UI_FONT}">v0.1 ALPHA // HACKATON 2026</div>
  `.trim();

  const clockLine = document.createElement('div');
  Object.assign(clockLine.style, {
    marginTop: '4px',
    color: P,
    fontSize: FONT_SIZE,
    fontFamily: UI_FONT,
    letterSpacing: '0.04em'
  });

  function updateFrontierClock() {
    clockLine.textContent = `${formatFrontierClock()}`;
  }

  updateFrontierClock();
  setInterval(updateFrontierClock, 1000);

  ident.appendChild(clockLine);
  content.appendChild(ident);

  /* ── SYS_MONITOR ───────────────────────────────────────────────── */
  const { root: sysRoot, body: sysBody } = makeModule('SYS_MONITOR');
  const fpsLine = baseText(document.createElement('div'));
  fpsLine.textContent = 'FPS: -- | FRAME: --ms';
  const drawLine = baseText(document.createElement('div'));
  drawLine.textContent = 'DRAWS: -- | STARS: --';
  const memLine = baseText(document.createElement('div'));
  memLine.textContent = 'MEM: --';
  sysBody.appendChild(fpsLine);
  sysBody.appendChild(drawLine);
  sysBody.appendChild(memLine);
  content.appendChild(sysRoot);

  /* ── TERRITORY_CTRL ────────────────────────────────────────────── */
  const { root: terrRoot, body: terrBody } = makeModule('TERRITORY_CTRL');

  const factionCounts = countSystemsByFaction(starData, ownership);
  const totalOwned = [...factionCounts.values()].reduce((s, n) => s + n, 0);

  const splitSegments = [];

  for (const [ownerId, sysCount] of factionCounts) {
    const hex = getFactionColorHex(ownerId, '#ffffff');
    const name = getFactionName(ownerId, ownership);
    const pct = totalOwned > 0 ? Math.round((sysCount / totalOwned) * 100) : 0;

    const row = document.createElement('div');
    row.style.fontFamily = UI_FONT;
    row.style.fontSize = FONT_SIZE;
    row.style.lineHeight = '1.5em';
    row.innerHTML = `${colorSquare(hex)} <span style="color:${P}">${name}</span> <span style="color:${D}">${sysCount} [${pct}%]</span>`;
    terrBody.appendChild(row);

    splitSegments.push({ color: hex, count: sysCount });
  }

  const barSpacer = document.createElement('div');
  barSpacer.style.height = '4px';
  terrBody.appendChild(barSpacer);
  terrBody.appendChild(makeSplitBar(splitSegments));
  content.appendChild(terrRoot);

  /* ── ACTIVE_CAPTURES ───────────────────────────────────────────── */
  const { root: captRoot, body: captBody } = makeModule('ACTIVE_CAPTURES');
  Object.assign(captRoot.style, { flexShrink: '0' });

  const captEmpty = baseText(document.createElement('div'));
  captEmpty.style.color = D;
  captEmpty.textContent = 'NO ACTIVE CAPTURES';
  captBody.appendChild(captEmpty);

  const _captureCardMap = new Map(); // token → { cardEl, timerEl, barEl, endsAt, contested }

  function _applyCardContestStyle(cardEl, contested) {
    const bg = contested ? '#cc0000' : P;
    const fg = '#000';
    cardEl.style.background = bg;
    cardEl.querySelectorAll('div').forEach(d => { d.style.color = fg; });
  }

  function renderActiveCaptureCards(activeObj) {
    _captureCardMap.forEach((_, tok) => {
      if (!activeObj[tok]) {
        const info = _captureCardMap.get(tok);
        info.cardEl.remove();
        _captureCardMap.delete(tok);
      }
    });

    for (const [tok, entry] of Object.entries(activeObj)) {
      const contested = !!entry.contested;
      if (_captureCardMap.has(tok)) {
        // Update contest state if it changed
        const info = _captureCardMap.get(tok);
        if (info.contested !== contested) {
          info.contested = contested;
          _applyCardContestStyle(info.cardEl, contested);
        }
        info.endsAt = entry.endsAt; // keep timer in sync after contest extension
        continue;
      }
      const card = document.createElement('div');
      Object.assign(card.style, {
        color: '#000',
        padding: '3px 6px',
        marginBottom: '4px',
        fontFamily: UI_FONT,
        fontSize: FONT_SIZE,
        lineHeight: '1.5em'
      });
      const starName = (entry.starName ?? entry.starId ?? '?').toUpperCase();
      const timerEl = document.createElement('div');
      timerEl.style.fontFamily = UI_FONT;
      timerEl.style.fontSize = '18px';
      timerEl.style.color = '#000';
      const barWrap = document.createElement('div');
      Object.assign(barWrap.style, { height: '4px', background: 'rgba(0,0,0,0.3)', marginTop: '3px' });
      const barFill = document.createElement('div');
      Object.assign(barFill.style, { height: '100%', background: '#000', width: '0%', transition: 'width 1s linear' });
      barWrap.appendChild(barFill);
      const nameEl = document.createElement('div');
      Object.assign(nameEl.style, {
        fontSize: '15px', fontWeight: 'bold', cursor: onStarClick ? 'pointer' : 'default'
      });
      nameEl.textContent = starName;
      if (onStarClick) nameEl.addEventListener('click', () => onStarClick(entry.starId));
      const byEl = document.createElement('div');
      byEl.style.cssText = 'color:rgba(0,0,0,0.7);font-size:13px';
      byEl.textContent = `PLAYER: ${(entry.actorName ?? entry.actor ?? '?').toUpperCase()}`;
      card.appendChild(nameEl);
      card.appendChild(byEl);
      card.appendChild(timerEl);
      card.appendChild(barWrap);
      _applyCardContestStyle(card, contested);
      captBody.appendChild(card);
      _captureCardMap.set(tok, { cardEl: card, timerEl, barEl: barFill, endsAt: entry.endsAt, startedAt: entry.startedAt ?? (entry.endsAt - 1200), contested });
    }

    captEmpty.style.display = Object.keys(activeObj).length ? 'none' : 'block';
  }

  function tickCaptureCards() {
    const now = Date.now() / 1000;
    for (const [, info] of _captureCardMap) {
      const rem = info.endsAt - now;
      if (rem <= 0) {
        info.timerEl.textContent = '00:00 — COMPLETE';
      } else {
        const m = Math.floor(rem / 60).toString().padStart(2, '0');
        const s = Math.floor(rem % 60).toString().padStart(2, '0');
        info.timerEl.textContent = `${m}:${s} REMAINING`;
        const duration = info.endsAt - info.startedAt;
        const pct = ((duration - rem) / duration) * 100;
        info.barEl.style.width = `${pct}%`;
      }
    }
  }

  setInterval(tickCaptureCards, 1000);
  content.appendChild(captRoot);

  /* ── EVENT_LOG ─────────────────────────────────────────────────── */
  const { root: logRoot, body: logBody } = makeModule('EVENT_LOG', { startOpen: false });
  Object.assign(logRoot.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column'
  });
  Object.assign(logBody.style, {
    flex: '1',
    overflowY: 'auto',
    minHeight: '0',
    padding: '4px 8px'
  });

  const flavorEvents = [
    `${formatFrontierTag()} SYS  NODE LINK ESTABLISHED`,
    `${formatFrontierTag()} SYS  TACTICAL FEED ONLINE`,
    `${formatFrontierTag()} SYS  SCANNING STAR SYSTEMS...`
  ];

  for (const e of flavorEvents) {
    const line = baseText(document.createElement('div'));
    line.style.borderBottom = `1px solid ${D}`;
    line.style.padding = '1px 0';
    line.style.color = D;
    line.textContent = e;
    logBody.appendChild(line);
  }
  content.appendChild(logRoot);

  /* ── PERF SAMPLING ─────────────────────────────────────────────── */
  let _lastUpdate = performance.now();
  let _frameCount = 0;

  function updatePerf(starCount, drawCalls) {
    _frameCount++;
    const now = performance.now();
    if (now - _lastUpdate < 250) return;
    const elapsed = (now - _lastUpdate) / 1000;
    const fps = Math.round(_frameCount / elapsed);
    const frameMs = (elapsed * 1000 / Math.max(_frameCount, 1)).toFixed(1);
    const mem = window.performance?.memory?.usedJSHeapSize
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}MB`
      : 'N/A';
    _frameCount = 0;
    _lastUpdate = now;
    fpsLine.textContent = `FPS: ${fps} | FRAME: ${frameMs}ms`;
    drawLine.textContent = `DRAWS: ${drawCalls} | STARS: ${starCount}`;
    memLine.textContent = `MEM: ${mem}`;
  }

  function addEvent(entry) {
    const line = baseText(document.createElement('div'));
    line.style.borderBottom = `1px solid ${D}`;
    line.style.padding = '1px 0';
    line.textContent = `${formatFrontierTag()} ${entry}`;
    logBody.prepend(line);
    while (logBody.children.length > 100) logBody.removeChild(logBody.lastChild);
  }

  /* ── EVENT FEED POLLING ────────────────────────────────────────── */
  let _lastEventTs = 0;

  function buildEventLine(e, onStarClickFn) {
    const t = new Date(e.ts * 1000).toLocaleTimeString('en-GB', { hour12: false });
    const starId = e.starId;
    const starName = (e.starName ?? starId ?? '?').toUpperCase();
    const actor = (e.actorName ?? e.actor ?? '?').toUpperCase();

    const line = baseText(document.createElement('div'));
    line.style.borderBottom = `1px solid ${D}`;
    line.style.padding = '2px 0';
    line.style.lineHeight = '1.4em';

    // Build clickable star span (no underline)
    const starSpan = document.createElement('span');
    starSpan.textContent = starName;
    Object.assign(starSpan.style, {
      fontSize: '15px',
      cursor: starId && onStarClickFn ? 'pointer' : 'default',
      color: P
    });
    if (starId && onStarClickFn) {
      starSpan.addEventListener('click', () => onStarClickFn(starId));
    }

    // Prefix text
    let prefix = `[${t}] `;
    let suffix = '';
    if (e.type === 'capture_start') {
      prefix = `[${t}] CAPTURING: `;
      // suffix rendered as separate prominent span below
    } else if (e.type === 'capture_cancel') {
      prefix = `[${t}] CANCELLED: `;
      suffix = `  ${actor}`;
    } else if (e.type === 'capture') {
      prefix = `[${t}] CAPTURED: `;
      suffix = `  → ${e.faction === 1 ? 'AMBER' : 'TEAL'}  ${actor}`;
    } else if (e.type === 'anchor') {
      prefix = `[${t}] ANCHORED: `;
    } else {
      prefix = `[${t}] ${e.type.toUpperCase()}: `;
    }

    line.appendChild(document.createTextNode(prefix));
    line.appendChild(starSpan);
    if (e.type === 'capture_start') {
      const playerSpan = document.createElement('div');
      Object.assign(playerSpan.style, { fontSize: '13px', color: P, paddingLeft: '4px' });
      playerSpan.textContent = `PLAYER: ${actor}`;
      line.appendChild(playerSpan);
    } else if (suffix) {
      line.appendChild(document.createTextNode(suffix));
    }
    return line;
  }

  async function pollEvents() {
    try {
      const res = await fetch(`/api/events?since=${_lastEventTs}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.events?.length) return;
      let ownershipDirty = false;
      for (const e of [...data.events].reverse()) {
        const line = buildEventLine(e, onStarClick);
        logBody.prepend(line);
        if (e.ts > _lastEventTs) _lastEventTs = e.ts;
        if (e.type === 'capture') ownershipDirty = true;
      }
      if (ownershipDirty && onOwnershipChange) await onOwnershipChange();
      while (logBody.children.length > 100) logBody.removeChild(logBody.lastChild);
    } catch (_) { /* network hiccup, retry next interval */ }
  }

  async function pollActiveCaptures() {
    try {
      const res = await fetch('/api/captures/active');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;
      _activeCapturesCache = data.active ?? {};
      renderActiveCaptureCards(_activeCapturesCache);
      // Refresh live capture block in selected system panel
      _refreshSelectedCapture?.();
    } catch (_) { /* network hiccup */ }
  }

  setInterval(pollEvents, 5000);
  setInterval(pollActiveCaptures, 5000);
  pollEvents();
  pollActiveCaptures();

  return { updatePerf, addEvent };
}

/* ============================================================================
 * RIGHT PANEL
 * ========================================================================== */

export function createRightPanel({
  state,
  applyResolutionScale,
  onStateChange,
  onOwnershipChange = null,
  ownership,
  voronoiController = null,
  starData = []
}) {
  const { content } = makeCollapsiblePanel('right');

  /* ── AUTH_NODE ─────────────────────────────────────────────────── */
  const { root: authRoot, body: authBody } = makeModule('AUTH_NODE');

  Object.assign(authBody.style, {
    overflow: 'hidden',
    padding: '4px 6px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '0'
  });

  // ── Disconnected view — button fills the entire module body
  const disconnectedView = document.createElement('div');
  Object.assign(disconnectedView.style, {
    display: 'flex',
    height: '100%'
  });

  const walletBtn = document.createElement('button');
  Object.assign(walletBtn.style, {
    display: 'block',
    width: '100%',
    background: P,
    color: '#000',
    border: `2px solid ${P}`,
    fontFamily: UI_FONT,
    fontSize: '14px',
    padding: '18px 0',
    cursor: 'pointer',
    letterSpacing: '0.1em',
    fontWeight: 'bold',
    boxSizing: 'border-box',
    textTransform: 'uppercase'
  });
  walletBtn.textContent = '[ CONNECT WALLET ]';

  disconnectedView.appendChild(walletBtn);

  // ── Connected view
  const connectedView = document.createElement('div');
  Object.assign(connectedView.style, {
    display: 'none',
    flexDirection: 'column',
    gap: '4px'
  });

  // Avatar row: avatar + info + action buttons stacked on the right
  const profileRow = document.createElement('div');
  Object.assign(profileRow.style, {
    display: 'flex',
    gap: '6px',
    alignItems: 'stretch'
  });

  const avatar = document.createElement('img');
  avatar.src = './assets/Character_profile.jpg';
  Object.assign(avatar.style, {
    width: '53px',
    height: '53px',
    objectFit: 'cover',
    border: `1px solid ${P}`,
    flexShrink: '0',
    filter: 'grayscale(30%)'
  });

  const charInfo = document.createElement('div');
  Object.assign(charInfo.style, {
    flex: '1',
    minWidth: '0',
    fontFamily: UI_FONT,
    fontSize: '13px',
    lineHeight: '1.45em',
    color: P,
    overflow: 'hidden'
  });
  charInfo.innerHTML = `<span style="color:${D}">...</span>`;

  // Action buttons stacked vertically on the right of the avatar block
  const actionCol = document.createElement('div');
  Object.assign(actionCol.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flexShrink: '0',
    justifyContent: 'flex-start'
  });

  function makeSmallBtn(label) {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      background: 'transparent',
      color: D,
      border: `1px solid ${D}`,
      fontFamily: UI_FONT,
      fontSize: '11px',
      padding: '2px 5px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      letterSpacing: '0.04em'
    });
    btn.textContent = label;
    return btn;
  }

  const changeFactionBtn = makeSmallBtn('[FACTION]');
  const disconnectBtn = makeSmallBtn('[LOGOUT]');

  actionCol.appendChild(changeFactionBtn);
  actionCol.appendChild(disconnectBtn);

  profileRow.appendChild(avatar);
  profileRow.appendChild(charInfo);
  profileRow.appendChild(actionCol);

  const walletLabel = document.createElement('div'); // kept for address storage only, not shown

  connectedView.appendChild(profileRow);

  // Hidden status line — shown only on connect errors, overlaid below button
  const statusLine = document.createElement('div');
  Object.assign(statusLine.style, {
    position: 'absolute',
    bottom: '2px',
    left: '8px',
    right: '8px',
    fontFamily: UI_FONT,
    fontSize: '11px',
    color: D,
    pointerEvents: 'none',
    display: 'none'
  });
  authBody.style.position = 'relative';
  authBody.appendChild(disconnectedView);
  authBody.appendChild(connectedView);
  authBody.appendChild(statusLine);
  content.appendChild(authRoot);

  // ── Faction selection popup
  const factionPopup = document.createElement('div');
  Object.assign(factionPopup.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.85)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    fontFamily: UI_FONT
  });

  factionPopup.innerHTML = `
    <div style="border:1px solid ${P};padding:24px 28px;min-width:320px;max-width:420px;background:#000;color:${P};font-family:${UI_FONT}">
      <div style="font-size:18px;letter-spacing:0.08em;margin-bottom:4px">+--[ FACTION_ENLISTMENT ]</div>
      <div style="font-size:13px;color:${D};margin-bottom:16px">SELECT YOUR ALLEGIANCE. LOCKED FOR 24H AFTER CHOOSING.</div>
      <div id="fp-cooldown-msg" style="font-size:13px;color:${D};margin-bottom:16px;display:none"></div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <button id="fp-f1" style="flex:1;padding:8px;background:transparent;border:1px solid #ff5900;color:#ff5900;font-family:${UI_FONT};font-size:15px;cursor:pointer;letter-spacing:0.05em">[ AMBER ]</button>
        <button id="fp-f2" style="flex:1;padding:8px;background:transparent;border:1px solid #5be6ff;color:#5be6ff;font-family:${UI_FONT};font-size:15px;cursor:pointer;letter-spacing:0.05em">[ TEAL ]</button>
      </div>
      <div id="fp-status" style="font-size:12px;color:${D};min-height:16px"></div>
    </div>
  `.trim();
  document.body.appendChild(factionPopup);

  let _factionResolve = null;

  function showFactionPopup(currentFaction, factionSetAt) {
    const cooldown = factionCooldownRemaining(factionSetAt);
    const cooldownMsg = factionPopup.querySelector('#fp-cooldown-msg');
    const statusMsg = factionPopup.querySelector('#fp-status');
    const f1Btn = factionPopup.querySelector('#fp-f1');
    const f2Btn = factionPopup.querySelector('#fp-f2');

    if (cooldown > 0) {
      const h = Math.floor(cooldown / 3600);
      const m = Math.floor((cooldown % 3600) / 60);
      cooldownMsg.textContent = `FACTION LOCKED: ${h}H ${m}M REMAINING`;
      cooldownMsg.style.display = 'block';
      f1Btn.disabled = true;
      f2Btn.disabled = true;
      f1Btn.style.opacity = '0.4';
      f2Btn.style.opacity = '0.4';
    } else {
      cooldownMsg.style.display = 'none';
      f1Btn.disabled = false;
      f2Btn.disabled = false;
      f1Btn.style.opacity = currentFaction === 1 ? '1' : '0.6';
      f2Btn.style.opacity = currentFaction === 2 ? '1' : '0.6';
      f1Btn.style.background = currentFaction === 1 ? '#ff5900' : 'transparent';
      f1Btn.style.color = currentFaction === 1 ? '#000' : '#ff5900';
      f2Btn.style.background = currentFaction === 2 ? '#5be6ff' : 'transparent';
      f2Btn.style.color = currentFaction === 2 ? '#000' : '#5be6ff';
    }

    statusMsg.textContent = currentFaction
      ? `CURRENTLY ENLISTED: ${currentFaction === 1 ? 'AMBER' : 'TEAL'}`
      : 'NO FACTION — CHOOSE TO PARTICIPATE';

    factionPopup.style.display = 'flex';

    return new Promise((resolve) => { _factionResolve = resolve; });
  }

  factionPopup.querySelector('#fp-f1').addEventListener('click', () => {
    if (_factionResolve) { _factionResolve(1); _factionResolve = null; }
    factionPopup.style.display = 'none';
  });
  factionPopup.querySelector('#fp-f2').addEventListener('click', () => {
    if (_factionResolve) { _factionResolve(2); _factionResolve = null; }
    factionPopup.style.display = 'none';
  });

  // ── Internal state
  let _walletAddress = null;
  let _activeWallet = null;
  let _charRecord = null;

  function renderCharInfo(record) {
    const factionHex = record?.faction ? getFactionColorHex(record.faction, D) : D;
    const factionLabel = record?.faction ? (record.faction === 1 ? 'AMBER' : 'TEAL') : 'NO FACTION';
    const factionSquare = `<span style="color:${factionHex}">&#9632;</span>`;
    charInfo.innerHTML = `
      <div style="color:${P};font-size:14px;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(record?.characterName ?? '???').toUpperCase()}</div>
      <div style="color:${D};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(record?.tribeName ?? 'NO TRIBE').toUpperCase()}</div>
      <div style="color:${P};font-size:16px;font-weight:bold;letter-spacing:0.05em">${factionSquare} ${factionLabel}</div>
    `.trim();
  }

  function showError(msg) {
    statusLine.textContent = msg;
    statusLine.style.display = 'block';
    walletBtn.textContent = '[ CONNECT WALLET ]';
    setTimeout(() => { statusLine.style.display = 'none'; }, 3000);
  }

  async function connectWallet() {
    try {
      const { getWallets } = await import('https://esm.sh/@wallet-standard/app@1.0.1');
      const registry = getWallets();
      const wallets = registry.get();
      const wallet = wallets[0];
      if (!wallet) { showError('NO WALLET FOUND'); return; }
      const connectFeature = wallet.features['standard:connect'];
      if (!connectFeature) { showError('WALLET INCOMPATIBLE'); return; }
      walletBtn.textContent = '[ CONNECTING... ]';
      const result = await connectFeature.connect();
      const account = result.accounts?.[0] ?? wallet.accounts?.[0];
      if (!account?.address) { showError('CONNECTION REJECTED'); return; }
      _activeWallet = wallet;
      await afterConnect(account.address);
    } catch (err) {
      console.warn('Wallet connect failed:', err);
      showError('CONNECT ERROR');
    }
  }

  async function afterConnect(address) {
    _walletAddress = address;

    // Show connected shell immediately
    disconnectedView.style.display = 'none';
    connectedView.style.display = 'flex';
    walletLabel.textContent = `${address.slice(0, 8)}...${address.slice(-6)}`;
    charInfo.innerHTML = `<span style="color:${D}">LOADING CHARACTER...</span>`;

    // Enable faction tab
    factionTab.disabled = false;
    factionTab.style.opacity = '1';
    factionTab.style.cursor = 'pointer';
    factionTab.style.color = P;

    // Fetch chain data + stored record in parallel
    const [chainChar, storedRecord] = await Promise.allSettled([
      fetchCharacter(address),
      loadStoredCharacter(address)
    ]);

    const chain = chainChar.status === 'fulfilled' ? chainChar.value : null;
    const stored = storedRecord.status === 'fulfilled' ? storedRecord.value : null;

    // Merge: stored overrides chain for faction, chain is authoritative for name/tribe
    _charRecord = {
      ...(chain ?? {}),
      faction: stored?.faction ?? null,
      factionSetAt: stored?.factionSetAt ?? null
    };

    // Prompt faction selection if:
    //  - first login ever (no stored record), OR
    //  - no faction set yet
    const needsFactionPrompt = !stored || _charRecord.faction == null;
    if (needsFactionPrompt) {
      const chosen = await showFactionPopup(_charRecord.faction, _charRecord.factionSetAt);
      _charRecord.faction = chosen;
      _charRecord = await saveCharacter(address, _charRecord) ?? _charRecord;
    }

    renderCharInfo(_charRecord);
  }

  async function disconnectWallet() {
    try {
      const disconnectFeature = _activeWallet?.features?.['standard:disconnect'];
      if (disconnectFeature) await disconnectFeature.disconnect();
    } catch (_) { /* ignore */ }
    _activeWallet = null;
    _walletAddress = null;
    _charRecord = null;
    disconnectedView.style.display = 'flex';
    connectedView.style.display = 'none';
    walletBtn.textContent = '[ CONNECT WALLET ]';
    factionTab.disabled = true;
    factionTab.style.opacity = '0.4';
    factionTab.style.cursor = 'not-allowed';
    factionTab.style.color = D;
    if (factionMessages.style.display !== 'none') setActiveTab(true);
  }

  // ── Change-faction confirmation overlay
  const confirmOverlay = document.createElement('div');
  Object.assign(confirmOverlay.style, {
    position: 'fixed',
    top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.85)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1999,
    fontFamily: UI_FONT
  });
  confirmOverlay.innerHTML = `
    <div style="border:1px solid ${P};padding:20px 24px;min-width:280px;background:#000;color:${P};font-family:${UI_FONT}">
      <div style="font-size:16px;letter-spacing:0.08em;margin-bottom:8px">ARE YOU SURE?</div>
      <div style="font-size:13px;color:${D};margin-bottom:16px">FACTION CHANGE LOCKS FOR 24H AFTER CHOOSING.</div>
      <div style="display:flex;gap:8px">
        <button id="confirm-yes" style="flex:1;padding:6px;background:transparent;border:1px solid ${P};color:${P};font-family:${UI_FONT};font-size:14px;cursor:pointer">[ CONFIRM ]</button>
        <button id="confirm-no" style="flex:1;padding:6px;background:transparent;border:1px solid ${D};color:${D};font-family:${UI_FONT};font-size:14px;cursor:pointer">[ CANCEL ]</button>
      </div>
    </div>
  `.trim();
  document.body.appendChild(confirmOverlay);

  confirmOverlay.querySelector('#confirm-no').addEventListener('click', () => {
    confirmOverlay.style.display = 'none';
  });
  confirmOverlay.querySelector('#confirm-yes').addEventListener('click', async () => {
    confirmOverlay.style.display = 'none';
    const chosen = await showFactionPopup(_charRecord?.faction ?? null, _charRecord?.factionSetAt ?? null);
    if (chosen && _charRecord) {
      _charRecord.faction = chosen;
      _charRecord = await saveCharacter(_walletAddress, _charRecord) ?? _charRecord;
      renderCharInfo(_charRecord);
    }
  });

  changeFactionBtn.addEventListener('click', () => {
    confirmOverlay.style.display = 'flex';
  });

  walletBtn.addEventListener('click', connectWallet);
  disconnectBtn.addEventListener('click', disconnectWallet);

  // Shared state: currently selected star (for ANCHOR_TURRET [USE] button)
  let _selectedStarForAnchor = null;

  /* ── MAP_CONFIG ────────────────────────────────────────────────── */
  const { root: cfgRoot, body: cfgBody } = makeModule('MAP_CONFIG', { startOpen: false });
  cfgBody.style.padding = '4px 8px';

  let _currentTheme = 'amber';
  const resolutionOptions = [1, 1.5, 2, 2.5, 3];

  function renderConfig() {
    const resRow = resolutionOptions
      .map((v) => {
        const active = state.resolution === v;
        return `<span data-resolution="${v}" style="cursor:pointer;color:${active ? P : D}">${active ? `[${v}]` : v}</span>`;
      })
      .join(' / ');

    const themeRow = THEME_NAMES
      .map((name) => {
        const active = _currentTheme === name;
        const label = THEMES[name].name;
        return `<span data-theme="${name}" style="cursor:pointer;color:${active ? P : D}">${active ? `[${label}]` : label}</span>`;
      })
      .join(' / ');

    cfgBody.innerHTML = `
<div style="margin-bottom:3px;font-family:${UI_FONT};font-size:${FONT_SIZE};color:${D}">RESOLUTION:</div>
<div style="margin-bottom:6px;font-family:${UI_FONT};font-size:${FONT_SIZE}">${resRow}</div>
<div style="margin-bottom:3px;font-family:${UI_FONT};font-size:${FONT_SIZE};color:${D}">THEME:</div>
<div style="margin-bottom:6px;font-family:${UI_FONT};font-size:${FONT_SIZE}">${themeRow}</div>
<div style="font-family:${UI_FONT};font-size:${FONT_SIZE}">REGION HI:     <span data-toggle="showRegionHighlights" style="cursor:pointer;color:${state.showRegionHighlights ? P : D}">[${state.showRegionHighlights ? 'X' : '_'}]</span></div>
<div style="font-family:${UI_FONT};font-size:${FONT_SIZE}">CONSTELLATION: <span data-toggle="showConstellationHighlights" style="cursor:pointer;color:${state.showConstellationHighlights ? P : D}">[${state.showConstellationHighlights ? 'X' : '_'}]</span></div>
<div style="font-family:${UI_FONT};font-size:${FONT_SIZE}">JUMPS:         <span data-toggle="showJumps" style="cursor:pointer;color:${state.showJumps ? P : D}">[${state.showJumps ? 'X' : '_'}]</span></div>
<div style="font-family:${UI_FONT};font-size:${FONT_SIZE}">TERRITORIES:   <span data-toggle="showTerritories" style="cursor:pointer;color:${state.showTerritories ? P : D}">[${state.showTerritories ? 'X' : '_'}]</span></div>
    `.trim();
  }

  cfgBody.addEventListener('click', (e) => {
    const res = e.target.getAttribute('data-resolution');
    const key = e.target.getAttribute('data-toggle');
    const theme = e.target.getAttribute('data-theme');

    if (res) {
      state.resolution = parseFloat(res);
      applyResolutionScale(state.resolution);
      renderConfig();
      onStateChange();
    } else if (key) {
      state[key] = !state[key];
      renderConfig();
      onStateChange();
    } else if (theme) {
      _currentTheme = theme;
      setTheme(theme);
      renderConfig();
    }
  });

  renderConfig();
  content.appendChild(cfgRoot);

  /* ── AUTHORIZE_TURRETS ─────────────────────────────────────────── */
  const { root: anchorRoot, body: anchorBody } = makeModule('AUTHORIZE_TURRETS', { startOpen: false });

  const _TURRET_WORLD_PACKAGE = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c';
  const _SHIP_TO_PACKAGE = {
    CORVETTES:    '0x3ab018094afec13b04058124daeb323f8a767aa7423751386dd1c113a07dbb54',
    FRIGATES:     '0x49a9bf1dbfe58c6b58616d78bed850d61b66bf139dcb6ed4dda6e0bcd1f301e5',
    UNRESTRICTED: '0xe7a80b8ab960253625d74aa5812fdb9d712e05655d0241f5e279f57ec817a30e',
  };

  // Turret cache for SELECTED_SYSTEM lookup: starId (string) → turret entry
  let _turretsByStarId = new Map();

  async function refreshTurretCache() {
    try {
      const res = await fetch('/api/turrets');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;
      _turretsByStarId = new Map();
      for (const t of data.turrets) {
        _turretsByStarId.set(String(t.starId), t);
      }
    } catch (_) { /* network hiccup */ }
  }

  function makeTextInput(placeholder) {
    const inp = document.createElement('input');
    Object.assign(inp.style, {
      background: 'transparent', color: P, border: `1px solid ${D}`,
      fontFamily: UI_FONT, fontSize: FONT_SIZE, padding: '2px 4px',
      outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: '4px'
    });
    inp.placeholder = placeholder;
    inp.setAttribute('spellcheck', 'false');
    return inp;
  }

  // Star row: input + [USE] button
  const anchorStarRow = document.createElement('div');
  Object.assign(anchorStarRow.style, { display: 'flex', gap: '4px', marginBottom: '4px' });
  const anchorStarInput = document.createElement('input');
  Object.assign(anchorStarInput.style, {
    flex: '1', background: 'transparent', color: P,
    border: `1px solid ${D}`, fontFamily: UI_FONT, fontSize: FONT_SIZE,
    padding: '2px 4px', outline: 'none', minWidth: '0', boxSizing: 'border-box'
  });
  anchorStarInput.placeholder = 'STAR NAME OR ID';
  anchorStarInput.setAttribute('spellcheck', 'false');
  const useStarBtn = document.createElement('button');
  Object.assign(useStarBtn.style, {
    background: 'transparent', color: D, border: `1px solid ${D}`,
    fontFamily: UI_FONT, fontSize: '11px', padding: '1px 5px',
    cursor: 'pointer', flexShrink: '0', whiteSpace: 'nowrap'
  });
  useStarBtn.textContent = '[USE]';
  useStarBtn.title = 'Use currently selected star';
  anchorStarRow.appendChild(anchorStarInput);
  anchorStarRow.appendChild(useStarBtn);
  anchorBody.appendChild(anchorStarRow);

  const anchorLPointInput = makeTextInput('L-POINT  (e.g. L134-45)');
  // Ship restriction — button group
  const shipOptions = ['CORVETTES', 'FRIGATES', 'UNRESTRICTED'];
  let _selectedShip = 'UNRESTRICTED';

  const anchorShipRow = document.createElement('div');
  Object.assign(anchorShipRow.style, {
    display: 'flex', gap: '3px', marginBottom: '4px', flexWrap: 'wrap'
  });
  const shipLbl = baseText(document.createElement('div'));
  shipLbl.style.color = D;
  shipLbl.style.fontSize = '11px';
  shipLbl.style.marginBottom = '2px';
  shipLbl.textContent = 'SHIP RESTRICTION:';
  anchorBody.appendChild(shipLbl);

  const shipBtns = shipOptions.map((opt) => {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      background: 'transparent', color: D, border: `1px solid ${D}`,
      fontFamily: UI_FONT, fontSize: '11px', padding: '1px 5px',
      cursor: 'pointer', flex: '1'
    });
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      _selectedShip = opt;
      shipBtns.forEach(b => {
        const active = b.textContent === _selectedShip;
        b.style.background = active ? P : 'transparent';
        b.style.color = active ? '#000' : D;
        b.style.border = `1px solid ${active ? P : D}`;
      });
    });
    anchorShipRow.appendChild(btn);
    return btn;
  });
  // Set default selection
  shipBtns[0].click();
  anchorBody.appendChild(anchorShipRow);
  const anchorAssemblyInput = makeTextInput('TURRET ASSEMBLY ID  (0x...)');
  anchorBody.appendChild(anchorLPointInput);
  anchorBody.appendChild(anchorAssemblyInput);

  const anchorRegisterBtn = document.createElement('button');
  Object.assign(anchorRegisterBtn.style, {
    background: P, color: '#000', border: 'none',
    fontFamily: UI_FONT, fontSize: FONT_SIZE,
    padding: '4px 0', cursor: 'pointer', width: '100%',
    letterSpacing: '0.05em', marginBottom: '6px'
  });
  anchorRegisterBtn.textContent = '[ AUTHORIZE TURRET ]';
  anchorBody.appendChild(anchorRegisterBtn);

  const anchorStatus = baseText(document.createElement('div'));
  anchorStatus.style.color = D;
  anchorStatus.style.fontSize = '12px';
  anchorBody.appendChild(anchorStatus);

  // Copy link button — hidden until first registration
  const anchorCopyBtn = document.createElement('button');
  Object.assign(anchorCopyBtn.style, {
    display: 'none', background: 'transparent', color: P, border: `1px solid ${P}`,
    fontFamily: UI_FONT, fontSize: FONT_SIZE, padding: '3px 0',
    cursor: 'pointer', width: '100%', letterSpacing: '0.05em', marginTop: '4px'
  });
  anchorCopyBtn.textContent = '[ COPY LINK ]';
  anchorBody.appendChild(anchorCopyBtn);

  let _lastAnchorUrl = '';

  anchorCopyBtn.addEventListener('click', () => {
    if (!_lastAnchorUrl) return;
    navigator.clipboard.writeText(_lastAnchorUrl).then(() => {
      anchorCopyBtn.textContent = '[ COPIED! ]';
      setTimeout(() => { anchorCopyBtn.textContent = '[ COPY LINK ]'; }, 1500);
    });
  });

  function applyShipLock(star) {
    const iconId = star ? getIconId(star, ownership) : null;
    // 0 = ring → CORVETTES only; 2 = square → UNRESTRICTED only; else all enabled
    const lockedIndex = iconId === 0 ? 0 : iconId === 2 ? 2 : null;
    shipBtns.forEach((btn, i) => {
      const locked = lockedIndex !== null && i !== lockedIndex;
      btn.disabled = locked;
      btn.style.opacity = locked ? '0.3' : '1';
      btn.style.cursor = locked ? 'not-allowed' : 'pointer';
    });
    if (lockedIndex !== null) shipBtns[lockedIndex].click();
  }

  useStarBtn.addEventListener('click', () => {
    if (_selectedStarForAnchor) {
      anchorStarInput.value = _selectedStarForAnchor.name;
      anchorStarInput.title = _selectedStarForAnchor.name;
      applyShipLock(_selectedStarForAnchor);
    }
  });

  anchorRegisterBtn.addEventListener('click', async () => {
    const rawStar = anchorStarInput.value.trim();
    if (!rawStar) {
      anchorStatus.style.color = 'red';
      anchorStatus.textContent = '! ENTER STAR NAME OR ID';
      return;
    }
    const assemblyId = anchorAssemblyInput.value.trim();
    if (!assemblyId) {
      anchorStatus.style.color = 'red';
      anchorStatus.textContent = '! ENTER TURRET ASSEMBLY ID';
      return;
    }
    if (!_activeWallet) {
      anchorStatus.style.color = 'red';
      anchorStatus.textContent = '! CONNECT WALLET FIRST';
      return;
    }

    const star = starData.find(
      (s) => String(s.id) === rawStar || s.name.toUpperCase() === rawStar.toUpperCase()
    );
    const starId = star ? String(star.id) : rawStar;
    const starName = star?.name ?? rawStar;

    anchorRegisterBtn.disabled = true;
    anchorRegisterBtn.textContent = '[ AUTHORIZING... ]';
    anchorStatus.textContent = '';

    try {
      // 1 — Register on server
      const res = await fetch('/api/turrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starId, starName,
          constellationId: star?.constellationID ?? null,
          faction: getOwnerId(star, ownership) ?? null,
          lPoint: anchorLPointInput.value.trim() || null,
          shipRestriction: _selectedShip,
          assemblyId
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.reason === 'turret-already-exists' ? 'TURRET ALREADY REGISTERED AT THIS LOCATION' : data.reason);

      _lastAnchorUrl = `${window.location.origin}${data.url}`;
      anchorCopyBtn.style.display = 'block';
      navigator.clipboard.writeText(_lastAnchorUrl).catch(() => {});

      // 2 — On-chain authorize_extension
      anchorStatus.style.color = D;
      anchorStatus.textContent = 'BUILDING TRANSACTION...';

      const { Transaction } = await import('https://esm.sh/@mysten/sui@2.4.0/transactions');
      const packageId = _SHIP_TO_PACKAGE[_selectedShip];
      const tx = new Transaction();
      tx.setSender(_walletAddress);

      // Find OwnerCap<Turret> owned by the Character that controls this assembly
      const ownerCapType = `${_TURRET_WORLD_PACKAGE}::access::OwnerCap<${_TURRET_WORLD_PACKAGE}::turret::Turret>`;
      const [ownedRes, characterRes] = await Promise.all([
        fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getOwnedObjects', params: [
            _charRecord.characterId,
            { filter: { StructType: ownerCapType }, options: { showContent: true } },
          ]})
        }).then(r => r.json()),
        fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getObject', params: [_charRecord.characterId, { showOwner: true }] })
        }).then(r => r.json()),
      ]);

      const turretOwnerCaps = ownedRes.result?.data ?? [];
      const matchingCap = turretOwnerCaps.find(o => {
        const authId = o?.data?.content?.fields?.authorized_object_id;
        return authId === assemblyId;
      });
      if (!matchingCap) throw new Error('NO OWNER CAP FOUND FOR THIS TURRET — ARE YOU THE OWNER?');

      const ownerCapRef = {
        objectId: matchingCap.data.objectId,
        version: matchingCap.data.version,
        digest: matchingCap.data.digest,
      };
      const characterSharedRef = {
        objectId: _charRecord.characterId,
        initialSharedVersion: characterRes.result.data.owner.Shared.initial_shared_version,
        mutable: true,
      };

      const [borrowedOwnerCap, receipt] = tx.moveCall({
        target: `${_TURRET_WORLD_PACKAGE}::character::borrow_owner_cap`,
        typeArguments: [`${_TURRET_WORLD_PACKAGE}::turret::Turret`],
        arguments: [tx.sharedObjectRef(characterSharedRef), tx.receivingRef(ownerCapRef)],
      });

      tx.moveCall({
        target: `${_TURRET_WORLD_PACKAGE}::turret::authorize_extension`,
        typeArguments: [`${packageId}::turret::TurretAuth`],
        arguments: [tx.object(assemblyId), borrowedOwnerCap],
      });

      tx.moveCall({
        target: `${_TURRET_WORLD_PACKAGE}::character::return_owner_cap`,
        typeArguments: [`${_TURRET_WORLD_PACKAGE}::turret::Turret`],
        arguments: [tx.sharedObjectRef(characterSharedRef), borrowedOwnerCap, receipt],
      });

      anchorStatus.textContent = 'WAITING FOR WALLET APPROVAL...';
      const signFeature = _activeWallet.features['sui:signAndExecuteTransaction'];
      if (!signFeature) throw new Error('WALLET DOES NOT SUPPORT signAndExecuteTransaction');

      const txResult = await signFeature.signAndExecuteTransaction({
        transaction: tx,
        account: _activeWallet.accounts[0],
        chain: 'sui:testnet',
      });
      console.log('Authorize turret on-chain result:', txResult);

      // 3 — Anchor star icon
      await fetch('/api/ownership/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starId, iconId: 1, faction: getOwnerId(star, ownership) ?? null })
      });
      if (onOwnershipChange) await onOwnershipChange();
      else onStateChange?.();

      anchorStatus.style.color = P;
      anchorStatus.textContent = '✓ AUTHORIZED ON-CHAIN — LINK COPIED';
      anchorStarInput.value = '';
      anchorLPointInput.value = '';
      shipBtns[0].click();
      anchorAssemblyInput.value = '';
      await refreshTurretCache();
    } catch (e) {
      anchorStatus.style.color = 'red';
      anchorStatus.textContent = `! ${String(e.message ?? e).toUpperCase()}`;
    } finally {
      anchorRegisterBtn.disabled = false;
      anchorRegisterBtn.textContent = '[ AUTHORIZE TURRET ]';
    }
  });

  refreshTurretCache();
  content.appendChild(anchorRoot);

  /* ── SELECTED_SYSTEM ───────────────────────────────────────────── */
  const { root: selRoot, body: selBody } = makeModule('SELECTED_SYSTEM');
  selRoot.style.display = 'none';

  const selContent = baseText(document.createElement('div'));
  selContent.style.lineHeight = '1.6em';
  selBody.appendChild(selContent);
  content.appendChild(selRoot);

  /* ── COMMS ─────────────────────────────────────────────────────── */
  const { root: commsRoot, body: commsBody } = makeModule('COMMS');
  Object.assign(commsRoot.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column'
  });
  Object.assign(commsBody.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column',
    padding: '0'
  });

  const tabBar = document.createElement('div');
  Object.assign(tabBar.style, {
    display: 'flex',
    borderBottom: `1px solid ${P}`,
    flexShrink: '0'
  });

  function makeTab(label, enabled = true) {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      background: 'transparent',
      color: enabled ? P : D,
      border: 'none',
      borderRight: `1px solid ${P}`,
      fontFamily: UI_FONT,
      fontSize: FONT_SIZE,
      padding: '2px 10px',
      cursor: enabled ? 'pointer' : 'not-allowed',
      opacity: enabled ? '1' : '0.4',
      flex: '1'
    });
    btn.textContent = `[${label}]`;
    btn.disabled = !enabled;
    return btn;
  }

  const generalTab = makeTab('GENERAL', true);
  const factionTab = makeTab('FACTION', false);
  tabBar.appendChild(generalTab);
  tabBar.appendChild(factionTab);
  commsBody.appendChild(tabBar);

  function makeMessageArea() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      flex: '1',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '4px 8px',
      minHeight: '0',
      fontFamily: UI_FONT,
      fontSize: FONT_SIZE,
      lineHeight: '1.4em',
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      userSelect: 'text'
    });
    return el;
  }

  function addMsg(area, sender, text) {
    const line = document.createElement('div');
    line.style.borderBottom = `1px solid ${D}`;
    line.style.padding = '1px 0';
    line.style.fontFamily = UI_FONT;
    line.style.fontSize = FONT_SIZE;
    line.style.wordBreak = 'break-word';
    line.style.overflowWrap = 'break-word';
    line.style.userSelect = 'text';

    const stamp = formatFrontierTag();

    line.innerHTML = `
      <span style="color:${D}">${stamp}</span>
      <span style="color:${D}"> &lt;${sender}&gt;</span>
      <span style="color:${P}"> ${text}</span>
    `.trim();

    area.appendChild(line);
    area.scrollTop = area.scrollHeight;
  }

  const generalMessages = makeMessageArea();
  const factionMessages = makeMessageArea();
  factionMessages.style.display = 'none';

  addMsg(generalMessages, 'SYSTEM', 'FFW TERRITORY MAP SYS ONLINE');
  addMsg(generalMessages, 'SYSTEM', 'NODE LINK STABLE // 1200 BAUD');
  addMsg(generalMessages, 'SYSTEM', 'SCANNING REGION ACTIVITY...');

  addMsg(factionMessages, 'SYSTEM', 'FACTION CHANNEL SECURE');
  addMsg(factionMessages, 'SYSTEM', 'ENCRYPTED TUNNEL ACTIVE');

  commsBody.appendChild(generalMessages);
  commsBody.appendChild(factionMessages);

  function setActiveTab(showGeneral) {
    generalMessages.style.display = showGeneral ? 'block' : 'none';
    factionMessages.style.display = showGeneral ? 'none' : 'block';
    generalTab.style.background = showGeneral ? P : 'transparent';
    generalTab.style.color = showGeneral ? '#000' : P;
    factionTab.style.background = !showGeneral ? P : 'transparent';
    factionTab.style.color = (!showGeneral && !factionTab.disabled) ? '#000' : (factionTab.disabled ? D : P);
  }

  generalTab.addEventListener('click', () => setActiveTab(true));
  factionTab.addEventListener('click', () => {
    if (!factionTab.disabled) setActiveTab(false);
  });
  setActiveTab(true);

  const inputRow = document.createElement('div');
  Object.assign(inputRow.style, {
    display: 'flex',
    borderTop: `1px solid ${P}`,
    flexShrink: '0'
  });

  const chatInput = document.createElement('input');
  Object.assign(chatInput.style, {
    flex: '1',
    background: 'transparent',
    color: P,
    border: 'none',
    fontFamily: UI_FONT,
    fontSize: FONT_SIZE,
    padding: '3px 6px',
    outline: 'none',
    minWidth: '0'
  });
  chatInput.placeholder = '> ...';
  chatInput.setAttribute('spellcheck', 'false');

  const sendBtn = document.createElement('button');
  Object.assign(sendBtn.style, {
    background: 'transparent',
    color: P,
    border: 'none',
    borderLeft: `1px solid ${P}`,
    fontFamily: UI_FONT,
    fontSize: FONT_SIZE,
    padding: '3px 8px',
    cursor: 'pointer'
  });
  sendBtn.textContent = '[TX]';

  function addDevMsg(area, text) {
    const line = document.createElement('div');
    line.style.borderBottom = `1px solid ${D}`;
    line.style.padding = '1px 0';
    line.style.fontFamily = UI_FONT;
    line.style.fontSize = FONT_SIZE;
    line.style.color = '#4da6ff';
    line.textContent = text;
    area.appendChild(line);
    area.scrollTop = area.scrollHeight;
  }

  async function runDevCommand(cmd, area) {
    const parts = cmd.slice(1).trim().split(/\s+/);
    const name = parts[0].toLowerCase();

    // Helper: resolve star by name (case-insensitive) or ID
    function findStar(input) {
      const lo = input.toLowerCase();
      return starData.find(s => String(s.id) === input || s.name.toLowerCase() === lo);
    }

    if (name === 'help') {
      addDevMsg(area, '> /anchor <name> [iconId]    — fill icon (default: 1=dot)');
      addDevMsg(area, '> /capture <name> <faction>  — transfer star to faction');
      addDevMsg(area, '> /register-turret <name>    — create turret URL for star');
      addDevMsg(area, '> /contest <token>           — contest active capture (+5 min)');
      addDevMsg(area, '> /compute                   — compute voronoi territories');
      addDevMsg(area, '> /clearevents               — clear all server events');
      return;
    }

    if (name === 'clearevents') {
      const res = await fetch('/api/events/clear', { method: 'POST' });
      const data = await res.json();
      addDevMsg(area, data.ok ? '> events cleared' : `! error: ${data.reason}`);
      return;
    }

    if (name === 'anchor') {
      const input = parts[1];
      const iconId = parseInt(parts[2] ?? '1');
      if (!input) { addDevMsg(area, '! usage: /anchor <name> [iconId]'); return; }
      const star = findStar(input);
      const starId = star ? String(star.id) : input;
      const res = await fetch('/api/ownership/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starId, iconId, faction: star ? null : 0, actor: _walletAddress?.slice(0,8) ?? 'DEV' })
      });
      const data = await res.json();
      addDevMsg(area, data.ok ? `> anchored ${star?.name ?? starId} [icon ${iconId}]` : `! error: ${data.reason}`);
      if (data.ok) onStateChange();
      return;
    }

    if (name === 'capture') {
      const input = parts[1];
      const faction = parseInt(parts[2]);
      if (!input || isNaN(faction)) { addDevMsg(area, '! usage: /capture <name> <faction>'); return; }
      const star = findStar(input);
      const starId = star ? String(star.id) : input;
      const res = await fetch('/api/ownership/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starId, faction, starName: star?.name ?? starId, actor: _walletAddress?.slice(0,8) ?? 'DEV' })
      });
      const data = await res.json();
      addDevMsg(area, data.ok ? `> captured ${star?.name ?? starId} → faction ${faction}` : `! error: ${data.reason}`);
      if (data.ok) onStateChange();
      return;
    }

    if (name === 'register-turret') {
      const input = parts[1];
      if (!input) { addDevMsg(area, '! usage: /register-turret <name>'); return; }
      const star = findStar(input);
      const starId = star ? String(star.id) : input;
      const res = await fetch('/api/turrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starId, starName: star?.name ?? starId, constellationId: star?.constellationID, faction: null })
      });
      const data = await res.json();
      addDevMsg(area, data.ok ? `> turret URL: ${window.location.origin}${data.url}` : `! error: ${data.reason}`);
      return;
    }

    if (name === 'compute') {
      addDevMsg(area, '> computing voronoi...');
      if (!voronoiController) { addDevMsg(area, '! no voronoi controller'); return; }
      const result = await voronoiController.compute({ force: true });
      addDevMsg(area, result.ok ? `> done — ${result.cellsCount} cells` : `! error: ${result.reason}`);
      return;
    }

    if (name === 'contest') {
      const token = parts[1];
      if (!token) { addDevMsg(area, '! usage: /contest <token>'); return; }
      const res = await fetch(`/api/turrets/${token}/contest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorFaction: _charRecord?.faction ?? null,
          actor: _walletAddress?.slice(0, 8) ?? 'DEV',
          actorName: _charRecord?.characterName ?? 'DEV'
        })
      });
      const data = await res.json();
      addDevMsg(area, data.ok ? `> contested — endsAt: ${new Date(data.endsAt * 1000).toLocaleTimeString()}` : `! error: ${data.reason}`);
      return;
    }

    addDevMsg(area, `! unknown command: ${name} — try /help`);
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    const isFaction = factionMessages.style.display !== 'none';
    const area = isFaction ? factionMessages : generalMessages;
    if (text.startsWith('/')) {
      if (_walletAddress?.toLowerCase() !== DEV_WALLET.toLowerCase()) {
        addDevMsg(generalMessages, '! dev commands restricted');
        return;
      }
      runDevCommand(text, generalMessages);
      return;
    }
    const sender = _charRecord?.characterName ?? (_walletAddress ? _walletAddress.slice(0, 8) : 'ANON');
    const channel = isFaction ? 'faction' : 'general';
    // Optimistic local echo
    addMsg(area, sender, text);
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, sender, text })
      });
    } catch (_) { /* best-effort */ }
  }

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  inputRow.appendChild(chatInput);
  inputRow.appendChild(sendBtn);
  commsBody.appendChild(inputRow);
  content.appendChild(commsRoot);

  /* ── VORONOI (cache restore only — UI hidden) ─────────────────── */
  if (voronoiController) {
    queueMicrotask(async () => {
      try {
        await voronoiController.restoreFromCache?.();
      } catch (e) {
        console.warn('Voronoi cache restore failed:', e);
      }
    });
  }

  /* ── CHAT POLLING ──────────────────────────────────────────────── */
  let _lastGeneralTs = 0;
  let _lastFactionTs = 0;

  async function pollChat(channel) {
    try {
      const since = channel === 'faction' ? _lastFactionTs : _lastGeneralTs;
      const res = await fetch(`/api/chat?channel=${channel}&since=${since}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages?.length) return;
      const area = channel === 'faction' ? factionMessages : generalMessages;
      for (const m of data.messages) {
        addMsg(area, m.sender, m.text);
        if (channel === 'faction') { if (m.ts > _lastFactionTs) _lastFactionTs = m.ts; }
        else { if (m.ts > _lastGeneralTs) _lastGeneralTs = m.ts; }
      }
    } catch (_) { /* network hiccup */ }
  }

  // Seed last-seen timestamps from server on start so we don't replay history
  async function initChatTimestamps() {
    try {
      for (const ch of ['general', 'faction']) {
        const res = await fetch(`/api/chat?channel=${ch}&since=0`);
        if (!res.ok) continue;
        const data = await res.json();
        const msgs = data.messages ?? [];
        // Load existing messages into UI
        for (const m of msgs) {
          const area = ch === 'faction' ? factionMessages : generalMessages;
          addMsg(area, m.sender, m.text);
        }
        const maxTs = msgs.reduce((mx, m) => Math.max(mx, m.ts ?? 0), 0);
        if (ch === 'faction') _lastFactionTs = maxTs;
        else _lastGeneralTs = maxTs;
      }
    } catch (_) { /* ignore */ }
  }

  initChatTimestamps();
  setInterval(() => pollChat('general'), 5000);
  setInterval(() => pollChat('faction'), 5000);

  /* ── PUBLIC API ────────────────────────────────────────────────── */

  // Capture block element — updated independently by the poll
  const captureBlock = document.createElement('div');
  selContent.appendChild(captureBlock);

  function renderCaptureBlock(star) {
    if (!star) { captureBlock.innerHTML = ''; return; }
    const activeEntry = Object.values(_activeCapturesCache).find(
      (e) => String(e.starId) === String(star.id)
    );
    if (!activeEntry) {
      captureBlock.innerHTML = `<div style="margin-top:4px;color:${D}">&#62; NO ACTIVE CAPTURE</div>`;
      return;
    }
    const rem = Math.max(0, activeEntry.endsAt - Date.now() / 1000);
    const m = Math.floor(rem / 60).toString().padStart(2, '0');
    const s = Math.floor(rem % 60).toString().padStart(2, '0');
    const capActor = (activeEntry.actorName ?? activeEntry.actor ?? '?').toUpperCase();
    const capColor = getFactionColorHex(activeEntry.actorFaction, 'var(--ui-primary)');
    captureBlock.innerHTML = `
<div style="margin-top:6px;background:${capColor};color:#000;padding:4px 6px;font-family:${UI_FONT};font-size:${FONT_SIZE};line-height:1.5em">
  <div style="font-size:13px;font-weight:bold">&#9650; CAPTURE IN PROGRESS</div>
  <div style="font-size:12px">PLAYER: ${capActor}</div>
  <div style="font-size:15px;font-weight:bold">${m}:${s}</div>
</div>`.trim();
  }

  function setSelectedStar(star) {
    _selectedStarForAnchor = star;
    if (!star) {
      selRoot.style.display = 'none';
      _refreshSelectedCapture = null;
      return;
    }

    const ownerId = getOwnerId(star, ownership);
    const factionHex = ownerId != null ? getFactionColorHex(ownerId, null) : null;
    const factionName = ownerId != null ? getFactionName(ownerId, ownership) : null;
    const ownerHtml = factionHex
      ? `${colorSquare(factionHex)} <span style="color:${factionHex}">${factionName}</span>`
      : `<span style="color:${D}">UNCLAIMED</span>`;

    const turret = _turretsByStarId.get(String(star.id));
    let turretLine = `<span style="color:${D}">NONE</span>`;
    if (turret) {
      const lp = turret.lPoint ? turret.lPoint.toUpperCase() : '?';
      const ship = turret.shipRestriction ? turret.shipRestriction.toUpperCase() : 'UNRESTRICTED';
      turretLine = `<span style="color:${P}">${lp}</span><span style="color:${D}">  ${ship}</span>`;
    }

    selContent.innerHTML = `
<div><span style="color:${D}">OWNER:  </span>${ownerHtml}</div>
<div><span style="color:${D}">TURRET: </span>${turretLine}</div>
<div style="border-top:1px solid ${D};margin:3px 0"></div>
<div><span style="color:${D}">NAME:   </span>${star.name.toUpperCase()}</div>
<div><span style="color:${D}">ID:     </span>${star.id}</div>
<div><span style="color:${D}">REGION: </span>${(star.regionName || String(star.regionID) || '?').toUpperCase()}</div>
<div><span style="color:${D}">CONST:  </span>${star.constellationID ?? '?'}</div>
    `.trim();
    selContent.appendChild(captureBlock);
    renderCaptureBlock(star);

    _refreshSelectedCapture = () => renderCaptureBlock(star);
    selRoot.style.display = 'block';
  }

  return { setSelectedStar };
}