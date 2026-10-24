import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { growStructure } from "./plant-growth.js";
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
      uvs.push(
        (k / sides) * Math.max(0.18, (radii[0] * Math.PI * 2) / 0.85) +
          points[0].x * 0.19,
        distance * 0.28 + points[0].y * 0.17 + points[0].z * 0.13,
      );
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
export function growPlant(seed, species = 0, shrub = false, age = 1) {
  const plant = growStructure(seed, species, shrub, age);
  function geometry(level) {
    const parts = plant.paths
      .filter((p) => level < 2 || p.radii[0] > (shrub ? 0.008 : 0.025))
      .map((path) => {
        const r = path.radii[0];
        const sides =
          level === 0
            ? r > 0.22
              ? 10
              : r > 0.08
                ? 7
                : r > 0.025
                  ? 5
                  : 3
            : r > 0.22
              ? 6
              : r > 0.06
                ? 4
                : 3;
        if (level === 0 || path.points.length <= 4)
          return tube(path.points, path.radii, sides);
        const indices = [
          0,
          Math.floor(path.points.length / 2),
          path.points.length - 1,
        ];
        return tube(
          indices.map((i) => path.points[i]),
          indices.map((i) => path.radii[i]),
          sides,
        );
      });
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  }
  return {
    ...plant,
    high: geometry(0),
    low: geometry(1),
    farWood: geometry(2),
  };
}
