import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./world-data.js";
// Adjacent rings share vertices: bends cannot open into separate cylinders.
function tube(points, radii, sides) {
  const positions = [],
    uvs = [],
    indices = [];
  let distance = 0,
    previousRight = new T.Vector3(1, 0, 0);
  for (let j = 0; j < points.length; j++) {
    const prev = points[Math.max(0, j - 1)],
      next = points[Math.min(points.length - 1, j + 1)],
      tangent = next.clone().sub(prev).normalize();
    const right = previousRight
      .clone()
      .addScaledVector(tangent, -previousRight.dot(tangent))
      .normalize();
    const forward = new T.Vector3().crossVectors(tangent, right).normalize();
    previousRight = right;
    if (j) distance += points[j].distanceTo(points[j - 1]);
    for (let k = 0; k <= sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const p = points[j]
        .clone()
        .addScaledVector(right, Math.cos(angle) * radii[j])
        .addScaledVector(forward, Math.sin(angle) * radii[j]);
      positions.push(...p.toArray());
      uvs.push(k / sides, distance * 0.17);
    }
    if (j)
      for (let k = 0; k < sides; k++) {
        const a = (j - 1) * (sides + 1) + k,
          b = j * (sides + 1) + k;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
  }
  // Capped ends are embedded in parent wood at forks and below the soil at roots.
  for (const j of [0, points.length - 1]) {
    const center = positions.length / 3;
    positions.push(...points[j].toArray());
    uvs.push(0.5, j ? distance * 0.17 : 0);
    for (let k = 0; k < sides; k++) {
      const a = j * (sides + 1) + k;
      if (j) indices.push(center, a, a + 1);
      else indices.push(center, a + 1, a);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function growPlant(seed, species = 0, shrub = false) {
  const rng = random(seed),
    segments = [],
    leaves = [],
    joints = [],
    paths = [];
  const tall = species === 1 ? 1.16 : species === 2 ? 1.05 : 0.92,
    spread = species === 1 ? 0.73 : species === 2 ? 0.95 : 1.1;
  function branch(start, dir, len, radius, depth) {
    let p = start.clone(),
      direction = dir.clone().normalize();
    const points = [start.clone().addScaledVector(direction, -radius * 0.7)],
      radii = [radius * 1.08];
    for (let s = 0; s < 3; s++) {
      direction
        .add(
          new T.Vector3(
            (rng() - 0.5) * 0.13,
            0.13 + (shrub ? 0.025 : 0),
            (rng() - 0.5) * 0.13,
          ),
        )
        .normalize();
      const end = p.clone().addScaledVector(direction, len / 3);
      segments.push({
        a: p.clone(),
        b: end.clone(),
        r0: radius * (1 - s * 0.25),
        r1: radius * (0.75 - s * 0.25),
      });
      p = end;
      points.push(p.clone());
      radii.push(Math.max(0.004, radius * (0.75 - s * 0.25)));
    }
    paths.push({ points, radii });
    if (depth) {
      const count = depth === 2 ? 3 : 2;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + rng() * 0.6;
        const lateral = new T.Vector3(
          Math.cos(a),
          0.25 + rng() * 0.4,
          Math.sin(a),
        );
        const next = direction
          .clone()
          .multiplyScalar(0.55)
          .addScaledVector(lateral, 0.65)
          .normalize();
        joints.push(p.clone());
        branch(p, next, len * (0.52 + rng() * 0.11), radius * 0.48, depth - 1);
      }
    } else {
      for (let k = 0; k < 7; k++) {
        const pos = p
          .clone()
          .add(
            new T.Vector3(
              (rng() - 0.5) * 0.85,
              (rng() - 0.5) * 0.6,
              (rng() - 0.5) * 0.85,
            ),
          );
        const scale = (shrub ? 0.72 : 1.75) * (0.7 + rng() * 0.45);
        leaves.push({
          p: pos.toArray(),
          r: [(rng() - 0.5) * 1.6, rng() * Math.PI * 2, (rng() - 0.5) * 1.4],
          s: [scale, scale, scale],
          c: new T.Color()
            .setHSL(0.2 + rng() * 0.025, 0.13, 0.76 + rng() * 0.13)
            .getHex(),
        });
      }
    }
  }
  if (shrub) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      branch(
        new T.Vector3(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15),
        new T.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45),
        1.05 + rng() * 0.6,
        0.075,
        2,
      );
    }
  } else {
    const trunk = [];
    for (let k = 0; k < 7; k++) {
      const p = new T.Vector3(
        Math.sin(k * 0.6 + seed) * 0.15 * k,
        k * 1.23 * tall,
        Math.cos(k * 0.43 + seed) * 0.08 * k,
      );
      trunk.push(p);
      if (k)
        segments.push({
          a: trunk[k - 1],
          b: p,
          r0: 0.46 * Math.pow(1 - (k - 1) / 8, 1.3),
          r1: 0.46 * Math.pow(1 - k / 8, 1.3),
        });
    }
    trunk[0].y = -0.35;
    paths.push({
      points: trunk,
      radii: trunk.map((_, k) => 0.46 * Math.pow(1 - k / 8, 1.3)),
    });
    for (let k = 0; k < 9; k++) {
      const u = 2 + (k % 5),
        origin = trunk[u].clone(),
        angle = k * 2.399963 + rng() * 0.5;
      const dir = new T.Vector3(
        Math.cos(angle) * spread,
        0.28 + u * 0.11,
        Math.sin(angle) * spread,
      ).normalize();
      joints.push(origin);
      branch(
        origin,
        dir,
        (3.7 - (u - 2) * 0.26) * spread,
        0.18 - (u - 2) * 0.017,
        2,
      );
    }
    branch(trunk[6], new T.Vector3(0.1, 1, 0.05), 2.2, 0.095, 2);
  }
  if (!shrub) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.1 * species;
      paths.push({
        points: [
          new T.Vector3(0, 0.48, 0),
          new T.Vector3(Math.cos(a) * 0.65, 0.06, Math.sin(a) * 0.65),
          new T.Vector3(Math.cos(a) * 1.55, -0.24, Math.sin(a) * 1.55),
        ],
        radii: [0.2, 0.11, 0.015],
      });
    }
  }
  function geometry(sides, far = false) {
    const parts = paths
      .filter((p) => !far || p.radii[0] > 0.045)
      .map((p) => tube(p.points, p.radii, sides));
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  }
  return {
    high: geometry(shrub ? 7 : 10),
    low: geometry(shrub ? 4 : 5),
    farWood: geometry(4, true),
    leaves,
    segments,
    joints,
    paths,
    species,
    shrub,
  };
}
