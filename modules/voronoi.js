const EPS = 1e-5;

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mul3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function len3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v) {
  const l = len3(v);
  if (l < EPS) return [0, 0, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

function planeDistance(plane, p) {
  return dot3(plane.normal, p) - plane.offset;
}

function makePlane(normal, point) {
  const n = normalize3(normal);
  return {
    normal: n,
    offset: dot3(n, point)
  };
}

function intersectSegmentPlane(a, b, plane) {
  const da = planeDistance(plane, a);
  const db = planeDistance(plane, b);
  const denom = da - db;

  if (Math.abs(denom) < EPS) return a.slice();

  const t = da / denom;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function dedupePoints(points, eps = 1e-4) {
  const out = [];

  for (const p of points) {
    let found = false;
    for (const q of out) {
      if (
        Math.abs(p[0] - q[0]) < eps &&
        Math.abs(p[1] - q[1]) < eps &&
        Math.abs(p[2] - q[2]) < eps
      ) {
        found = true;
        break;
      }
    }
    if (!found) out.push(p);
  }

  return out;
}

function clipPolygonWithPlane(poly, plane) {
  if (!poly.length) return [];

  const out = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];

    const da = planeDistance(plane, a);
    const db = planeDistance(plane, b);

    const aInside = da <= EPS;
    const bInside = db <= EPS;

    if (aInside && bInside) {
      out.push(b);
    } else if (aInside && !bInside) {
      out.push(intersectSegmentPlane(a, b, plane));
    } else if (!aInside && bInside) {
      out.push(intersectSegmentPlane(a, b, plane));
      out.push(b);
    }
  }

  return dedupePoints(out);
}

function polygonNormal(poly) {
  let n = [0, 0, 0];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];

    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }

  return normalize3(n);
}

function faceArea(face) {
  if (!face || face.length < 3) return 0;

  const origin = face[0];
  let area = 0;

  for (let i = 1; i < face.length - 1; i++) {
    const a = sub3(face[i], origin);
    const b = sub3(face[i + 1], origin);
    area += 0.5 * len3(cross3(a, b));
  }

  return area;
}

function orderFacePoints(points, faceNormal) {
  const pts = dedupePoints(points);
  if (pts.length < 3) return pts;

  const center = pts.reduce((acc, p) => add3(acc, p), [0, 0, 0]);
  center[0] /= pts.length;
  center[1] /= pts.length;
  center[2] /= pts.length;

  const ref = Math.abs(faceNormal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize3(cross3(faceNormal, ref));
  const v = normalize3(cross3(faceNormal, u));

  return pts
    .map((p) => {
      const d = sub3(p, center);
      return {
        p,
        angle: Math.atan2(dot3(d, v), dot3(d, u))
      };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((x) => x.p);
}

function triangulateFace(face, sitePos) {
  const ordered = orderFacePoints(face, polygonNormal(face));
  if (ordered.length < 3) return [];

  const center = ordered.reduce((acc, p) => add3(acc, p), [0, 0, 0]);
  center[0] /= ordered.length;
  center[1] /= ordered.length;
  center[2] /= ordered.length;

  const normal = polygonNormal(ordered);
  const toSite = sub3(sitePos, center);

  if (dot3(normal, toSite) > 0) {
    ordered.reverse();
  }

  const tris = [];
  for (let i = 1; i < ordered.length - 1; i++) {
    tris.push([ordered[0], ordered[i], ordered[i + 1]]);
  }

  return tris;
}

function cloneFaces(faces) {
  return faces.map((face) => ({
    points: face.points.map((p) => p.slice()),
    tag: face.tag ? { ...face.tag } : null
  }));
}

function buildGlobalBoundsBox(sites, padding = 160000) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const site of sites) {
    const [x, y, z] = site.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  minX -= padding;
  minY -= padding;
  minZ -= padding;
  maxX += padding;
  maxY += padding;
  maxZ += padding;

  const v = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [minX, maxY, minZ],
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ]
  ];

  return [
    { points: [v[0], v[1], v[2], v[3]], tag: { type: 'bounds' } },
    { points: [v[4], v[7], v[6], v[5]], tag: { type: 'bounds' } },
    { points: [v[0], v[4], v[5], v[1]], tag: { type: 'bounds' } },
    { points: [v[1], v[5], v[6], v[2]], tag: { type: 'bounds' } },
    { points: [v[2], v[6], v[7], v[3]], tag: { type: 'bounds' } },
    { points: [v[3], v[7], v[4], v[0]], tag: { type: 'bounds' } }
  ];
}

function clipPolyhedronWithPlane(faces, plane, minFaceArea = 1500, faceTag = null) {
  const newFaces = [];
  const cutPoints = [];

  for (const face of faces) {
    const clipped = clipPolygonWithPlane(face.points, plane);

    if (clipped.length >= 3) {
      const ordered = orderFacePoints(clipped, polygonNormal(clipped));
      if (faceArea(ordered) >= minFaceArea) {
        newFaces.push({
          points: ordered,
          tag: face.tag || null
        });
      }
    }

    const pts = face.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const da = planeDistance(plane, a);
      const db = planeDistance(plane, b);

      if ((da <= EPS && db > EPS) || (da > EPS && db <= EPS)) {
        cutPoints.push(intersectSegmentPlane(a, b, plane));
      }
    }
  }

  const uniqueCut = dedupePoints(cutPoints);
  if (uniqueCut.length >= 3) {
    const cap = orderFacePoints(uniqueCut, plane.normal);
    if (cap.length >= 3 && faceArea(cap) >= minFaceArea) {
      newFaces.push({
        points: cap,
        tag: faceTag
      });
    }
  }

  return { faces: newFaces };
}

