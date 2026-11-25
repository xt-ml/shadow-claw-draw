/**
 * .agents/scripts/shadow-claw-draw-tween.js
 *
 * Pure zero-DOM Vector Keyframe Tweening, Bezier Path Morphing & Motion Trajectory module.
 *
 * Ported concepts from Inkscape (`src/live_effects/lpe-interpolate.cpp`, GPLv2+):
 * - Elevates line/quadratic path segments to cubic Beziers
 * - Subdivides mismatched paths via de Casteljau onto matching segment counts
 * - Computes arc-length LUT along curved motion trajectory paths for constant-speed motion
 * - Interpolates transforms, geometry, colors, opacities, and morphed paths
 */

import { clamp, roundNum, deepClone } from "./shadow-claw-draw-schema.js";
import { parseHexColor, rgbaToHex } from "./shadow-claw-draw-bitmap.js";
import {
  parseSvgPathData,
  pathDataToNodes,
  nodesToPathData,
  computeElementBBox,
  normalizeVectorElement,
} from "./shadow-claw-draw-vector.js";

export function evaluateEasing(t, easing = "linear") {
  const x = clamp(Number(t) || 0, 0, 1);
  switch (easing) {
    case "ease-in":
      return x * x * x;
    case "ease-out":
      return 1 - (1 - x) ** 3;
    case "ease-in-out":
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case "step":
      return x >= 1 ? 1 : 0;
    case "linear":
    default:
      return x;
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function interpolateColor(colorA, colorB, t) {
  if (!colorA || colorA === "none") return t >= 0.5 ? colorB || "none" : "none";
  if (!colorB || colorB === "none") return t < 0.5 ? colorA : "none";
  if (String(colorA).startsWith("url(") || String(colorB).startsWith("url(")) {
    return t >= 0.5 ? colorB : colorA;
  }
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));
  return rgbaToHex(r, g, bl);
}

/**
 * De Casteljau subdivision of a cubic Bezier segment at parameter t in [0, 1].
 */
export function subdivideCubicBezier(p0, p1, p2, p3, t = 0.5) {
  const mix = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });
  const q0 = mix(p0, p1, t);
  const q1 = mix(p1, p2, t);
  const q2 = mix(p2, p3, t);
  const r0 = mix(q0, q1, t);
  const r1 = mix(q1, q2, t);
  const s = mix(r0, r1, t);
  return [
    { p0: { ...p0 }, p1: q0, p2: r0, p3: s },
    { p0: s, p1: r1, p2: q2, p3: { ...p3 } },
  ];
}

function evalCubicPoint(seg, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      mt2 * mt * seg.p0.x +
      3 * mt2 * t * seg.p1.x +
      3 * mt * t2 * seg.p2.x +
      t2 * t * seg.p3.x,
    y:
      mt2 * mt * seg.p0.y +
      3 * mt2 * t * seg.p1.y +
      3 * mt * t2 * seg.p2.y +
      t2 * t * seg.p3.y,
  };
}

function nodesToCubicSegments(nodes, closed = false) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  if (nodes.length === 1) {
    const p = { x: nodes[0].x, y: nodes[0].y };
    return [{ p0: p, p1: p, p2: p, p3: p }];
  }
  const segs = [];
  const limit = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < limit; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const p0 = { x: a.x, y: a.y };
    const p3 = { x: b.x, y: b.y };
    const p1 = a.handleOut
      ? { x: a.handleOut.x, y: a.handleOut.y }
      : { x: lerp(p0.x, p3.x, 1 / 3), y: lerp(p0.y, p3.y, 1 / 3) };
    const p2 = b.handleIn
      ? { x: b.handleIn.x, y: b.handleIn.y }
      : { x: lerp(p0.x, p3.x, 2 / 3), y: lerp(p0.y, p3.y, 2 / 3) };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}

function subdivideSegmentsToCount(segs, targetCount) {
  const out = segs.map((s) => ({
    p0: { ...s.p0 },
    p1: { ...s.p1 },
    p2: { ...s.p2 },
    p3: { ...s.p3 },
  }));
  while (out.length < targetCount && out.length > 0) {
    // Split longest chord segment for balanced Inkscape-like distribution
    let maxIdx = 0;
    let maxLen = -1;
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      const len = Math.hypot(s.p3.x - s.p0.x, s.p3.y - s.p0.y);
      if (len > maxLen) {
        maxLen = len;
        maxIdx = i;
      }
    }
    const [left, right] = subdivideCubicBezier(
      out[maxIdx].p0,
      out[maxIdx].p1,
      out[maxIdx].p2,
      out[maxIdx].p3,
      0.5,
    );
    out.splice(maxIdx, 1, left, right);
  }
  return out;
}

