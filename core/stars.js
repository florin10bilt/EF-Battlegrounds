const SCALE = 1e-13;
const DEFAULT_POINT_SCALE = 1_600_000.0;
const DEFAULT_COLOR = [1, 1, 1, 1];
const MAX_POINT_SIZE = 22.0;

const ICON_CODES = {
  ring: 0,
  dot: 1,
  square: 2,
  diamond: 3
};

function isHiddenName(name) {
  return /^AD\d{3}$/.test(name || '') || /^V-\d{3}$/.test(name || '');
}

function toWorldPosition(center) {
  return [
    center[0] * SCALE,
    -center[1] * SCALE,
    -center[2] * SCALE
  ];
}

function loadNameMap(namesRaw) {
  return new Map(namesRaw.map((entry) => [String(entry.id), entry.name]));
}

function toIconCode(iconType) {
  return ICON_CODES[iconType] ?? ICON_CODES.dot;
}

function buildStarData(systemsRaw, namesRaw, getStarIconName, getStarColor, getStarColorHex) {
  const systems = systemsRaw.solarSystems;
  const nameMap = loadNameMap(namesRaw);

  const starData = [];
  const positions = [];
  const iconCodes = [];

  for (const [id, data] of Object.entries(systems)) {
    const name = nameMap.get(id) || id;

    if (!data.center) continue;
    if (isHiddenName(name)) continue;

    const position = toWorldPosition(data.center);

    const star = {
      id: String(id),
      name,
      position,
      regionID: data.regionID,
      regionName: data.regionName || data.region || data.regionLabel || null,
      constellationID: data.constellationID,
      iconType: getStarIconName?.({ id: String(id), name, regionID: data.regionID, constellationID: data.constellationID }) ?? 'dot',
      ownerColor: null,
      ownerColorHex: '#ffffff'
    };

    star.ownerColor = getStarColor?.(star) ?? DEFAULT_COLOR;
    star.ownerColorHex = getStarColorHex?.(star) ?? '#ffffff';

    starData.push(star);
    positions.push(position);
    iconCodes.push(toIconCode('dot')); // ownership ring icons are drawn by the canvas layer
  }

  return { starData, positions, iconCodes };
}

function createDrawStars(regl, camera, buffers, count) {
  return regl({
    vert: `
      precision mediump float;

      attribute vec3 position;
      attribute vec4 color;
      attribute float pointScale;
      attribute float visible;
      attribute float iconCode;

      uniform mat4 projection;
      uniform mat4 view;

      varying vec4 vColor;
      varying float vVisible;
      varying float vPointSize;
      varying float vIconCode;

      void main() {
        if (visible < 0.5) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          vVisible = 0.0;
          vPointSize = 0.0;
          vIconCode = 1.0;
          return;
        }

        vec4 viewPos = view * vec4(position, 1.0);
        float dist = max(length(viewPos.xyz), 0.0001);
        float size = clamp(pointScale / dist, 1.0, ${MAX_POINT_SIZE.toFixed(1)});

        gl_Position = projection * viewPos;
        gl_PointSize = size;

        vColor = color;
        vVisible = visible;
        vPointSize = size;
        vIconCode = iconCode;
      }
    `,
    frag: `
      precision mediump float;

      varying vec4 vColor;
      varying float vVisible;
      varying float vPointSize;
      varying float vIconCode;

      void main() {
        if (vVisible < 0.5) discard;

        if (vPointSize <= 1.5) {
          gl_FragColor = vec4(vColor.rgb, 1.0);
          return;
        }

        vec2 coord = gl_PointCoord;
        vec2 norm = coord * 2.0 - 1.0;

        if (vIconCode < 0.5) {
          float d = length(norm);
          if (d < 0.55 || d > 1.0) discard;
        } else if (vIconCode < 1.5) {
          float d = dot(norm, norm);
          if (d > 1.0) discard;
        } else if (vIconCode < 2.5) {
          if (max(abs(norm.x), abs(norm.y)) > 0.82) discard;
        } else {
          if (abs(norm.x) + abs(norm.y) > 1.0) discard;
        }

        gl_FragColor = vec4(vColor.rgb, 1.0);
      }
    `,
    attributes: {
      position: buffers.position,
      color: buffers.color,
      pointScale: buffers.size,
      visible: buffers.visible,
      iconCode: buffers.iconCode
    },
    uniforms: {
      projection: () => camera.projection,
      view: () => camera.view
    },
    count,
    primitive: 'points',
    depth: { enable: true },
    blend: { enable: false }
  });
}

export async function createStarRenderer(regl, camera, debug, options = {}) {
  const {
    getStarIconName = null,
    getStarColor = null,
    getStarColorHex = null
  } = options;

  const [systemsRaw, namesRaw] = await Promise.all([
    fetch('./data/starmapcache.json').then((r) => r.json()),
    fetch('./data/solar_system_names.json').then((r) => r.json())
  ]);

  const { starData, positions, iconCodes } = buildStarData(
    systemsRaw,
    namesRaw,
    getStarIconName,
    getStarColor,
    getStarColorHex
  );

  debug?.log?.(`load: ${starData.length} star systems`);

  const colorArray = new Float32Array(starData.length * 4);
  const sizeArray = new Float32Array(starData.length);
  const visibilityArray = new Float32Array(starData.length);

  for (let i = 0; i < starData.length; i++) {
    const color = starData[i].ownerColor ?? DEFAULT_COLOR;
    colorArray.set(color, i * 4);
    sizeArray[i] = DEFAULT_POINT_SCALE;
    visibilityArray[i] = 1;
  }

  const buffers = {
    position: regl.buffer(positions),
    color: regl.buffer({ usage: 'dynamic', data: colorArray }),
    size: regl.buffer({ usage: 'dynamic', data: sizeArray }),
    visible: regl.buffer({ usage: 'dynamic', data: visibilityArray }),
    iconCode: regl.buffer(iconCodes)
  };

  const drawStars = createDrawStars(regl, camera, buffers, starData.length);

  let visualsDirty = true;

  function applyBaseVisuals(options = {}) {
    const pointScale = options.pointScale || DEFAULT_POINT_SCALE;

    for (let i = 0; i < starData.length; i++) {
      const color = starData[i].ownerColor ?? DEFAULT_COLOR;
      colorArray.set(color, i * 4);
      sizeArray[i] = pointScale;
    }

    buffers.color.subdata(colorArray);
    buffers.size.subdata(sizeArray);
  }

  function setVisibilityMask(mask) {
    for (let i = 0; i < starData.length; i++) {
      visibilityArray[i] = mask[i] ? 1 : 0;
    }
    buffers.visible.subdata(visibilityArray);
  }

  function updateHighlightColors() {
    return;
  }

  return {
    drawStars,
    starData,
    updateHighlightColors,
    setVisibilityMask,
    updateStarVisuals(options = {}) {
      if (!visualsDirty) return;
      applyBaseVisuals(options);
      visualsDirty = false;
    },
    markVisualsDirty() {
      visualsDirty = true;
    }
  };
}