function nearestDistancesToSet(star, candidates, limit = 6) {
  const best = [];

  for (const other of candidates) {
    if (other === star) continue;

    const d = len3(sub3(other.position, star.position));
    if (!(d > EPS)) continue;

    let inserted = false;
    for (let i = 0; i < best.length; i++) {
      if (d < best[i]) {
        best.splice(i, 0, d);
        inserted = true;
        break;
      }
    }
    if (!inserted) best.push(d);
    if (best.length > limit) best.pop();
  }

  return best;
}

function averageNearestDistance(stars, universe, limit = 6) {
  let sum = 0;
  let count = 0;

  for (const star of stars) {
    const best = nearestDistancesToSet(star, universe, limit);
    for (const d of best) {
      sum += d;
      count += 1;
    }
  }

  if (!count) {
    let fallback = 0;
    let pairs = 0;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        fallback += len3(sub3(stars[i].position, stars[j].position));
        pairs += 1;
      }
    }
    return pairs ? fallback / pairs : 10000;
  }

  return sum / count;
}

function computeClusterCenter(stars) {
  const c = [0, 0, 0];
  if (!stars.length) return c;

  for (const s of stars) {
    c[0] += s.position[0];
    c[1] += s.position[1];
    c[2] += s.position[2];
  }

  c[0] /= stars.length;
  c[1] /= stars.length;
  c[2] /= stars.length;
  return c;
}

function computeClusterRadius(stars, center) {
  let maxDist = 0;
  for (const s of stars) {
    maxDist = Math.max(maxDist, len3(sub3(s.position, center)));
  }
  return maxDist;
}

function normalizeSiteName(value) {
  return String(value ?? '').trim().toUpperCase();
}

function buildGhostDirections(count = 26) {
  const dirs = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const y = 1 - t * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    dirs.push(normalize3([
      Math.cos(theta) * radius,
      y,
      Math.sin(theta) * radius
    ]));
  }

  dirs.push([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]);

  return dedupeDirectionVectors(dirs);
}

function dedupeDirectionVectors(dirs, eps = 1e-3) {
  const out = [];

  for (const dir of dirs) {
    const n = normalize3(dir);
    if (len3(n) < EPS) continue;

    let found = false;
    for (const q of out) {
      if (
        Math.abs(n[0] - q[0]) < eps &&
        Math.abs(n[1] - q[1]) < eps &&
        Math.abs(n[2] - q[2]) < eps
      ) {
        found = true;
        break;
      }
    }

    if (!found) out.push(n);
  }

  return out;
}

function projectMaxAlongDirection(stars, center, dir) {
  let best = -Infinity;

  for (const s of stars) {
    const proj = dot3(sub3(s.position, center), dir);
    if (proj > best) best = proj;
  }

  return Number.isFinite(best) ? best : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearestDistancesFromStar(star, candidates, limit = 6) {
  const best = [];

  for (const other of candidates) {
    if (other === star) continue;
    const d = len3(sub3(other.position, star.position));
    if (!(d > EPS)) continue;

    let inserted = false;
    for (let i = 0; i < best.length; i++) {
      if (d < best[i]) {
        best.splice(i, 0, d);
        inserted = true;
        break;
      }
    }
    if (!inserted) best.push(d);
    if (best.length > limit) best.pop();
  }

  return best;
}

function dedupeGhostSites(ghosts, eps = 1) {
  const out = [];

  for (const ghost of ghosts) {
    let found = false;
    for (const other of out) {
      if (
        Math.abs(ghost.position[0] - other.position[0]) < eps &&
        Math.abs(ghost.position[1] - other.position[1]) < eps &&
        Math.abs(ghost.position[2] - other.position[2]) < eps
      ) {
        found = true;
        break;
      }
    }

    if (!found) out.push(ghost);
  }

  return out;
}

function createAdaptiveGhosts(realSites, center, clusterRadius, localScale, options = {}) {
  const {
    ghostClearanceMultiplier = 2.75,
    ghostCoverageThreshold = 0.8,
    maxGhostDistanceMultiplier = 2.4,
    directionCount = 26
  } = options;

  const dirs = buildGhostDirections(directionCount);
  const ghosts = [];

  const supports = dirs.map((dir) => projectMaxAlongDirection(realSites, center, dir));
  const supportMedian = median(supports);
  const supportMax = supports.length ? Math.max(...supports) : clusterRadius;
  const supportTarget = Math.max(
    supportMedian + localScale * ghostCoverageThreshold,
    Math.min(clusterRadius, supportMax)
  );

  let ghostId = 0;

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const support = supports[i];

    if (support >= supportTarget) continue;

    const ghostDistance = Math.min(
      support + localScale * ghostClearanceMultiplier,
      supportTarget + localScale * maxGhostDistanceMultiplier
    );

    ghosts.push({
      id: `ghost-${ghostId}`,
      name: `__ghost_${ghostId}`,
      position: add3(center, mul3(dir, ghostDistance)),
      isGhost: true
    });

    ghostId += 1;
  }

  return ghosts;
}