function cubicSegmentsToNodes(segs, closed = false) {
  if (!segs || segs.length === 0) return [];
  const nodes = [];
  const count = closed ? segs.length : segs.length + 1;
  for (let i = 0; i < count; i++) {
    const prevSeg = i > 0 ? segs[i - 1] : closed ? segs[segs.length - 1] : null;
    const nextSeg = i < segs.length ? segs[i] : null;
    const anchor = nextSeg ? nextSeg.p0 : prevSeg.p3;
    nodes.push({
      x: roundNum(anchor.x),
      y: roundNum(anchor.y),
      type: "corner",
      handleIn: prevSeg
        ? { x: roundNum(prevSeg.p2.x), y: roundNum(prevSeg.p2.y) }
        : null,
      handleOut: nextSeg
        ? { x: roundNum(nextSeg.p1.x), y: roundNum(nextSeg.p1.y) }
        : null,
    });
  }
  return nodes;
}

/**
 * Align two vector paths onto identical cubic Bezier segment counts (Inkscape LPE Interpolate style).
 */
export function alignCubicPaths(nodesA, closedA, nodesB, closedB) {
  const segsA = nodesToCubicSegments(nodesA, closedA);
  const segsB = nodesToCubicSegments(nodesB, closedB);
  const target = Math.max(segsA.length, segsB.length, 1);
  return {
    segmentsA: subdivideSegmentsToCount(segsA, target),
    segmentsB: subdivideSegmentsToCount(segsB, target),
  };
}

/**
 * Sample an SVG path string at t in [0, 1] with optional equidistant arc-length parametrization.
 */
export function sampleTrajectoryPath(pathData, t, equidistant = true) {
  const u = clamp(Number(t) || 0, 0, 1);
  if (!pathData || typeof pathData !== "string") return { x: 0, y: 0 };
  const parsed = pathDataToNodes(pathData);
  const segs = nodesToCubicSegments(parsed.nodes, parsed.closed);
  if (segs.length === 0) return { x: 0, y: 0 };

  if (!equidistant) {
    const scaled = u * segs.length;
    const idx = Math.min(segs.length - 1, Math.floor(scaled));
    const localT = scaled - idx;
    return evalCubicPoint(segs[idx], localT);
  }

  const samplesPerSeg = 16;
  const pts = [];
  const cumLen = [0];
  let totalLen = 0;

  for (let s = 0; s < segs.length; s++) {
    for (let k = s === 0 ? 0 : 1; k <= samplesPerSeg; k++) {
      const p = evalCubicPoint(segs[s], k / samplesPerSeg);
      if (pts.length > 0) {
        const prev = pts[pts.length - 1];
        totalLen += Math.hypot(p.x - prev.x, p.y - prev.y);
        cumLen.push(totalLen);
      }
      pts.push(p);
    }
  }

  if (totalLen <= 1e-6) return pts[0] || { x: 0, y: 0 };
  const targetDist = u * totalLen;
  let lo = 0;
  let hi = cumLen.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] <= targetDist) lo = mid;
    else hi = mid;
  }
  const span = cumLen[hi] - cumLen[lo];
  const frac = span > 1e-9 ? (targetDist - cumLen[lo]) / span : 0;
  return {
    x: roundNum(lerp(pts[lo].x, pts[hi].x, frac)),
    y: roundNum(lerp(pts[lo].y, pts[hi].y, frac)),
  };
}

