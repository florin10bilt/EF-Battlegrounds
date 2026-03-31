import { vec4, mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export function selectStarAt(ndcX, ndcY, camera, starData, threshold = 0.0025) {
  const viewProj = mat4.create();
  mat4.multiply(viewProj, camera.projection, camera.view);

  let closest = null;
  let closestDist = Infinity;

  for (const star of starData) {
    const pos = vec4.fromValues(...star.position, 1.0);
    vec4.transformMat4(pos, pos, viewProj);

    if (pos[3] === 0) continue;

    const sx = pos[0] / pos[3];
    const sy = pos[1] / pos[3];
    const dx = ndcX - sx;
    const dy = ndcY - sy;
    const dist = dx * dx + dy * dy;

    if (dist < threshold && dist < closestDist) {
      closest = star;
      closestDist = dist;
    }
  }

  return closest;
}
