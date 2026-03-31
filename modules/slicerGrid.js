import { UI_COLOR_RGBA } from './uiTheme.js';

export function createSlicerGrid(regl, camera, starData, options = {}) {
  const {
    cellSize = 400000,
    verticalLimit = 200000,
    alpha = 0.2,
    enabled = true,
    starFilter = null
  } = options;

  const filteredStars = starFilter
    ? starData.filter(starFilter)
    : starData;

  if (!filteredStars || filteredStars.length === 0) {
    return {
      draw() {},
      getPlaneY: () => 0
    };
  }

  // middle slice plane from filtered stars
  const ys = filteredStars.map(s => s.position[1]).sort((a, b) => a - b);
  const mid = Math.floor(ys.length / 2);
  const planeY = ys.length % 2 === 0
    ? (ys[mid - 1] + ys[mid]) * 0.5
    : ys[mid];

  // occupied cells only
  const occupied = new Set();

  for (const s of filteredStars) {
    const [x, y, z] = s.position;

    if (Math.abs(y - planeY) > verticalLimit) continue;

    const gx = Math.floor(x / cellSize);
    const gz = Math.floor(z / cellSize);

    occupied.add(`${gx},${gz}`);
  }

  // full grid on occupied cells only
  const gridLines = [];

  function addLine(a, b) {
    gridLines.push(a, b);
  }

  for (const key of occupied) {
    const [gx, gz] = key.split(',').map(Number);

    const x0 = gx * cellSize;
    const x1 = x0 + cellSize;
    const z0 = gz * cellSize;
    const z1 = z0 + cellSize;

    // top
    addLine([x0, planeY, z0], [x1, planeY, z0]);

    // right
    addLine([x1, planeY, z0], [x1, planeY, z1]);

    // bottom
    addLine([x1, planeY, z1], [x0, planeY, z1]);

    // left
    addLine([x0, planeY, z1], [x0, planeY, z0]);
  }

  const gridBuffer = regl.buffer(gridLines);

  const drawLines = regl({
    vert: `
      precision mediump float;
      attribute vec3 position;
      uniform mat4 projection, view;
      void main() {
        gl_Position = projection * view * vec4(position, 1.0);
      }
    `,
    frag: `
      precision mediump float;
      uniform vec4 uColor;
      void main() {
        gl_FragColor = uColor;
      }
    `,
    attributes: {
      position: gridBuffer
    },
    uniforms: {
      projection: () => camera.projection,
      view: () => camera.view,
      uColor: [UI_COLOR_RGBA[0], UI_COLOR_RGBA[1], UI_COLOR_RGBA[2], alpha]
    },
    count: gridLines.length,
    primitive: 'lines',
    depth: { enable: true },
    blend: {
      enable: true,
      func: {
        src: 'src alpha',
        dst: 'one minus src alpha'
      }
    }
  });

  return {
    draw() {
      if (!enabled) return;
      if (gridLines.length > 0) drawLines();
    },
    getPlaneY() {
      return planeY;
    }
  };
}