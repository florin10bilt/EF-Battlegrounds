import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';

export function setupCamera(canvas) {
  const view = mat4.create();
  const projection = mat4.create();

  const eye = vec3.create();
  const center = vec3.fromValues(0, 0, 0);
  const up = vec3.fromValues(0, 1, 0);

  let distance = 5e6;
  let theta = Math.PI / 4;
  let phi = Math.PI / 3;

  let thetaTarget = theta;
  let phiTarget = phi;
  let distanceTarget = distance;

  const panOffset = vec3.fromValues(0, 0, 0);
  const panTarget = vec3.clone(panOffset);

  let smoothEnabled = true;

  let dragging = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    distanceTarget *= zoomFactor;
    if (distanceTarget < 100) distanceTarget = 100;
  });

  canvas.addEventListener('mousedown', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.button === 2) panning = true;
    else dragging = true;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    panning = false;
  });

  window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    if (dragging) {
      thetaTarget -= dx * 0.01;
      phiTarget = Math.max(0.05, Math.min(Math.PI - 0.05, phiTarget - dy * 0.01));
    } else if (panning) {
      const panSpeed = distance * 0.002;
      const look = vec3.sub(vec3.create(), center, eye);
      vec3.normalize(look, look);
      const right = vec3.cross(vec3.create(), look, up);
      vec3.normalize(right, right);
      const upVec = vec3.cross(vec3.create(), right, look);
      vec3.normalize(upVec, upVec);
      vec3.scaleAndAdd(panTarget, panTarget, right, -dx * panSpeed);
      vec3.scaleAndAdd(panTarget, panTarget, upVec, dy * panSpeed);
    }

    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function update() {
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerpVec3 = (out, a, b, t) => {
      out[0] = lerp(a[0], b[0], t);
      out[1] = lerp(a[1], b[1], t);
      out[2] = lerp(a[2], b[2], t);
    };

    if (smoothEnabled) {
      theta = lerp(theta, thetaTarget, 0.15);
      phi = lerp(phi, phiTarget, 0.15);
      distance = lerp(distance, distanceTarget, 0.15);
      lerpVec3(panOffset, panOffset, panTarget, 0.15);
    } else {
      theta = thetaTarget;
      phi = phiTarget;
      distance = distanceTarget;
      vec3.copy(panOffset, panTarget);
    }

    eye[0] = distance * Math.sin(phi) * Math.sin(theta);
    eye[1] = distance * Math.cos(phi);
    eye[2] = distance * Math.sin(phi) * Math.cos(theta);
    vec3.add(eye, eye, panOffset);
    vec3.add(center, vec3.fromValues(0, 0, 0), panOffset);
    mat4.lookAt(view, eye, center, up);
    mat4.perspective(projection, Math.PI / 4, canvas.clientWidth / canvas.clientHeight, 100, 1e8);
  }

  return {
    update,
    get view() { return view; },
    get projection() { return projection; },
    get viewProjection() {
      const vp = mat4.create();
      mat4.multiply(vp, projection, view);
      return vp;
    },
    get distance() { return distance; },
    get distanceTarget() { return distanceTarget; },
    set distanceTarget(v) { distanceTarget = v; },
    get theta() { return theta; },
    set theta(t) { theta = t; },
    get thetaTarget() { return thetaTarget; },
    set thetaTarget(v) { thetaTarget = v; },
    get phiTarget() { return phiTarget; },
    set phiTarget(v) { phiTarget = v; },
    set smoothEnabled(v) { smoothEnabled = v; },
    get smoothEnabled() { return smoothEnabled; },
    flyTo(position) {
      vec3.copy(panTarget, position);
    }
  };
}