export function interpolateVectorElement(
  elA,
  elB,
  t,
  { trajectoryOffset = null } = {},
) {
  const u = clamp(Number(t) || 0, 0, 1);
  if (!elA) return deepClone(elB);
  if (!elB) return deepClone(elA);

  const out = deepClone(u >= 0.5 ? elB : elA);
  out.id = elA.id;
  out.opacity = roundNum(lerp(elA.opacity ?? 1, elB.opacity ?? 1, u));
  out.fillOpacity = roundNum(
    lerp(elA.fillOpacity ?? 1, elB.fillOpacity ?? 1, u),
  );
  out.strokeOpacity = roundNum(
    lerp(elA.strokeOpacity ?? 1, elB.strokeOpacity ?? 1, u),
  );
  out.strokeWidth = roundNum(
    lerp(elA.strokeWidth ?? 2, elB.strokeWidth ?? 2, u),
  );
  out.fill = interpolateColor(elA.fill, elB.fill, u);
  out.stroke = interpolateColor(elA.stroke, elB.stroke, u);

  const tA = elA.transform || {};
  const tB = elB.transform || {};
  out.transform = {
    tx: roundNum(lerp(tA.tx ?? 0, tB.tx ?? 0, u) + (trajectoryOffset?.x || 0)),
    ty: roundNum(lerp(tA.ty ?? 0, tB.ty ?? 0, u) + (trajectoryOffset?.y || 0)),
    rotate: roundNum(lerp(tA.rotate ?? 0, tB.rotate ?? 0, u)),
    scaleX: roundNum(lerp(tA.scaleX ?? 1, tB.scaleX ?? 1, u)),
    scaleY: roundNum(lerp(tA.scaleY ?? 1, tB.scaleY ?? 1, u)),
  };

  if (elA.type === elB.type) {
    const numKeys = [
      "x",
      "y",
      "width",
      "height",
      "rx",
      "ry",
      "cx",
      "cy",
      "r",
      "x1",
      "y1",
      "x2",
      "y2",
      "fontSize",
    ];
    for (const k of numKeys) {
      if (typeof elA[k] === "number" && typeof elB[k] === "number") {
        out[k] = roundNum(lerp(elA[k], elB[k], u));
      }
    }

    if (
      (elA.type === "polygon" ||
        elA.type === "star" ||
        elA.type === "polyline") &&
      Array.isArray(elA.points) &&
      Array.isArray(elB.points) &&
      elA.points.length === elB.points.length
    ) {
      out.points = elA.points.map((pa, idx) => ({
        x: roundNum(lerp(pa.x, elB.points[idx].x, u)),
        y: roundNum(lerp(pa.y, elB.points[idx].y, u)),
      }));
    }

    if (elA.type === "path") {
      const nodesA =
        Array.isArray(elA.nodes) && elA.nodes.length > 0
          ? elA.nodes
          : pathDataToNodes(elA.d || "").nodes;
      const nodesB =
        Array.isArray(elB.nodes) && elB.nodes.length > 0
          ? elB.nodes
          : pathDataToNodes(elB.d || "").nodes;
      if (nodesA.length > 0 && nodesB.length > 0) {
        const closed = Boolean(elA.closed || elB.closed);
        const { segmentsA, segmentsB } = alignCubicPaths(
          nodesA,
          Boolean(elA.closed),
          nodesB,
          Boolean(elB.closed),
        );
        const blendedSegs = segmentsA.map((sa, idx) => {
          const sb = segmentsB[idx];
          return {
            p0: { x: lerp(sa.p0.x, sb.p0.x, u), y: lerp(sa.p0.y, sb.p0.y, u) },
            p1: { x: lerp(sa.p1.x, sb.p1.x, u), y: lerp(sa.p1.y, sb.p1.y, u) },
            p2: { x: lerp(sa.p2.x, sb.p2.x, u), y: lerp(sa.p2.y, sb.p2.y, u) },
            p3: { x: lerp(sa.p3.x, sb.p3.x, u), y: lerp(sa.p3.y, sb.p3.y, u) },
          };
        });
        out.nodes = cubicSegmentsToNodes(blendedSegs, closed);
        out.closed = closed;
        out.d = nodesToPathData(out.nodes, closed);
      }
    }

    if (
      elA.type === "group" &&
      Array.isArray(elA.children) &&
      Array.isArray(elB.children)
    ) {
      const mapB = new Map(elB.children.map((c) => [c.id, c]));
      out.children = elA.children.map((ca) => {
        const cb = mapB.get(ca.id);
        return cb
          ? interpolateVectorElement(ca, cb, u)
          : {
              ...deepClone(ca),
              opacity: roundNum((ca.opacity ?? 1) * (1 - u)),
            };
      });
    }
  }

  return normalizeVectorElement(out);
}

/**
 * Interpolate two Vector Studio documents at normalized time t in [0, 1].
 */
export function interpolateVectorDocuments(
  docA,
  docB,
  t,
  { easing = "linear", trajectoryPath = "", equidistant = true } = {},
) {
  const u = evaluateEasing(t, easing);
  const out = deepClone(docA);

  let trajectoryOffset = null;
  if (trajectoryPath) {
    const p0 = sampleTrajectoryPath(trajectoryPath, 0, equidistant);
    const pu = sampleTrajectoryPath(trajectoryPath, u, equidistant);
    const p1 = sampleTrajectoryPath(trajectoryPath, 1, equidistant);
    // Offset relative to straight-line interpolation between trajectory endpoints
    const linearX = lerp(p0.x, p1.x, u);
    const linearY = lerp(p0.y, p1.y, u);
    trajectoryOffset = {
      x: roundNum(pu.x - linearX),
      y: roundNum(pu.y - linearY),
    };
  }

  const byIdB = new Map();
  for (const layer of docB?.layers || []) {
    for (const item of layer.items || []) {
      byIdB.set(item.id, item);
    }
  }
  const seenIds = new Set();

  out.layers = (docA?.layers || []).map((layerA, lIdx) => {
    const layerB = docB?.layers?.[lIdx];
    const items = [];
    for (const elA of layerA.items || []) {
      seenIds.add(elA.id);
      const elB = byIdB.get(elA.id);
      if (elB) {
        items.push(interpolateVectorElement(elA, elB, u, { trajectoryOffset }));
      } else {
        const fade = deepClone(elA);
        fade.opacity = roundNum((elA.opacity ?? 1) * (1 - u));
        items.push(fade);
      }
    }
    if (layerB) {
      for (const elB of layerB.items || []) {
        if (!seenIds.has(elB.id)) {
          seenIds.add(elB.id);
          const fadeIn = deepClone(elB);
          fadeIn.opacity = roundNum((elB.opacity ?? 1) * u);
          items.push(fadeIn);
        }
      }
    }
    return {
      ...layerA,
      opacity: layerB
        ? roundNum(lerp(layerA.opacity ?? 1, layerB.opacity ?? 1, u))
        : layerA.opacity,
      items,
    };
  });

  return out;
}
