// createTextureDebugger.js
export function createTextureDebugger(regl, getTexture) {
  const quad = regl.buffer([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ]);

  return regl({
    vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `,
    frag: `
      precision mediump float;
      uniform sampler2D tex;
      varying vec2 vUv;
      void main() {
        float a = texture2D(tex, vUv).a;
        gl_FragColor = vec4(vec3(a), 1.0); // grayscale visualization of alpha
      }
    `,
    attributes: {
      position: quad
    },
    uniforms: {
      tex: getTexture
    },
    count: 4,
    primitive: 'triangle fan',
    depth: { enable: false }
  });
}
