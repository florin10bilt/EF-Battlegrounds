import { UI_COLOR, UI_FONT, UI_FONT_SIZE_1, getFactionColorHex } from './uiTheme.js';

function drawCanvasIcon(ctx, x, y, iconType, color) {
  const c = color || UI_COLOR;

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 1.5;

  if (iconType === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (iconType === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (iconType === 'square') {
    ctx.strokeRect(-4.5, -4.5, 9, 9);
  } else if (iconType === 'diamond') {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function createStarLabelUI(canvas) {
  const container = document.createElement('div');
  const outline = document.createElement('div');
  const label = document.createElement('div');

  Object.assign(container.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    zIndex: '1002',
    display: 'none',
    alignItems: 'center',
    height: '20px',
    willChange: 'transform'
  });

  Object.assign(outline.style, {
    width: '20px',
    height: '20px',
    border: `1px solid ${UI_COLOR}`,
    boxSizing: 'border-box',
    color: UI_COLOR,
    fontFamily: UI_FONT,
    background: 'transparent'
  });

  Object.assign(label.style, {
    background: UI_COLOR,
    color: 'black',
    fontFamily: UI_FONT,
    fontSize: UI_FONT_SIZE_1,
    padding: '1px 6px',
    boxSizing: 'border-box',
    lineHeight: '18px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    maxWidth: 'max-content'
  });

  container.appendChild(outline);
  container.appendChild(label);
  document.body.appendChild(container);

  let selected = null;
  let lastX = -1;
  let lastY = -1;

  return {
    select(star) {
      selected = star;
      label.textContent = star.name;
      container.style.display = 'flex';
    },
    clear() {
      selected = null;
      container.style.display = 'none';
    },
    update(camera) {
      if (!selected || !selected.position) {
        container.style.display = 'none';
        return;
      }

      const [x, y, z] = selected.position;
      const projected = [0, 0, 0, 1];
      const mvp = camera.viewProjection;

      projected[0] = x * mvp[0] + y * mvp[4] + z * mvp[8] + mvp[12];
      projected[1] = x * mvp[1] + y * mvp[5] + z * mvp[9] + mvp[13];
      projected[2] = x * mvp[2] + y * mvp[6] + z * mvp[10] + mvp[14];
      projected[3] = x * mvp[3] + y * mvp[7] + z * mvp[11] + mvp[15];

      if (projected[3] <= 0) {
        container.style.display = 'none';
        return;
      }

      const ndcX = projected[0] / projected[3];
      const ndcY = projected[1] / projected[3];
      const screenX = (ndcX * 0.5 + 0.5) * canvas.clientWidth;
      const screenY = (-ndcY * 0.5 + 0.5) * canvas.clientHeight;

      const sx = screenX - 10;
      const sy = screenY - 10;

      if (Math.abs(sx - lastX) > 0.05 || Math.abs(sy - lastY) > 0.05) {
        container.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        lastX = sx;
        lastY = sy;
      }

      container.style.display = 'flex';
    },
    getSelected() {
      return selected;
    }
  };
}

export function createCanvasLabelRenderer(baseCanvas, camera) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.style.position = 'absolute';
  labelCanvas.style.top = '0';
  labelCanvas.style.left = '0';
  labelCanvas.style.pointerEvents = 'none';
  labelCanvas.style.zIndex = '1000';
  document.body.appendChild(labelCanvas);

  const ctx = labelCanvas.getContext('2d');
  let resolutionScale = 1;

  function resize(scale = 1) {
    resolutionScale = scale;
    const w = baseCanvas.clientWidth;
    const h = baseCanvas.clientHeight;

    labelCanvas.width = w * scale;
    labelCanvas.height = h * scale;
    labelCanvas.style.width = `${w}px`;
    labelCanvas.style.height = `${h}px`;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function clear() {
    ctx.clearRect(
      0,
      0,
      labelCanvas.width / resolutionScale,
      labelCanvas.height / resolutionScale
    );
  }

  function update(stars) {
    clear();
    ctx.font = `${UI_FONT_SIZE_1} ${UI_FONT}`;
    ctx.fillStyle = UI_COLOR;
    ctx.textBaseline = 'middle';

    const mvp = camera.viewProjection;
    const width = baseCanvas.clientWidth;
    const height = baseCanvas.clientHeight;

    stars.forEach((star) => {
      const [x, y, z] = star.position;

      const w = x * mvp[3] + y * mvp[7] + z * mvp[11] + mvp[15];
      if (w <= 0) return;

      const nx = (x * mvp[0] + y * mvp[4] + z * mvp[8] + mvp[12]) / w;
      const ny = (x * mvp[1] + y * mvp[5] + z * mvp[9] + mvp[13]) / w;

      const sx = (nx * 0.5 + 0.5) * width;
      const sy = (-ny * 0.5 + 0.5) * height;

      ctx.fillText(star.name, sx + 12, sy);
    });
  }

  return {
    update,
    resize,
    clear
  };
}

export function createCanvasIconRenderer(baseCanvas, camera) {
  const iconCanvas = document.createElement('canvas');
  iconCanvas.style.position = 'absolute';
  iconCanvas.style.top = '0';
  iconCanvas.style.left = '0';
  iconCanvas.style.pointerEvents = 'none';
  iconCanvas.style.zIndex = '999';
  document.body.appendChild(iconCanvas);

  const ctx = iconCanvas.getContext('2d');
  let resolutionScale = 1;

  function resize(scale = 1) {
    resolutionScale = scale;
    const w = baseCanvas.clientWidth;
    const h = baseCanvas.clientHeight;

    iconCanvas.width = w * scale;
    iconCanvas.height = h * scale;
    iconCanvas.style.width = `${w}px`;
    iconCanvas.style.height = `${h}px`;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function clear() {
    ctx.clearRect(
      0,
      0,
      iconCanvas.width / resolutionScale,
      iconCanvas.height / resolutionScale
    );
  }

  function update(stars, captureEntries = []) {
    clear();

    const mvp = camera.viewProjection;
    const width = baseCanvas.clientWidth;
    const height = baseCanvas.clientHeight;

    stars.forEach((star) => {
      const [x, y, z] = star.position;

      const w = x * mvp[3] + y * mvp[7] + z * mvp[11] + mvp[15];
      if (w <= 0) return;

      const nx = (x * mvp[0] + y * mvp[4] + z * mvp[8] + mvp[12]) / w;
      const ny = (x * mvp[1] + y * mvp[5] + z * mvp[9] + mvp[13]) / w;

      const sx = (nx * 0.5 + 0.5) * width;
      const sy = (-ny * 0.5 + 0.5) * height;

      drawCanvasIcon(
        ctx,
        sx,
        sy,
        star.iconType || 'dot',
        star.ownerColorHex || UI_COLOR
      );
    });

    // Draw capture indicators on top
    if (captureEntries.length) {
      const now = Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(now * 3);

      captureEntries.forEach((entry) => {
        if (!entry._star?.position) return;
        const [x, y, z] = entry._star.position;
        const w = x * mvp[3] + y * mvp[7] + z * mvp[11] + mvp[15];
        if (w <= 0) return;
        const nx = (x * mvp[0] + y * mvp[4] + z * mvp[8] + mvp[12]) / w;
        const ny = (x * mvp[1] + y * mvp[5] + z * mvp[9] + mvp[13]) / w;
        const sx = (nx * 0.5 + 0.5) * width;
        const sy = (-ny * 0.5 + 0.5) * height;

        // Pulsing ring — capturer's faction color
        const ringColor = getFactionColorHex(entry.actorFaction, UI_COLOR);
        ctx.save();
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Two-line text label with background
        const rem = Math.max(0, entry.endsAt - now);
        const mm = Math.floor(rem / 60).toString().padStart(2, '0');
        const ss = Math.floor(rem % 60).toString().padStart(2, '0');
        const starName = (entry.starName ?? '?').toUpperCase();
        const subText = `CAPTURING  ${mm}:${ss}`;
        const lx = sx + 14;
        ctx.save();
        ctx.font = `bold 15px ${UI_FONT}`;
        const nameW = ctx.measureText(starName).width;
        ctx.font = `11px ${UI_FONT}`;
        const subW = ctx.measureText(subText).width;
        const boxW = Math.max(nameW, subW) + 10;
        // Dark background box
        ctx.fillStyle = '#000000';
        ctx.fillRect(lx - 2, sy - 16, boxW, 30);
        // Star name
        ctx.fillStyle = UI_COLOR;
        ctx.textBaseline = 'bottom';
        ctx.font = `bold 15px ${UI_FONT}`;
        ctx.fillText(starName, lx, sy + 1);
        // Countdown
        ctx.textBaseline = 'top';
        ctx.font = `11px ${UI_FONT}`;
        ctx.fillText(subText, lx, sy + 2);
        ctx.restore();
      });
    }
  }

  return {
    update,
    resize,
    clear
  };
}