function createGapGhosts(realSites, selectedSites, localScale, options = {}) {
  const {
    gapGhosts = true,
    gapPairDistanceMultiplier = 3.25,
    gapGhostOffsetMultiplier = 0.55,
    gapGhostPerPair = 2
  } = options;

  if (!gapGhosts) return [];

  const ghosts = [];
  const seen = new Set();
  let ghostId = 100000;

  for (let i = 0; i < selectedSites.length; i++) {
    const a = selectedSites[i];
    const nearest = [];

    for (const b of realSites) {
      if (a === b) continue;
      const delta = sub3(b.position, a.position);
      const d = len3(delta);
      if (!(d > EPS)) continue;

      let inserted = false;
      for (let j = 0; j < nearest.length; j++) {
        if (d < nearest[j].d) {
          nearest.splice(j, 0, { site: b, d, delta });
          inserted = true;
          break;
        }
      }
      if (!inserted) nearest.push({ site: b, d, delta });
      if (nearest.length > 3) nearest.pop();
    }

    for (const entry of nearest) {
      const b = entry.site;
      const pairKey = [a.name, b.name].sort().join('::');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      if (entry.d <= localScale * gapPairDistanceMultiplier) continue;

      const dir = normalize3(entry.delta);
      const mid = mul3(add3(a.position, b.position), 0.5);
      const offset = Math.min(localScale * gapGhostOffsetMultiplier, entry.d * 0.18);

      const ghostNameA = `__ghost_${ghostId}`;
      ghosts.push({
        id: `ghost-${ghostId}`,
        name: ghostNameA,
        position: add3(mid, mul3(dir, offset)),
        isGhost: true
      });
      ghostId += 1;

      if (gapGhostPerPair >= 2) {
        const ghostNameB = `__ghost_${ghostId}`;
        ghosts.push({
          id: `ghost-${ghostId}`,
          name: ghostNameB,
          position: add3(mid, mul3(dir, -offset)),
          isGhost: true
        });
        ghostId += 1;
      }
    }
  }

  return ghosts;
}

function createFrontierGhosts(realSites, selectedSites, center, clusterRadius, localScale, options = {}) {
  const {
    frontierGhosts = true,
    frontierDirectionCount = 16,
    frontierGhostRadiusMultiplier = 1.08,
    frontierGhostClampMin = 0.9,
    frontierGhostClampMax = 1.18,
    frontierCoverageCos = 0.72,
    frontierCoverageDistanceMultiplier = 1.3,
    frontierOuterBias = 0.15,
    frontierThreshold = 0.55,
    frontierGhostCap = 6
  } = options;

  if (!frontierGhosts || !selectedSites.length) return [];

  const dirs = buildGhostDirections(frontierDirectionCount);
  const ghosts = [];
  let ghostId = 200000;
  const effectiveClusterRadius = Math.max(clusterRadius, localScale * 1.25, EPS);

  for (const star of selectedSites) {
    const centerDelta = sub3(star.position, center);
    const radialDistance = len3(centerDelta);
    const radialRatio = radialDistance / effectiveClusterRadius;
    const isFrontier = selectedSites.length <= 2 || radialRatio >= frontierThreshold;
    if (!isFrontier) continue;

    const nearest = nearestDistancesFromStar(star, realSites, 6);
    const starScaleRaw = nearest.length ? median(nearest) : localScale;
    const starScale = clamp(
      starScaleRaw * frontierGhostRadiusMultiplier,
      localScale * frontierGhostClampMin,
      localScale * frontierGhostClampMax
    );
    const coverageDistance = starScale * frontierCoverageDistanceMultiplier;
    const outward = radialDistance > EPS ? normalize3(centerDelta) : [0, 0, 0];
    let addedForStar = 0;

    for (const dir of dirs) {
      if (addedForStar >= frontierGhostCap) break;

      let covered = false;

      for (const other of realSites) {
        if (other === star) continue;
        const delta = sub3(other.position, star.position);
        const dist = len3(delta);
        if (!(dist > EPS) || dist > coverageDistance) continue;

        const align = dot3(normalize3(delta), dir);
        if (align >= frontierCoverageCos) {
          covered = true;
          break;
        }
      }

      if (covered) continue;

      const outwardBoost = dot3(outward, dir) > 0 ? dot3(outward, dir) * frontierOuterBias * localScale : 0;

      ghosts.push({
        id: `ghost-${ghostId}`,
        name: `__ghost_${ghostId}`,
        position: add3(star.position, mul3(dir, starScale + outwardBoost)),
        isGhost: true
      });
      ghostId += 1;
      addedForStar += 1;
    }
  }

  return dedupeGhostSites(ghosts, Math.max(1, localScale * 0.08));
}

