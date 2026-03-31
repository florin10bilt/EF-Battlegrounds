import { UI_FONT } from './uiTheme.js';

export function setupOrbitControl(camera, canvas, orbitState = { enabled: false }) {
  const button = document.createElement('button');

  Object.assign(button.style, {
    position: 'absolute',
    top: '10px',
    right: 'var(--right-panel-offset, 240px)',
    width: '32px',
    height: '28px',
    background: 'rgba(0, 0, 0, 0.78)',
    color: 'var(--ui-primary)',
    border: '1px solid var(--ui-primary)',
    fontFamily: UI_FONT,
    fontSize: '16px',
    padding: '0',
    cursor: 'pointer',
    zIndex: 1002,
    userSelect: 'none',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    lineHeight: '1'
  });

  function renderButton() {
    button.textContent = orbitState.enabled ? '◉' : '↻';
    button.style.background = orbitState.enabled
      ? 'var(--ui-primary)'
      : 'rgba(0, 0, 0, 0.78)';
    button.style.color = orbitState.enabled ? '#000' : 'var(--ui-primary)';
  }

  button.addEventListener('mouseenter', () => {
    if (!orbitState.enabled) {
      button.style.background = 'rgba(255, 255, 255, 0.06)';
    }
  });

  button.addEventListener('mouseleave', () => {
    renderButton();
  });

  button.addEventListener('click', () => {
    orbitState.enabled = !orbitState.enabled;
    renderButton();
  });

  document.body.appendChild(button);
  renderButton();

  const interrupt = () => {
    if (orbitState.enabled) {
      orbitState.enabled = false;
      renderButton();
    }
  };

  ['mousedown', 'wheel', 'contextmenu'].forEach((event) =>
    canvas.addEventListener(event, interrupt)
  );

  return function updateOrbit() {
    if (orbitState.enabled) {
      camera.thetaTarget += 0.0015;
    }
  };
}