import { UI_COLOR, UI_FONT, UI_FONT_SIZE_1 } from './uiTheme.js';

function makePanelBase(style = {}) {
  const div = document.createElement('div');

  Object.assign(div.style, {
    position: 'absolute',
    color: UI_COLOR,
    fontFamily: UI_FONT,
    fontSize: UI_FONT_SIZE_1,
    zIndex: 1000,
    ...style
  });

  document.body.appendChild(div);
  return div;
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function makeAsciiBar(progress01, width = 20) {
  const clamped = Math.max(0, Math.min(1, Number(progress01) || 0));
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function createTextButton(label) {
  const btn = document.createElement('button');
  btn.textContent = label;

  Object.assign(btn.style, {
    background: 'none',
    border: '1px solid var(--ui-primary, rgba(0,255,156,0.35))',
    color: 'var(--ui-primary, #fff)',
    fontFamily: UI_FONT,
    fontSize: UI_FONT_SIZE_1,
    padding: '4px 8px',
    cursor: 'pointer',
    minWidth: '84px'
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--ui-primary, rgba(0,255,156,0.8))';
    btn.style.color = '#000';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'none';
    btn.style.color = 'var(--ui-primary, #fff)';
  });

  return btn;
}

export function createDebugConsole() {
  const div = makePanelBase({
    top: '30px',
    left: '10px',
    whiteSpace: 'pre',
    maxHeight: '40vh',
    overflow: 'auto',
    pointerEvents: 'auto',
    userSelect: 'text',
    zIndex: 1000
  });

  const start = performance.now();
  const logs = [];

  function log(text, alsoConsole = false) {
    const now = performance.now();
    const timestamp = `[+${Math.floor(now - start)
      .toString()
      .padStart(5, '0')}ms]`;

    const line =
      typeof text === 'string'
        ? `${timestamp} ${text}`
        : `${timestamp} ${JSON.stringify(text)}`;

    logs.push(line);
    if (logs.length > 60) logs.shift();

    div.textContent = logs.join('\n');

    if (alsoConsole) {
      if (window.originalConsoleLog) {
        window.originalConsoleLog(text);
      } else {
        console.info(text);
      }
    }
  }

  if (!window.originalConsoleLog) {
    window.originalConsoleLog = console.log.bind(console);
    console.log = (...args) => {
      const joined = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ');
      log(joined, true);
    };
  }

  return {
    log,
    clear() {
      logs.length = 0;
      div.textContent = '';
    },
    element: div
  };
}

export function createPerformanceMonitor() {
  const container = makePanelBase({
    top: '10px',
    left: '10px',
    whiteSpace: 'pre',
    pointerEvents: 'none',
    zIndex: 1001
  });

  let lastUpdateTime = performance.now();
  let lastFrameTime = performance.now();
  let frameCount = 0;

  return {
    update({ points = 0, drawCalls = 0 }) {
      frameCount += 1;
      const now = performance.now();

      if (now - lastUpdateTime < 250) return;

      const elapsed = (now - lastUpdateTime) / 1000;
      const fps = Math.round(frameCount / elapsed);
      const frameTime = ((now - lastFrameTime) / Math.max(frameCount, 1)).toFixed(1);
      const memory = window.performance?.memory?.usedJSHeapSize
        ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}MB`
        : 'n/a';

      container.textContent =
        `FPS: ${fps} | Frame: ${frameTime}ms | Points: ${points.toLocaleString()} | Draws: ${drawCalls} | Mem: ${memory}`;

      frameCount = 0;
      lastUpdateTime = now;
      lastFrameTime = now;
    },
    element: container
  };
}

/**
 * Creates the Voronoi compute panel UI.
 *
 * @param {object} options
 * @param {object} options.controller   - Voronoi controller object
 * @param {string} [options.title]      - Panel title (used in standalone mode only)
 * @param {string} [options.left]       - CSS left (standalone mode only)
 * @param {string} [options.bottom]     - CSS bottom (standalone mode only)
 * @param {HTMLElement} [options.container] - If provided, renders into this element
 *                                            instead of creating a floating panel.
 */
export function createVoronoiComputePanel({
  controller,
  title = 'Voronoi',
  left = '10px',
  bottom = '10px',
  container = null
}) {
  let root;

  if (container) {
    // Render into provided container (e.g. a panel module body)
    root = container;
  } else {
    // Standalone floating panel
    root = makePanelBase({
      left,
      bottom,
      minWidth: '260px',
      padding: '8px 10px',
      border: '1px solid rgba(0,255,156,0.25)',
      background: 'rgba(0,0,0,0.35)',
      lineHeight: '1.35em',
      pointerEvents: 'auto',
      userSelect: 'none',
      zIndex: 1002
    });

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.marginBottom = '8px';
    heading.style.fontWeight = 'bold';
    root.appendChild(heading);
  }

  const statusLine = document.createElement('div');
  statusLine.textContent = 'STATUS: IDLE';
  root.appendChild(statusLine);

  const savedLine = document.createElement('div');
  savedLine.textContent = 'SAVED: —';
  root.appendChild(savedLine);

  const cellsLine = document.createElement('div');
  cellsLine.textContent = 'CELLS: 0';
  root.appendChild(cellsLine);

  const progressLine = document.createElement('div');
  progressLine.style.marginTop = '6px';
  progressLine.textContent = `${makeAsciiBar(0)} 0%`;
  root.appendChild(progressLine);

  const progressLabel = document.createElement('div');
  progressLabel.textContent = 'IDLE';
  progressLabel.style.marginBottom = '8px';
  root.appendChild(progressLabel);

  const buttonRow = document.createElement('div');
  Object.assign(buttonRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px'
  });
  root.appendChild(buttonRow);

  const loadBtn = createTextButton('LOAD');
  const computeBtn = createTextButton('COMPUTE');
  const recomputeBtn = createTextButton('RECOMPUTE');
  const clearBtn = createTextButton('CLEAR');

  buttonRow.append(loadBtn, computeBtn, recomputeBtn, clearBtn);

  let currentProgress = { label: 'Idle', value: 0, busy: false };
  let currentSavedAt = null;

  function setButtonsDisabled(disabled) {
    [loadBtn, computeBtn, recomputeBtn, clearBtn].forEach((btn) => {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.55' : '1';
      btn.style.cursor = disabled ? 'default' : 'pointer';
    });
  }

  function render() {
    const cells = controller.getCells?.() ?? [];
    const busy = controller.isBusy?.() ?? currentProgress.busy ?? false;

    statusLine.textContent = `STATUS: ${busy ? 'WORKING' : 'READY'}`;
    savedLine.textContent = `SAVED: ${formatDateTime(currentSavedAt)}`;
    cellsLine.textContent = `CELLS: ${cells.length}`;

    const pct = Math.round((currentProgress.value || 0) * 100);
    progressLine.textContent = `${makeAsciiBar(currentProgress.value || 0)} ${pct}%`;
    progressLabel.textContent = (currentProgress.label || 'Idle').toUpperCase();

    setButtonsDisabled(busy);
  }

  function setPanelState({
    label = currentProgress.label,
    value = currentProgress.value,
    savedAt = currentSavedAt,
    busy = controller.isBusy?.() ?? false
  } = {}) {
    currentProgress = { label, value, busy };
    currentSavedAt = savedAt;
    render();
  }

  controller.setProgressListener?.(({ label, value, busy }) => {
    setPanelState({
      label,
      value,
      busy,
      savedAt: currentSavedAt
    });
  });

  async function safeRun(action) {
    if (controller.isBusy?.()) return;

    try {
      await action();
    } catch (error) {
      console.error(error);
      setPanelState({
        label: 'Failed',
        value: 0,
        savedAt: currentSavedAt,
        busy: false
      });
    }
  }

  loadBtn.addEventListener('click', () => {
    safeRun(async () => {
      setPanelState({ label: 'Loading cache', value: 0.15, busy: true });

      const result = await controller.restoreFromCache?.();

      if (result?.ok) {
        setPanelState({
          label: 'Cache loaded',
          value: 1,
          savedAt: result.savedAt ?? currentSavedAt,
          busy: false
        });
      } else {
        setPanelState({
          label: 'No matching cache',
          value: 0,
          savedAt: null,
          busy: false
        });
      }
    });
  });

  computeBtn.addEventListener('click', () => {
    safeRun(async () => {
      const result = await controller.compute?.({ force: false });

      if (result?.ok) {
        setPanelState({
          label: result.reused ? 'Using current cells' : 'Done',
          value: 1,
          savedAt: result.savedAt ?? currentSavedAt,
          busy: false
        });
      } else if (result?.reason === 'no-selection') {
        setPanelState({
          label: 'No selected stars',
          value: 0,
          savedAt: currentSavedAt,
          busy: false
        });
      } else {
        setPanelState({
          label: 'Compute failed',
          value: 0,
          savedAt: currentSavedAt,
          busy: false
        });
      }
    });
  });

  recomputeBtn.addEventListener('click', () => {
    safeRun(async () => {
      const result = await controller.compute?.({ force: true });

      if (result?.ok) {
        setPanelState({
          label: 'Recomputed',
          value: 1,
          savedAt: result.savedAt ?? currentSavedAt,
          busy: false
        });
      } else {
        setPanelState({
          label: 'Recompute failed',
          value: 0,
          savedAt: currentSavedAt,
          busy: false
        });
      }
    });
  });

  clearBtn.addEventListener('click', () => {
    safeRun(async () => {
      setPanelState({ label: 'Clearing', value: 0.1, busy: true });

      await controller.clear?.();

      currentSavedAt = null;
      setPanelState({
        label: 'Cleared',
        value: 0,
        savedAt: null,
        busy: false
      });
    });
  });

  render();

  // Auto-restore on startup
  queueMicrotask(async () => {
    try {
      const result = await controller.restoreFromCache?.();
      if (result?.ok) {
        currentSavedAt = result.savedAt ?? null;
        setPanelState({
          label: 'Cache loaded',
          value: 1,
          savedAt: currentSavedAt,
          busy: false
        });
      } else {
        render();
      }
    } catch (error) {
      console.warn('Initial Voronoi cache restore failed:', error);
      render();
    }
  });

  return {
    element: root,
    render,
    destroy() {
      if (!container) root.remove();
    }
  };
}