export function buildVoronoiSelection(stars, selectedNames, options = {}) {
  const {
    contextK = 10,
    contextScaleMultiplier = 4.5,
    prefilterScaleMultiplier = 8,
    ghostSites = true,
    ghostClearanceMultiplier = 2.75,
    ghostCoverageThreshold = 0.8,
    maxGhostDistanceMultiplier = 2.4,
    gapGhosts = true,
    gapPairDistanceMultiplier = 3.25,
    gapGhostOffsetMultiplier = 0.55,
    gapGhostPerPair = 2,
    frontierGhosts = true,
    frontierDirectionCount = 18,
    frontierGhostRadiusMultiplier = 2.0,
    frontierGhostClampMin = 0.85,
    frontierGhostClampMax = 1.15,
    frontierCoverageCos = 0.72,
    frontierCoverageDistanceMultiplier = 1.35,
    frontierOuterBias = 0.15,
    frontierThreshold = 0.55,
    frontierGhostCap = 10
  } = options;

  const selected = [];
  const context = [];
  const ghosts = [];

  const byName = new Map();
  stars.forEach((s) => byName.set(normalizeSiteName(s.name), s));

  selectedNames.forEach((name) => {
    const star = byName.get(normalizeSiteName(name));
    if (star) selected.push(star);
    else console.warn('Voronoi: star not found:', name);
  });

  if (!selected.length) {
    return {
      selected: [],
      context: [],
      ghosts: [],
      allSites: [],
      localScale: 0,
      center: [0, 0, 0],
      clusterRadius: 0
    };
  }

  const selectedSet = new Set(selected);
  const center = computeClusterCenter(selected);
  const clusterRadius = computeClusterRadius(selected, center);
  const localScale = averageNearestDistance(selected, stars, 6);

  const prefilterRadius = Math.max(
    clusterRadius + localScale * prefilterScaleMultiplier,
    localScale * 3
  );
  const prefilterRadius2 = prefilterRadius * prefilterRadius;
  const prefiltered = [];

  for (const s of stars) {
    const dx = s.position[0] - center[0];
    const dy = s.position[1] - center[1];
    const dz = s.position[2] - center[2];
    const d2 = dx * dx + dy * dy + dz * dz;

    if (d2 <= prefilterRadius2) {
      prefiltered.push(s);
    }
  }

  const contextSet = new Set();
  const contextRadius = Math.max(localScale * contextScaleMultiplier, localScale * 2);

  for (const star of selected) {
    const nearest = [];

    for (const other of prefiltered) {
      if (other === star || selectedSet.has(other)) continue;

      const d = len3(sub3(other.position, star.position));

      if (d <= contextRadius) {
        contextSet.add(other);
      }

      let inserted = false;
      for (let i = 0; i < nearest.length; i++) {
        if (d < nearest[i].d) {
          nearest.splice(i, 0, { star: other, d });
          inserted = true;
          break;
        }
      }
      if (!inserted) nearest.push({ star: other, d });
      if (nearest.length > contextK) nearest.pop();
    }

    for (const entry of nearest) {
      contextSet.add(entry.star);
    }
  }

  for (const s of contextSet) {
    context.push(s);
  }

  if (ghostSites) {
    const realSites = [...selected, ...context];

    ghosts.push(
      ...createAdaptiveGhosts(
        realSites,
        center,
        clusterRadius,
        localScale,
        {
          ghostClearanceMultiplier,
          ghostCoverageThreshold,
          maxGhostDistanceMultiplier,
          directionCount: Math.max(18, frontierDirectionCount)
        }
      )
    );

    ghosts.push(
      ...createFrontierGhosts(realSites, selected, center, clusterRadius, localScale, {
        frontierGhosts,
        frontierDirectionCount,
        frontierGhostRadiusMultiplier,
        frontierGhostClampMin,
        frontierGhostClampMax,
        frontierCoverageCos,
        frontierCoverageDistanceMultiplier,
        frontierOuterBias,
        frontierThreshold,
        frontierGhostCap
      })
    );

    ghosts.push(
      ...createGapGhosts(realSites, selected, localScale, {
        gapGhosts,
        gapPairDistanceMultiplier,
        gapGhostOffsetMultiplier,
        gapGhostPerPair
      })
    );
  }

  const finalGhosts = dedupeGhostSites(ghosts, Math.max(1, localScale * 0.05));

  return {
    selected,
    context,
    ghosts: finalGhosts,
    allSites: [...selected, ...context, ...finalGhosts],
    localScale,
    center,
    clusterRadius
  };
}

export function computeVoronoiCells(
  sites,
  _unusedBoxSize = 0,
  {
    minFaceArea = 1500,
    boundsPadding = 160000
  } = {}
) {
  const cells = [];
  if (!sites.length) return cells;

  const sharedBounds = buildGlobalBoundsBox(sites, boundsPadding);

  for (const site of sites) {
    let faces = cloneFaces(sharedBounds);

    for (const other of sites) {
      if (other === site) continue;

      const dir = sub3(other.position, site.position);
      if (len3(dir) < EPS) continue;

      const mid = mul3(add3(site.position, other.position), 0.5);
      const plane = makePlane(dir, mid);

      const result = clipPolyhedronWithPlane(
        faces,
        plane,
        minFaceArea,
        {
          type: 'neighbor',
          otherName: other.name
        }
      );

      faces = result.faces;
      if (!faces.length) break;
    }

    cells.push({
      site,
      faces
    });
  }

  return cells;
}

function brightenColor(color, factor = 1.6) {
  return [
    Math.min(1, color[0] * factor),
    Math.min(1, color[1] * factor),
    Math.min(1, color[2] * factor)
  ];
}

let drawFlatFaces = null;
let drawDualColorFaces = null;
let drawLines = null;

let drawMaskFaces = null;
let blurX = null;
let blurY = null;
let drawGlowOverlay = null;

let quadBuffer = null;
let maskFramebuffer = null;
let blurTempFramebuffer = null;
let blurFramebuffer = null;
let framebufferSize = { width: 0, height: 0 };

