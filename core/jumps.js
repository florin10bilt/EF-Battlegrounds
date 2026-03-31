const SCALE = 1e-13;

export async function createJumpRenderer(regl, camera, debug) {
  const response = await fetch('./data/starmapcache.json');
  const json = await response.json();

  const systems = json.solarSystems;
  const jumps = json.jumps;

  const jumpLines = [];

  const seen = new Set();

  for (const jump of jumps) {
    const from = systems[jump.fromSystemID];
    const to = systems[jump.toSystemID];

    if (!from || !to) continue;
    if (!from.center || !to.center) continue;

    const fromKey = jump.fromSystemID;
    const toKey = jump.toSystemID;
    const pairKey = `${Math.min(fromKey, toKey)}-${Math.max(fromKey, toKey)}`;

    if (seen.has(pairKey)) continue; // skip duplicates
    seen.add(pairKey);

    if (from.center[0] === to.center[0] &&
        from.center[1] === to.center[1] &&
        from.center[2] === to.center[2]) continue;

    const a = [
  from.center[0] * SCALE,
  -from.center[1] * SCALE,
  -from.center[2] * SCALE
];
const b = [
  to.center[0] * SCALE,
  -to.center[1] * SCALE,
  -to.center[2] * SCALE
];
jumpLines.push(a, b);
  }

  const jumpBuffer = regl.buffer(jumpLines);

  debug.log(`load: ${jumpLines.length / 2} jump connections`);

  const drawJumps = regl({
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
    void main() {
      gl_FragColor = vec4(1.0, 1.0, 1.0, 0.15);  // white, transparent
    }
  `,
  attributes: {
    position: jumpBuffer
  },
  uniforms: {
    projection: () => camera.projection,
    view: () => camera.view
  },
  count: jumpLines.length,
  primitive: 'lines',
  blend: {
    enable: true,
    func: {
      src: 'src alpha',
      dst: 'one minus src alpha'
    }
  }
});

  return () => drawJumps();
}