function ensureMaskBuffers(regl) {
  const width = Math.max(1, regl._gl.drawingBufferWidth);
  const height = Math.max(1, regl._gl.drawingBufferHeight);

  if (
    maskFramebuffer &&
    framebufferSize.width === width &&
    framebufferSize.height === height
  ) {
    return;
  }

  framebufferSize = { width, height };

  maskFramebuffer = regl.framebuffer({
    color: regl.texture({ width, height }),
    depth: true
  });

  blurTempFramebuffer = regl.framebuffer({
    color: regl.texture({ width, height }),
    depth: false
  });

  blurFramebuffer = regl.framebuffer({
    color: regl.texture({ width, height }),
    depth: false
  });
}

function ensureDrawers(regl, camera) {
  ensureMaskBuffers(regl);
  if (drawFlatFaces) return;

  quadBuffer = regl.buffer([
    [-1, -1],
    [ 1, -1],
    [ 1,  1],
    [-1,  1]
  ]);

  drawFlatFaces = regl({
  vert: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 projection, view;
    void main() {
      gl_Position = projection * view * vec4(position, 1.0);
    }
  `,
  frag: `
  precision highp float;
  uniform vec3 color;
  uniform float alpha;

  uniform float stripeOverlay;
  uniform float stripeSpacing;
  uniform float stripeWidth;
  uniform float stripeStrength;

  void main() {
    vec3 finalColor = color;

    if (stripeOverlay > 0.5) {
      float diag = mod(gl_FragCoord.x + gl_FragCoord.y, stripeSpacing);
      float stripe = 1.0 - step(stripeWidth, diag);

      vec3 darkColor = color * (1.0 - 0.45 * stripeStrength);
      vec3 lightColor = min(color * (1.0 + 0.35 * stripeStrength) + vec3(0.03), vec3(1.0));

      finalColor = mix(darkColor, lightColor, stripe);
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`,
  attributes: {
    position: regl.prop('positions')
  },
  uniforms: {
    projection: () => camera.projection,
    view: () => camera.view,
    color: regl.prop('color'),
    alpha: regl.prop('alpha'),
    stripeOverlay: regl.prop('stripeOverlay'),
    stripeSpacing: regl.prop('stripeSpacing'),
    stripeWidth: regl.prop('stripeWidth'),
    stripeStrength: regl.prop('stripeStrength')
  },
  count: regl.prop('count'),
  primitive: 'triangles',
  blend: {
    enable: true,
    func: { src: 'src alpha', dst: 'one minus src alpha' }
  },
  depth: { enable: true, mask: false },
  cull: { enable: false }
});

  drawMaskFaces = regl({
    framebuffer: () => maskFramebuffer,
    vert: `
      precision highp float;
      attribute vec3 position;
      uniform mat4 projection, view;
      void main() {
        gl_Position = projection * view * vec4(position, 1.0);
      }
    `,
    frag: `
      precision highp float;
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `,
    attributes: {
      position: regl.prop('positions')
    },
    uniforms: {
      projection: () => camera.projection,
      view: () => camera.view
    },
    count: regl.prop('count'),
    primitive: 'triangles',
    depth: { enable: true, mask: true },
    blend: { enable: false },
    cull: { enable: false }
  });

  blurX = regl({
    framebuffer: () => blurTempFramebuffer,
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
      varying vec2 vUv;
      uniform sampler2D tex;
      uniform vec2 texelSize;
      uniform float size;

      void main() {
        float dx = texelSize.x * size;
        float sum = 0.0;

        sum += texture2D(tex, vUv + vec2(-2.0 * dx, 0.0)).a * 0.1;
        sum += texture2D(tex, vUv + vec2(-1.0 * dx, 0.0)).a * 0.2;
        sum += texture2D(tex, vUv).a * 0.4;
        sum += texture2D(tex, vUv + vec2( 1.0 * dx, 0.0)).a * 0.2;
        sum += texture2D(tex, vUv + vec2( 2.0 * dx, 0.0)).a * 0.1;

        gl_FragColor = vec4(0.0, 0.0, 0.0, sum);
      }
    `,
    attributes: { position: quadBuffer },
    uniforms: {
      tex: () => maskFramebuffer.color[0],
      texelSize: () => [1 / framebufferSize.width, 1 / framebufferSize.height],
      size: regl.prop('size')
    },
    count: 4,
    primitive: 'triangle fan',
    depth: { enable: false }
  });

  blurY = regl({
    framebuffer: () => blurFramebuffer,
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
      varying vec2 vUv;
      uniform sampler2D tex;
      uniform vec2 texelSize;
      uniform float size;

      void main() {
        float dy = texelSize.y * size;
        float sum = 0.0;

        sum += texture2D(tex, vUv + vec2(0.0, -2.0 * dy)).a * 0.1;
        sum += texture2D(tex, vUv + vec2(0.0, -1.0 * dy)).a * 0.2;
        sum += texture2D(tex, vUv).a * 0.4;
        sum += texture2D(tex, vUv + vec2(0.0,  1.0 * dy)).a * 0.2;
        sum += texture2D(tex, vUv + vec2(0.0,  2.0 * dy)).a * 0.1;

        gl_FragColor = vec4(0.0, 0.0, 0.0, sum);
      }
    `,
    attributes: { position: quadBuffer },
    uniforms: {
      tex: () => blurTempFramebuffer.color[0],
      texelSize: () => [1 / framebufferSize.width, 1 / framebufferSize.height],
      size: regl.prop('size')
    },
    count: 4,
    primitive: 'triangle fan',
    depth: { enable: false }
  });

  drawGlowOverlay = regl({
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
      varying vec2 vUv;

      uniform sampler2D blurred;
      uniform sampler2D original;
      uniform vec3 color;
      uniform float intensity;

      void main() {
        float blurA = texture2D(blurred, vUv).a;
        float solidA = texture2D(original, vUv).a;

        float glow = clamp(solidA - blurA, 0.0, 1.0);
        if (glow < 0.01) discard;

        gl_FragColor = vec4(color, glow * intensity);
      }
    `,
    attributes: { position: quadBuffer },
    uniforms: {
      blurred: () => blurFramebuffer.color[0],
      original: () => maskFramebuffer.color[0],
      color: regl.prop('color'),
      intensity: regl.prop('intensity')
    },
    count: 4,
    primitive: 'triangle fan',
    depth: { enable: false },
    blend: {
      enable: true,
      func: {
        src: 'src alpha',
        dst: 'one minus src alpha'
      }
    }
  });

  drawDualColorFaces = regl({
  vert: `
    precision highp float;
    attribute vec3 position;
    attribute vec3 frontColor;
    attribute vec3 backColor;
    varying vec3 vFrontColor;
    varying vec3 vBackColor;
    uniform mat4 projection, view;
    void main() {
      vFrontColor = frontColor;
      vBackColor = backColor;
      gl_Position = projection * view * vec4(position, 1.0);
    }
  `,
  frag: `
  precision highp float;
  varying vec3 vFrontColor;
  varying vec3 vBackColor;
  uniform float alpha;

  uniform float stripeOverlay;
  uniform float stripeSpacing;
  uniform float stripeWidth;
  uniform float stripeStrength;

  void main() {
    vec3 baseColor = gl_FrontFacing ? vFrontColor : vBackColor;
    vec3 finalColor = baseColor;

    if (stripeOverlay > 0.5) {
      float diag = mod(gl_FragCoord.x + gl_FragCoord.y, stripeSpacing);
      float stripe = 1.0 - step(stripeWidth, diag);

      vec3 darkColor = baseColor * (1.0 - 0.45 * stripeStrength);
      vec3 lightColor = min(baseColor * (1.0 + 0.35 * stripeStrength) + vec3(0.03), vec3(1.0));

      finalColor = mix(darkColor, lightColor, stripe);
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`,
  attributes: {
    position: regl.prop('positions'),
    frontColor: regl.prop('frontColors'),
    backColor: regl.prop('backColors')
  },
  uniforms: {
    projection: () => camera.projection,
    view: () => camera.view,
    alpha: regl.prop('alpha'),
    stripeOverlay: regl.prop('stripeOverlay'),
    stripeSpacing: regl.prop('stripeSpacing'),
    stripeWidth: regl.prop('stripeWidth'),
    stripeStrength: regl.prop('stripeStrength')
  },
  count: regl.prop('count'),
  primitive: 'triangles',
  blend: {
    enable: true,
    func: { src: 'src alpha', dst: 'one minus src alpha' }
  },
  depth: { enable: true, mask: false },
  cull: { enable: false }
});

  drawLines = regl({
    vert: `
      precision highp float;
      attribute vec3 position;
      uniform mat4 projection, view;
      void main() {
        gl_Position = projection * view * vec4(position, 1.0);
      }
    `,
    frag: `
      precision highp float;
      uniform vec3 color;
      uniform float alpha;
      void main() {
        gl_FragColor = vec4(color, alpha);
      }
    `,
    attributes: {
      position: regl.prop('positions')
    },
    uniforms: {
      projection: () => camera.projection,
      view: () => camera.view,
      color: regl.prop('color'),
      alpha: regl.prop('alpha')
    },
    count: regl.prop('count'),
    primitive: 'lines',
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' }
    },
    depth: { enable: true, mask: false }
  });
}

function collectTerritoryGeometry(cells, ownerMap, ownerColors) {
  const showGhostCapLines = false;
const territoryTriPositions = {};
const territoryMaskTriPositions = {};
  const borderTriPositions = [];
  const borderTriFrontColors = [];
  const borderTriBackColors = [];
  const borderLinePositions = [];
  const drawnBorderPairs = new Set();

  const brightOwnerColors = {};
  for (const [owner, color] of Object.entries(ownerColors)) {
    brightOwnerColors[owner] = brightenColor(color, 1.8);
    territoryTriPositions[owner] = [];
territoryMaskTriPositions[owner] = [];
  }

  for (const cell of cells) {
    if (cell.site.isGhost) continue;

    const ownerA = ownerMap[cell.site.name];
    if (ownerA == null || ownerColors[ownerA] == null) continue;

    if (!territoryTriPositions[ownerA]) {
      territoryTriPositions[ownerA] = [];
    }

    for (const face of cell.faces) {
      const tag = face.tag || null;

      if (tag?.type === 'neighbor') {
        const otherName = tag.otherName;
        const otherCellIsGhost = String(otherName).startsWith('__ghost_');
        const ownerB = ownerMap[otherName];

        if (otherCellIsGhost) {
          const tris = triangulateFace(face.points, cell.site.position);
          for (const tri of tris) {
  territoryTriPositions[ownerA].push(tri[0], tri[1], tri[2]);
  territoryMaskTriPositions[ownerA].push(tri[0], tri[1], tri[2]);
}

          if (showGhostCapLines) {
            const ordered = orderFacePoints(face.points, polygonNormal(face.points));
            for (let i = 0; i < ordered.length; i++) {
              const a = ordered[i];
              const b = ordered[(i + 1) % ordered.length];
              borderLinePositions.push(a, b);
            }
          }
          continue;
        }

        if (ownerB != null && ownerB === ownerA) {
          continue;
        }

        if (ownerB != null && ownerColors[ownerB] != null && ownerB !== ownerA) {
          const pairKey = [cell.site.name, otherName].sort().join('::');
          if (drawnBorderPairs.has(pairKey)) continue;
          drawnBorderPairs.add(pairKey);

          const tris = triangulateFace(face.points, cell.site.position);
          const frontColor = brightOwnerColors[ownerA];
          const backColor = brightOwnerColors[ownerB];

          for (const tri of tris) {
  borderTriPositions.push(tri[0], tri[1], tri[2]);
  borderTriFrontColors.push(frontColor, frontColor, frontColor);
  borderTriBackColors.push(backColor, backColor, backColor);

  territoryMaskTriPositions[ownerA].push(tri[0], tri[1], tri[2]);

  if (!territoryMaskTriPositions[ownerB]) {
    territoryMaskTriPositions[ownerB] = [];
  }
  territoryMaskTriPositions[ownerB].push(tri[0], tri[1], tri[2]);
}

          const ordered = orderFacePoints(face.points, polygonNormal(face.points));
          for (let i = 0; i < ordered.length; i++) {
            const a = ordered[i];
            const b = ordered[(i + 1) % ordered.length];
            borderLinePositions.push(a, b);
          }
          continue;
        }
      }

      const tris = triangulateFace(face.points, cell.site.position);
      for (const tri of tris) {
  territoryTriPositions[ownerA].push(tri[0], tri[1], tri[2]);
  territoryMaskTriPositions[ownerA].push(tri[0], tri[1], tri[2]);
}
    }
  }

  return {
  territoryTriPositions,
  territoryMaskTriPositions,
  borderTriPositions,
  borderTriFrontColors,
  borderTriBackColors,
  borderLinePositions
};
}

function serializeVoronoiCells(cells) {
  return cells.map((cell) => ({
    site: {
      id: cell.site.id ?? null,
      name: cell.site.name,
      position: cell.site.position,
      isGhost: !!cell.site.isGhost,
      regionID: cell.site.regionID ?? null
    },
    faces: cell.faces.map((face) => ({
      points: face.points,
      tag: face.tag ?? null
    }))
  }));
}

function deserializeVoronoiCells(rawCells) {
  if (!Array.isArray(rawCells)) return [];

  return rawCells.map((cell) => ({
    site: {
      ...cell.site,
      position: Array.isArray(cell.site?.position)
        ? cell.site.position.map(Number)
        : [0, 0, 0],
      isGhost: !!cell.site?.isGhost
    },
    faces: Array.isArray(cell.faces)
      ? cell.faces.map((face) => ({
          points: Array.isArray(face.points)
            ? face.points.map((point) => point.map(Number))
            : [],
          tag: face.tag ?? null
        }))
      : []
  }));
}

let progressListener = null;

export function createVoronoiComputeController({
  getStars,
  getSelectedStars,
  buildOwnerMap,
  selectionOptions = {},
  computeOptions = {},
  cacheKey = 'voronoi-cache-v1',
  cacheSignature = 'default',
  onStateChange = null
}) {
  let cells = [];
  let ownerMap = {};
  let savedAt = null;
  let busy = false;

  let progress = {
  label: 'Idle',
  value: 0
};

function emitProgress(label, value) {
  progress = { label, value };
  progressListener?.({ label, value, busy });
  onStateChange?.({
    cells,
    ownerMap,
    savedAt,
    busy,
    progress
  });
}

  function emit() {
  onStateChange?.({
    cells,
    ownerMap,
    savedAt,
    busy,
    progress
  });
}

async function loadCache() {
  try {
    const res = await fetch('/load-voronoi-cache', { cache: 'no-store' });
    if (!res.ok) return null;

    const parsed = await res.json();
    if (!parsed.ok || !parsed.data) return null;

    const payload = parsed.data;
    if (payload.signature !== cacheSignature) return null;
    if (!Array.isArray(payload.cells) || !payload.ownerMap) return null;

    return {
      cells: deserializeVoronoiCells(payload.cells),
      ownerMap: payload.ownerMap,
      savedAt: payload.savedAt || null
    };
  } catch (error) {
    console.warn('Voronoi cache load failed:', error);
    return null;
  }
}

async function saveCache(nextCells, nextOwnerMap) {
  try {
    const payload = {
      signature: cacheSignature,
      savedAt: new Date().toISOString(),
      ownerMap: nextOwnerMap,
      cells: serializeVoronoiCells(nextCells)
    };

    const res = await fetch('/save-voronoi-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return { ok: false };
    }

    const out = await res.json();
    return { ok: !!out.ok, savedAt: payload.savedAt };
  } catch (error) {
    console.warn('Voronoi cache save failed:', error);
    return { ok: false, error };
  }
}

async function clearCache() {
  try {
    await fetch('/clear-voronoi-cache', {
      method: 'POST'
    });
  } catch (error) {
    console.warn('Voronoi cache clear failed:', error);
  }
}

async function compute({ force = false } = {}) {
  if (busy) {
    return { ok: false, reason: 'busy' };
  }

  if (!force && cells.length) {
    return {
      ok: true,
      reused: true,
      cellsCount: cells.length,
      saved: false,
      savedAt
    };
  }

  const stars = getStars?.() ?? [];
  emitProgress('Collecting stars', 0.05);

  const selected = getSelectedStars?.(stars) ?? [];
  if (!selected.length) {
    return { ok: false, reason: 'no-selection' };
  }

  busy = true;
  emit();

  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    emitProgress('Building selection', 0.2);

    const selection = buildVoronoiSelection(
      stars,
      selected.map((star) => star.name),
      selectionOptions
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));

    emitProgress('Preparing solver', 0.35);

    const boundsPadding =
      typeof computeOptions.getBoundsPadding === 'function'
        ? computeOptions.getBoundsPadding(selection)
        : (computeOptions.boundsPadding ?? 160000);

    const minFaceArea = computeOptions.minFaceArea ?? 1500;

    await new Promise((resolve) => requestAnimationFrame(resolve));

    emitProgress('Solving cells', 0.65);

    const nextCells = computeVoronoiCells(selection.allSites, 0, {
      minFaceArea,
      boundsPadding
    });

    await new Promise((resolve) => requestAnimationFrame(resolve));

    emitProgress('Assigning owners', 0.82);

    const nextOwnerMap = buildOwnerMap?.(selected) ?? {};

    await new Promise((resolve) => requestAnimationFrame(resolve));

    emitProgress('Saving cache', 0.92);

    const saveResult = await saveCache(nextCells, nextOwnerMap);

    cells = nextCells;
    ownerMap = nextOwnerMap;
    savedAt = saveResult.ok ? saveResult.savedAt : null;

    emitProgress('Done', 1);

    busy = false;
    emit();

    return {
      ok: true,
      cellsCount: nextCells.length,
      saved: saveResult.ok,
      savedAt,
      localScale: selection.localScale,
      ghostCount: selection.ghosts.length
    };
  } catch (error) {
    console.error('Voronoi compute failed:', error);
    busy = false;
    emitProgress('Failed', 0);
    emit();
    return {
      ok: false,
      reason: 'error',
      error
    };
  }
}

async function restoreFromCache() {
  const cached = await loadCache();
  if (!cached) {
    return { ok: false };
  }

  cells = cached.cells;
  ownerMap = cached.ownerMap;
  savedAt = cached.savedAt;
  emit();

  return {
    ok: true,
    cellsCount: cells.length,
    savedAt
  };
}

async function clear() {
  await clearCache();
  cells = [];
  ownerMap = {};
  savedAt = null;
  emit();

  return { ok: true };
}

  return {
    compute,
    restoreFromCache,
    clear,
    getCells: () => cells,
    getOwnerMap: () => ownerMap,
    hasCells: () => cells.length > 0,
    isBusy: () => busy,
    setProgressListener: (fn) => {
    progressListener = fn;
  }
  };
}

export function renderVoronoi(regl, camera, cells, ownerMap, options = {}) {
  ensureDrawers(regl, camera);

const {
  ownerColors = {
    0: [1, 0, 0],
    1: [0, 0, 1],
    2: [0, 1, 0]
  },

  showTerritoryFaces = true,
  showBorderFaces = true,
  showBorderLines = true,

  territoryFaceAlpha = 0.14,
  borderFaceAlpha = 0.42,
  borderLineAlpha = 0.9,

  stripeOverlay = true,
  stripeSpacing = 12,
  stripeWidth = 4,
  stripeStrength = 0.55,

  borderInnerGlow = true,
  borderGlowSize = 4,
  borderGlowIntensity = 1.35
} = options;

  const {
    territoryTriPositions,
    territoryMaskTriPositions,
    borderTriPositions,
    borderTriFrontColors,
    borderTriBackColors,
    borderLinePositions
  } = collectTerritoryGeometry(cells, ownerMap, ownerColors);

// 1) Territory fill with stripes on all territory fill faces
if (showTerritoryFaces) {
  for (const [owner, positions] of Object.entries(territoryTriPositions)) {
    if (!positions.length) continue;

    drawFlatFaces({
      positions,
      count: positions.length,
      color: ownerColors[owner] ?? [1, 1, 1],
      alpha: territoryFaceAlpha,
      stripeOverlay: stripeOverlay ? 1 : 0,
      stripeSpacing,
      stripeWidth,
      stripeStrength
    });
  }
}

  // 2) Influence-style inner glow, but built from Voronoi owner masks
  if (borderInnerGlow) {
    for (const [owner, positions] of Object.entries(territoryMaskTriPositions)) {
      if (!positions.length) continue;

      maskFramebuffer.use(() => {
        regl.clear({ color: [0, 0, 0, 0], depth: 1 });
      });

      drawMaskFaces({
        positions,
        count: positions.length
      });

      blurX({ size: borderGlowSize });
      blurY({ size: borderGlowSize });

      drawGlowOverlay({
        color: ownerColors[owner] ?? [1, 1, 1],
        intensity: borderGlowIntensity
      });
    }
  }

  // 3) Shared border faces
if (showBorderFaces && borderTriPositions.length) {
  drawDualColorFaces({
    positions: borderTriPositions,
    frontColors: borderTriFrontColors,
    backColors: borderTriBackColors,
    count: borderTriPositions.length,
    alpha: borderFaceAlpha,

    stripeOverlay: stripeOverlay ? 1 : 0,
    stripeSpacing,
    stripeWidth,
    stripeStrength
  });
}

  // 4) Optional border lines
if (showBorderLines && borderLinePositions.length) {
  drawLines({
    positions: borderLinePositions,
    count: borderLinePositions.length,
    color: [1, 1, 1],
    alpha: borderLineAlpha
  });
}
}