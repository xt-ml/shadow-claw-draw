/**
 * .agents/scripts/shadow-claw-draw-vector.js
 *
 * Pure zero-DOM Vector Document Model, Transactional Reducer, Bezier Node Math,
 * Alignment/Distribution, and Geometry Helpers for ShadowClaw Draw.
 *
 * Ported concepts from Inkscape (GNU GPLv2+/GPLv3):
 * - Object & layer hierarchy (src/object/sp-object*, object-set.cpp)
 * - Bezier node editing & handle constraints (src/ui/tools/node-tool.cpp)
 * - Freehand smoothing & simplification (src/ui/tools/pencil-tool.cpp)
 * - Geometric shapes, stars/polygons, align & distribute (rect-tool, star-tool)
 */

import {
  VECTOR_SCHEMA_VERSION,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_VECTOR_BACKGROUND,
  DEFAULT_STYLE,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
  BLEND_MODES,
  clamp,
  roundNum,
  createUid,
  deepClone,
} from "./shadow-claw-draw-schema.js";

/**
 * Parse an SVG path `d` attribute into normalized absolute commands
 * (`M`, `L`, `H`, `V`, `C`, `Q`, `Z`).
 */
export function parseSvgPathData(d) {
  if (!d || typeof d !== "string") return [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return [];

  const commands = [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  const isCmd = (tok) => /^[a-zA-Z]$/.test(tok);
  const nextNum = () => {
    if (i >= tokens.length || isCmd(tokens[i])) return null;
    const n = parseFloat(tokens[i++]);
    return Number.isFinite(n) ? n : 0;
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i++];
    } else if (!cmd) {
      i++;
      continue;
    }

    const upper = cmd.toUpperCase();
    const isRel = cmd !== upper;

    if (upper === "Z") {
      commands.push({ cmd: "Z", values: [] });
      cx = sx;
      cy = sy;
      cmd = "";
      continue;
    }

    if (upper === "M") {
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      cx = isRel ? cx + x : x;
      cy = isRel ? cy + y : y;
      sx = cx;
      sy = cy;
      commands.push({ cmd: "M", values: [roundNum(cx), roundNum(cy)] });
      cmd = isRel ? "l" : "L";
      continue;
    }

    if (upper === "L") {
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      cx = isRel ? cx + x : x;
      cy = isRel ? cy + y : y;
      commands.push({ cmd: "L", values: [roundNum(cx), roundNum(cy)] });
      continue;
    }

    if (upper === "H") {
      const x = nextNum();
      if (x === null) break;
      cx = isRel ? cx + x : x;
      commands.push({ cmd: "H", values: [roundNum(cx)] });
      continue;
    }

    if (upper === "V") {
      const y = nextNum();
      if (y === null) break;
      cy = isRel ? cy + y : y;
      commands.push({ cmd: "V", values: [roundNum(cy)] });
      continue;
    }

    if (upper === "C") {
      const x1 = nextNum();
      const y1 = nextNum();
      const x2 = nextNum();
      const y2 = nextNum();
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      const ax1 = isRel ? cx + x1 : x1;
      const ay1 = isRel ? cy + y1 : y1;
      const ax2 = isRel ? cx + x2 : x2;
      const ay2 = isRel ? cy + y2 : y2;
      const ax = isRel ? cx + x : x;
      const ay = isRel ? cy + y : y;
      cx = ax;
      cy = ay;
      commands.push({
        cmd: "C",
        values: [
          roundNum(ax1),
          roundNum(ay1),
          roundNum(ax2),
          roundNum(ay2),
          roundNum(ax),
          roundNum(ay),
        ],
      });
      continue;
    }

    if (upper === "S") {
      const x2 = nextNum();
      const y2 = nextNum();
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      const prev = commands.at(-1);
      let ax1 = cx;
      let ay1 = cy;
      if (prev && prev.cmd === "C") {
        ax1 = 2 * cx - prev.values[2];
        ay1 = 2 * cy - prev.values[3];
      }
      const ax2 = isRel ? cx + x2 : x2;
      const ay2 = isRel ? cy + y2 : y2;
      const ax = isRel ? cx + x : x;
      const ay = isRel ? cy + y : y;
      cx = ax;
      cy = ay;
      commands.push({
        cmd: "C",
        values: [
          roundNum(ax1),
          roundNum(ay1),
          roundNum(ax2),
          roundNum(ay2),
          roundNum(ax),
          roundNum(ay),
        ],
      });
      continue;
    }

    if (upper === "Q") {
      const x1 = nextNum();
      const y1 = nextNum();
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) break;
      const ax1 = isRel ? cx + x1 : x1;
      const ay1 = isRel ? cy + y1 : y1;
      const ax = isRel ? cx + x : x;
      const ay = isRel ? cy + y : y;
      cx = ax;
      cy = ay;
      commands.push({
        cmd: "Q",
        values: [roundNum(ax1), roundNum(ay1), roundNum(ax), roundNum(ay)],
      });
      continue;
    }

    // Fallback for unsupported/extra tokens (e.g. T or A)
    const fallbackNum = nextNum();
    if (fallbackNum === null) break;
  }

  return commands;
}

/**
 * Format normalized path commands back into an SVG `d` string.
 */
export function formatSvgPathData(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return "";
  return commands
    .map((c) => {
      if (c.cmd === "Z") return "Z";
      return `${c.cmd} ${c.values.map((v) => roundNum(v)).join(" ")}`;
    })
    .join(" ");
}

/**
 * Convert editable bezier nodes to SVG `d` string.
 */
export function nodesToPathData(nodes, closed = false) {
  if (!Array.isArray(nodes) || nodes.length === 0) return "";
  const parts = [`M ${roundNum(nodes[0].x)} ${roundNum(nodes[0].y)}`];

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev.handleOut || curr.handleIn) {
      const c1 = prev.handleOut || { x: prev.x, y: prev.y };
      const c2 = curr.handleIn || { x: curr.x, y: curr.y };
      parts.push(
        `C ${roundNum(c1.x)} ${roundNum(c1.y)} ${roundNum(c2.x)} ${roundNum(c2.y)} ${roundNum(curr.x)} ${roundNum(curr.y)}`,
      );
    } else {
      parts.push(`L ${roundNum(curr.x)} ${roundNum(curr.y)}`);
    }
  }

  if (closed && nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut || { x: last.x, y: last.y };
      const c2 = first.handleIn || { x: first.x, y: first.y };
      parts.push(
        `C ${roundNum(c1.x)} ${roundNum(c1.y)} ${roundNum(c2.x)} ${roundNum(c2.y)} ${roundNum(first.x)} ${roundNum(first.y)}`,
      );
    }
    parts.push("Z");
  }

  return parts.join(" ");
}

/**
 * Convert an SVG `d` string into editable bezier nodes + closed flag.
 */
export function pathDataToNodes(d) {
  const cmds = parseSvgPathData(d);
  const nodes = [];
  let closed = false;
  let cx = 0;
  let cy = 0;

  for (const c of cmds) {
    if (c.cmd === "M") {
      cx = c.values[0];
      cy = c.values[1];
      nodes.push({
        x: cx,
        y: cy,
        handleIn: null,
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "L") {
      cx = c.values[0];
      cy = c.values[1];
      nodes.push({
        x: cx,
        y: cy,
        handleIn: null,
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "H") {
      cx = c.values[0];
      nodes.push({
        x: cx,
        y: cy,
        handleIn: null,
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "V") {
      cy = c.values[0];
      nodes.push({
        x: cx,
        y: cy,
        handleIn: null,
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "C") {
      const [x1, y1, x2, y2, x, y] = c.values;
      if (nodes.length > 0) {
        nodes[nodes.length - 1].handleOut = { x: x1, y: y1 };
      }
      cx = x;
      cy = y;
      nodes.push({
        x: cx,
        y: cy,
        handleIn: { x: x2, y: y2 },
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "Q") {
      const [qx, qy, x, y] = c.values;
      const prev = nodes[nodes.length - 1] || { x: cx, y: cy };
      const c1x = roundNum(prev.x + (2 / 3) * (qx - prev.x));
      const c1y = roundNum(prev.y + (2 / 3) * (qy - prev.y));
      const c2x = roundNum(x + (2 / 3) * (qx - x));
      const c2y = roundNum(y + (2 / 3) * (qy - y));
      if (nodes.length > 0) {
        nodes[nodes.length - 1].handleOut = { x: c1x, y: c1y };
      }
      cx = x;
      cy = y;
      nodes.push({
        x: cx,
        y: cy,
        handleIn: { x: c2x, y: c2y },
        handleOut: null,
        mode: "cusp",
      });
    } else if (c.cmd === "Z") {
      closed = true;
    }
  }

  return { nodes, closed };
}

export function snapValue(value, gridSize = 16, enabled = true) {
  const n = Number(value) || 0;
  if (!enabled || !gridSize || gridSize <= 0) return roundNum(n);
  return roundNum(Math.round(n / gridSize) * gridSize);
}

export function createRegularPolygonPoints(
  cx,
  cy,
  radius,
  sides = 6,
  rotationDeg = -90,
) {
  const count = Math.max(3, Math.round(Number(sides) || 6));
  const r = Math.max(1, Number(radius) || 50);
  const startRad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = startRad + (i * 2 * Math.PI) / count;
    pts.push({
      x: roundNum(cx + r * Math.cos(angle)),
      y: roundNum(cy + r * Math.sin(angle)),
    });
  }
  return pts;
}

export function createStarPoints(
  cx,
  cy,
  outerRadius,
  innerRadius,
  pointsCount = 5,
  rotationDeg = -90,
) {
  const spikes = Math.max(3, Math.round(Number(pointsCount) || 5));
  const rOut = Math.max(2, Number(outerRadius) || 50);
  const rIn = Math.max(1, Number(innerRadius) || rOut * 0.45);
  const startRad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const pts = [];
  const total = spikes * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const angle = startRad + (i * Math.PI) / spikes;
    pts.push({
      x: roundNum(cx + r * Math.cos(angle)),
      y: roundNum(cy + r * Math.sin(angle)),
    });
  }
  return pts;
}

function perpendicularDistance(pt, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const magSq = dx * dx + dy * dy;
  if (magSq === 0) {
    return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
  }
  const num = Math.abs(
    dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  );
  return num / Math.sqrt(magSq);
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 */
export function simplifyPoints(points, tolerance = 1.5) {
  if (!Array.isArray(points) || points.length <= 2) {
    return Array.isArray(points) ? points.slice() : [];
  }
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Smooth freehand polyline into quadratic midpoint bezier SVG path.
 */
export function pointsToSmoothSvgPath(points, closed = false) {
  if (!Array.isArray(points) || points.length === 0) return "";
  if (points.length === 1) {
    return `M ${roundNum(points[0].x)} ${roundNum(points[0].y)}`;
  }
  if (points.length === 2) {
    return `M ${roundNum(points[0].x)} ${roundNum(points[0].y)} L ${roundNum(points[1].x)} ${roundNum(points[1].y)}${closed ? " Z" : ""}`;
  }

  const parts = [`M ${roundNum(points[0].x)} ${roundNum(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const midX = roundNum((points[i].x + points[i + 1].x) / 2);
    const midY = roundNum((points[i].y + points[i + 1].y) / 2);
    parts.push(
      `Q ${roundNum(points[i].x)} ${roundNum(points[i].y)} ${midX} ${midY}`,
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${roundNum(last.x)} ${roundNum(last.y)}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

export function createVectorLayer(options = {}) {
  return {
    id: options.id || createUid("layer"),
    name: String(options.name || "Layer"),
    visible: options.visible !== false,
    locked: Boolean(options.locked),
    opacity: clamp(options.opacity ?? 1, 0, 1),
    blendMode: BLEND_MODES.includes(options.blendMode)
      ? options.blendMode
      : "normal",
    items: Array.isArray(options.items) ? options.items : [],
  };
}

export function createVectorDocument({
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
  background = DEFAULT_VECTOR_BACKGROUND,
  name = "Untitled Vector",
} = {}) {
  const w = clamp(width, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
  const h = clamp(height, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
  return {
    schemaVersion: VECTOR_SCHEMA_VERSION,
    name: String(name || "Untitled Vector"),
    width: w,
    height: h,
    background: String(background || DEFAULT_VECTOR_BACKGROUND),
    viewBox: { x: 0, y: 0, width: w, height: h },
    defs: { gradients: [] },
    layers: [
      createVectorLayer({
        id: "layer_1",
        name: "Layer 1",
      }),
    ],
  };
}

export function normalizeVectorElement(raw = {}) {
  const type = raw.type || "rect";
  const base = {
    id: raw.id || createUid("el"),
    type,
    name: raw.name || `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    fill: raw.fill !== undefined ? String(raw.fill) : DEFAULT_STYLE.fill,
    stroke:
      raw.stroke !== undefined ? String(raw.stroke) : DEFAULT_STYLE.stroke,
    strokeWidth: clamp(raw.strokeWidth ?? DEFAULT_STYLE.strokeWidth, 0, 200),
    fillOpacity: clamp(raw.fillOpacity ?? 1, 0, 1),
    strokeOpacity: clamp(raw.strokeOpacity ?? 1, 0, 1),
    strokeDasharray:
      raw.strokeDasharray !== undefined ? String(raw.strokeDasharray) : "",
    strokeLinecap: raw.strokeLinecap || DEFAULT_STYLE.strokeLinecap,
    strokeLinejoin: raw.strokeLinejoin || DEFAULT_STYLE.strokeLinejoin,
    opacity: clamp(raw.opacity ?? 1, 0, 1),
    visible: raw.visible !== false,
    locked: Boolean(raw.locked),
    transform: {
      tx: Number(raw.transform?.tx ?? 0) || 0,
      ty: Number(raw.transform?.ty ?? 0) || 0,
      rotate: Number(raw.transform?.rotate ?? 0) || 0,
      scaleX: Number(raw.transform?.scaleX ?? 1) || 1,
      scaleY: Number(raw.transform?.scaleY ?? 1) || 1,
    },
  };

  if (type === "rect") {
    return {
      ...base,
      x: roundNum(raw.x ?? 0),
      y: roundNum(raw.y ?? 0),
      width: Math.max(0, roundNum(raw.width ?? 100)),
      height: Math.max(0, roundNum(raw.height ?? 80)),
      rx: Math.max(0, roundNum(raw.rx ?? 0)),
      ry: Math.max(0, roundNum(raw.ry ?? raw.rx ?? 0)),
    };
  }
  if (type === "ellipse") {
    return {
      ...base,
      cx: roundNum(raw.cx ?? 100),
      cy: roundNum(raw.cy ?? 100),
      rx: Math.max(0, roundNum(raw.rx ?? 50)),
      ry: Math.max(0, roundNum(raw.ry ?? 35)),
    };
  }
  if (type === "circle") {
    return {
      ...base,
      cx: roundNum(raw.cx ?? 100),
      cy: roundNum(raw.cy ?? 100),
      r: Math.max(0, roundNum(raw.r ?? 40)),
    };
  }
  if (type === "line") {
    return {
      ...base,
      fill: "none",
      x1: roundNum(raw.x1 ?? 0),
      y1: roundNum(raw.y1 ?? 0),
      x2: roundNum(raw.x2 ?? 100),
      y2: roundNum(raw.y2 ?? 100),
    };
  }
  if (type === "polygon") {
    const sides = Math.max(3, Math.round(raw.sides ?? 6));
    const cx = roundNum(raw.cx ?? 100);
    const cy = roundNum(raw.cy ?? 100);
    const radius = Math.max(1, roundNum(raw.radius ?? 50));
    const points = Array.isArray(raw.points)
      ? raw.points.map((p) => ({ x: roundNum(p.x), y: roundNum(p.y) }))
      : createRegularPolygonPoints(cx, cy, radius, sides, raw.rotation ?? -90);
    return { ...base, cx, cy, radius, sides, points };
  }
  if (type === "star") {
    const pointsCount = Math.max(3, Math.round(raw.pointsCount ?? 5));
    const cx = roundNum(raw.cx ?? 100);
    const cy = roundNum(raw.cy ?? 100);
    const outerRadius = Math.max(2, roundNum(raw.outerRadius ?? 50));
    const innerRadius = Math.max(
      1,
      roundNum(raw.innerRadius ?? outerRadius * 0.45),
    );
    const points = Array.isArray(raw.points)
      ? raw.points.map((p) => ({ x: roundNum(p.x), y: roundNum(p.y) }))
      : createStarPoints(
          cx,
          cy,
          outerRadius,
          innerRadius,
          pointsCount,
          raw.rotation ?? -90,
        );
    return { ...base, cx, cy, outerRadius, innerRadius, pointsCount, points };
  }
  if (type === "polyline") {
    const points = Array.isArray(raw.points)
      ? raw.points.map((p) => ({ x: roundNum(p.x), y: roundNum(p.y) }))
      : [];
    return {
      ...base,
      fill: raw.fill !== undefined ? String(raw.fill) : "none",
      points,
    };
  }
  if (type === "path") {
    let nodes = Array.isArray(raw.nodes) ? deepClone(raw.nodes) : null;
    let closed = Boolean(raw.closed);
    let d = typeof raw.d === "string" ? raw.d : "";
    if (nodes && !d) {
      d = nodesToPathData(nodes, closed);
    } else if (d && !nodes) {
      const parsed = pathDataToNodes(d);
      nodes = parsed.nodes;
      closed = parsed.closed;
    } else if (!nodes) {
      nodes = [];
    }
    return {
      ...base,
      fill: raw.fill !== undefined ? String(raw.fill) : "none",
      d,
      nodes,
      closed,
    };
  }
  if (type === "text") {
    return {
      ...base,
      fill: raw.fill !== undefined ? String(raw.fill) : "#0f172a",
      stroke: raw.stroke !== undefined ? String(raw.stroke) : "none",
      strokeWidth: clamp(raw.strokeWidth ?? 0, 0, 50),
      x: roundNum(raw.x ?? 40),
      y: roundNum(raw.y ?? 60),
      text: String(raw.text ?? "Text"),
      fontFamily: String(raw.fontFamily || "sans-serif"),
      fontSize: clamp(raw.fontSize ?? 24, 4, 512),
      fontWeight: String(raw.fontWeight || "600"),
      textAnchor: String(raw.textAnchor || "start"),
    };
  }
  if (type === "image") {
    return {
      ...base,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
      x: roundNum(raw.x ?? 0),
      y: roundNum(raw.y ?? 0),
      width: Math.max(1, roundNum(raw.width ?? 256)),
      height: Math.max(1, roundNum(raw.height ?? 256)),
      href: String(raw.href || ""),
      preserveAspectRatio: String(raw.preserveAspectRatio || "xMidYMid meet"),
    };
  }
  if (type === "group") {
    return {
      ...base,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
      children: Array.isArray(raw.children)
        ? raw.children.map((c) => normalizeVectorElement(c))
        : [],
    };
  }
  return base;
}

export function computeElementBBox(el) {
  if (!el) return { x: 0, y: 0, width: 0, height: 0 };
  const tx = Number(el.transform?.tx ?? 0) || 0;
  const ty = Number(el.transform?.ty ?? 0) || 0;
  let box;

  switch (el.type) {
    case "rect":
    case "image":
      box = { x: el.x, y: el.y, width: el.width, height: el.height };
      break;
    case "ellipse":
      box = {
        x: el.cx - el.rx,
        y: el.cy - el.ry,
        width: el.rx * 2,
        height: el.ry * 2,
      };
      break;
    case "circle":
      box = {
        x: el.cx - el.r,
        y: el.cy - el.r,
        width: el.r * 2,
        height: el.r * 2,
      };
      break;
    case "line": {
      const minX = Math.min(el.x1, el.x2);
      const minY = Math.min(el.y1, el.y2);
      box = {
        x: minX,
        y: minY,
        width: Math.abs(el.x2 - el.x1),
        height: Math.abs(el.y2 - el.y1),
      };
      break;
    }
    case "polygon":
    case "star":
    case "polyline": {
      const pts = el.points || [];
      if (pts.length === 0) {
        box = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      break;
    }
    case "path": {
      const cmds = parseSvgPathData(el.d);
      const xs = [];
      const ys = [];
      for (const c of cmds) {
        if (c.cmd === "M" || c.cmd === "L") {
          xs.push(c.values[0]);
          ys.push(c.values[1]);
        } else if (c.cmd === "H") {
          xs.push(c.values[0]);
        } else if (c.cmd === "V") {
          ys.push(c.values[0]);
        } else if (c.cmd === "C") {
          xs.push(c.values[0], c.values[2], c.values[4]);
          ys.push(c.values[1], c.values[3], c.values[5]);
        } else if (c.cmd === "Q") {
          xs.push(c.values[0], c.values[2]);
          ys.push(c.values[1], c.values[3]);
        }
      }
      if (xs.length === 0 || ys.length === 0) {
        box = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        box = {
          x: minX,
          y: minY,
          width: Math.max(...xs) - minX,
          height: Math.max(...ys) - minY,
        };
      }
      break;
    }
    case "text": {
      const size = el.fontSize || 24;
      const w = Math.max(size, (el.text || "").length * size * 0.58);
      let x = el.x;
      if (el.textAnchor === "middle") x -= w / 2;
      else if (el.textAnchor === "end") x -= w;
      box = { x, y: el.y - size * 0.85, width: w, height: size * 1.15 };
      break;
    }
    case "group": {
      box = computeSelectionBBox(el.children || []);
      break;
    }
    default:
      box = { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: roundNum(box.x + tx),
    y: roundNum(box.y + ty),
    width: roundNum(box.width),
    height: roundNum(box.height),
  };
}

export function computeSelectionBBox(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const b = computeElementBBox(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: roundNum(minX),
    y: roundNum(minY),
    width: roundNum(maxX - minX),
    height: roundNum(maxY - minY),
  };
}

export function hitTestPoint(el, px, py, padding = 4) {
  if (!el || el.visible === false || el.locked) return false;
  const b = computeElementBBox(el);
  return (
    px >= b.x - padding &&
    px <= b.x + b.width + padding &&
    py >= b.y - padding &&
    py <= b.y + b.height + padding
  );
}

export function translateElement(el, dx, dy) {
  if (!dx && !dy) return el;
  if (el.type === "rect" || el.type === "text" || el.type === "image") {
    el.x = roundNum(el.x + dx);
    el.y = roundNum(el.y + dy);
  } else if (el.type === "ellipse" || el.type === "circle") {
    el.cx = roundNum(el.cx + dx);
    el.cy = roundNum(el.cy + dy);
  } else if (el.type === "line") {
    el.x1 = roundNum(el.x1 + dx);
    el.y1 = roundNum(el.y1 + dy);
    el.x2 = roundNum(el.x2 + dx);
    el.y2 = roundNum(el.y2 + dy);
  } else if (
    el.type === "polygon" ||
    el.type === "star" ||
    el.type === "polyline"
  ) {
    if (typeof el.cx === "number") el.cx = roundNum(el.cx + dx);
    if (typeof el.cy === "number") el.cy = roundNum(el.cy + dy);
    el.points = (el.points || []).map((p) => ({
      x: roundNum(p.x + dx),
      y: roundNum(p.y + dy),
    }));
  } else if (el.type === "path") {
    if (Array.isArray(el.nodes) && el.nodes.length > 0) {
      el.nodes = el.nodes.map((n) => ({
        ...n,
        x: roundNum(n.x + dx),
        y: roundNum(n.y + dy),
        handleIn: n.handleIn
          ? { x: roundNum(n.handleIn.x + dx), y: roundNum(n.handleIn.y + dy) }
          : null,
        handleOut: n.handleOut
          ? { x: roundNum(n.handleOut.x + dx), y: roundNum(n.handleOut.y + dy) }
          : null,
      }));
      el.d = nodesToPathData(el.nodes, el.closed);
    } else {
      const cmds = parseSvgPathData(el.d).map((c) => {
        if (c.cmd === "M" || c.cmd === "L") {
          return { cmd: c.cmd, values: [c.values[0] + dx, c.values[1] + dy] };
        }
        if (c.cmd === "H") return { cmd: "H", values: [c.values[0] + dx] };
        if (c.cmd === "V") return { cmd: "V", values: [c.values[0] + dy] };
        if (c.cmd === "C") {
          return {
            cmd: "C",
            values: [
              c.values[0] + dx,
              c.values[1] + dy,
              c.values[2] + dx,
              c.values[3] + dy,
              c.values[4] + dx,
              c.values[5] + dy,
            ],
          };
        }
        if (c.cmd === "Q") {
          return {
            cmd: "Q",
            values: [
              c.values[0] + dx,
              c.values[1] + dy,
              c.values[2] + dx,
              c.values[3] + dy,
            ],
          };
        }
        return c;
      });
      el.d = formatSvgPathData(cmds);
    }
  } else if (el.type === "group") {
    el.children = (el.children || []).map((c) => translateElement(c, dx, dy));
  }
  return el;
}

function findElementLocation(doc, id) {
  for (const layer of doc.layers) {
    const idx = layer.items.findIndex((item) => item.id === id);
    if (idx !== -1) {
      return {
        layer,
        items: layer.items,
        index: idx,
        element: layer.items[idx],
      };
    }
    for (const item of layer.items) {
      if (item.type === "group" && Array.isArray(item.children)) {
        const cIdx = item.children.findIndex((c) => c.id === id);
        if (cIdx !== -1) {
          return {
            layer,
            items: item.children,
            index: cIdx,
            element: item.children[cIdx],
            parentGroup: item,
          };
        }
      }
    }
  }
  return null;
}

function assertLayerUnlocked(layer) {
  if (layer && layer.locked) {
    throw new Error(`Layer "${layer.name}" (${layer.id}) is locked.`);
  }
}

export function findAllElements(doc) {
  const all = [];
  for (const layer of doc.layers || []) {
    for (const item of layer.items || []) {
      all.push(item);
    }
  }
  return all;
}

/**
 * Pure transactional reducer for all Vector Document edits.
 */
export function applyVectorCommand(doc, cmd) {
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid vector document.");
  }
  if (!cmd || !cmd.type) {
    throw new Error("Command must specify type.");
  }

  const next = deepClone(doc);

  switch (cmd.type) {
    case "set_canvas": {
      if (cmd.width !== undefined) {
        next.width = clamp(cmd.width, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
        next.viewBox.width = next.width;
      }
      if (cmd.height !== undefined) {
        next.height = clamp(cmd.height, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
        next.viewBox.height = next.height;
      }
      if (cmd.background !== undefined) {
        next.background = String(cmd.background);
      }
      if (cmd.name !== undefined) {
        next.name = String(cmd.name);
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "add_layer": {
      const layer = createVectorLayer({
        id: cmd.id,
        name: cmd.name || `Layer ${next.layers.length + 1}`,
        opacity: cmd.opacity ?? 1,
        blendMode: cmd.blendMode || "normal",
      });
      next.layers.push(layer);
      return { doc: next, changed: true, result: { ok: true, layer } };
    }

    case "remove_layer": {
      if (next.layers.length <= 1) {
        throw new Error("Cannot remove the last remaining vector layer.");
      }
      const idx = next.layers.findIndex((l) => l.id === cmd.layerId);
      if (idx === -1) throw new Error(`Layer not found: ${cmd.layerId}`);
      const [removed] = next.layers.splice(idx, 1);
      return {
        doc: next,
        changed: true,
        result: { ok: true, removedId: removed.id },
      };
    }

    case "update_layer": {
      const layer = next.layers.find((l) => l.id === cmd.layerId);
      if (!layer) throw new Error(`Layer not found: ${cmd.layerId}`);
      const p = cmd.patch || {};
      if (p.name !== undefined) layer.name = String(p.name);
      if (p.visible !== undefined) layer.visible = Boolean(p.visible);
      if (p.locked !== undefined) layer.locked = Boolean(p.locked);
      if (p.opacity !== undefined) layer.opacity = clamp(p.opacity, 0, 1);
      if (p.blendMode !== undefined && BLEND_MODES.includes(p.blendMode)) {
        layer.blendMode = p.blendMode;
      }
      return { doc: next, changed: true, result: { ok: true, layer } };
    }

    case "reorder_layer": {
      const from = next.layers.findIndex((l) => l.id === cmd.layerId);
      if (from === -1) throw new Error(`Layer not found: ${cmd.layerId}`);
      const to = clamp(Math.round(cmd.toIndex), 0, next.layers.length - 1);
      const [layer] = next.layers.splice(from, 1);
      next.layers.splice(to, 0, layer);
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "add_element": {
      const targetLayer =
        (cmd.layerId && next.layers.find((l) => l.id === cmd.layerId)) ||
        next.layers[0];
      if (!targetLayer) throw new Error("No layer available.");
      assertLayerUnlocked(targetLayer);
      const element = normalizeVectorElement(cmd.element);
      targetLayer.items.push(element);
      return {
        doc: next,
        changed: true,
        result: { ok: true, element, layerId: targetLayer.id },
      };
    }

    case "update_element": {
      const loc = findElementLocation(next, cmd.id);
      if (!loc) throw new Error(`Element not found: ${cmd.id}`);
      assertLayerUnlocked(loc.layer);
      if (loc.element.locked && cmd.patch?.locked !== false) {
        throw new Error(`Element "${loc.element.id}" is locked.`);
      }
      const merged = normalizeVectorElement({
        ...loc.element,
        ...(cmd.patch || {}),
        id: loc.element.id,
        type: loc.element.type,
        transform: {
          ...(loc.element.transform || {}),
          ...(cmd.patch?.transform || {}),
        },
      });
      loc.items[loc.index] = merged;
      return {
        doc: next,
        changed: true,
        result: { ok: true, element: merged },
      };
    }

    case "delete_elements": {
      const ids = new Set(
        Array.isArray(cmd.ids) ? cmd.ids : [cmd.id].filter(Boolean),
      );
      const deleted = [];
      for (const layer of next.layers) {
        if (layer.items.some((it) => ids.has(it.id))) {
          assertLayerUnlocked(layer);
        }
        layer.items = layer.items.filter((it) => {
          if (ids.has(it.id)) {
            deleted.push(it.id);
            return false;
          }
          return true;
        });
      }
      return {
        doc: next,
        changed: deleted.length > 0,
        result: { ok: true, deleted },
      };
    }

    case "duplicate_elements": {
      const ids = Array.isArray(cmd.ids) ? cmd.ids : [cmd.id].filter(Boolean);
      const ox = Number(cmd.offsetX ?? 16) || 0;
      const oy = Number(cmd.offsetY ?? 16) || 0;
      const newIds = [];
      for (const id of ids) {
        const loc = findElementLocation(next, id);
        if (!loc) continue;
        assertLayerUnlocked(loc.layer);
        const clone = deepClone(loc.element);
        clone.id = createUid("el");
        if (clone.type === "group" && Array.isArray(clone.children)) {
          clone.children = clone.children.map((c) => ({
            ...c,
            id: createUid("el"),
          }));
        }
        translateElement(clone, ox, oy);
        loc.items.splice(loc.index + 1, 0, clone);
        newIds.push(clone.id);
      }
      return {
        doc: next,
        changed: newIds.length > 0,
        result: { ok: true, ids: newIds },
      };
    }

    case "reorder_z": {
      const ids = new Set(
        Array.isArray(cmd.ids) ? cmd.ids : [cmd.id].filter(Boolean),
      );
      const action = cmd.action || "bring_to_front";
      let changed = false;
      for (const layer of next.layers) {
        if (!layer.items.some((it) => ids.has(it.id))) continue;
        assertLayerUnlocked(layer);
        const items = layer.items;
        if (action === "bring_to_front") {
          const keep = items.filter((it) => !ids.has(it.id));
          const move = items.filter((it) => ids.has(it.id));
          layer.items = keep.concat(move);
          changed = true;
        } else if (action === "send_to_back") {
          const keep = items.filter((it) => !ids.has(it.id));
          const move = items.filter((it) => ids.has(it.id));
          layer.items = move.concat(keep);
          changed = true;
        } else if (action === "step_forward") {
          for (let i = items.length - 2; i >= 0; i--) {
            if (ids.has(items[i].id) && !ids.has(items[i + 1].id)) {
              [items[i], items[i + 1]] = [items[i + 1], items[i]];
              changed = true;
            }
          }
        } else if (action === "step_backward") {
          for (let i = 1; i < items.length; i++) {
            if (ids.has(items[i].id) && !ids.has(items[i - 1].id)) {
              [items[i - 1], items[i]] = [items[i], items[i - 1]];
              changed = true;
            }
          }
        }
      }
      return { doc: next, changed, result: { ok: true } };
    }

    case "group_elements": {
      const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
      if (ids.length < 2) throw new Error("Need at least 2 elements to group.");
      const idSet = new Set(ids);
      let targetLayer = null;
      const children = [];
      let insertIndex = 0;

      for (const layer of next.layers) {
        const matched = layer.items.filter((it) => idSet.has(it.id));
        if (matched.length > 0) {
          assertLayerUnlocked(layer);
          if (!targetLayer) targetLayer = layer;
          insertIndex = Math.max(
            insertIndex,
            layer.items.findIndex((it) => idSet.has(it.id)),
          );
          children.push(...matched);
          layer.items = layer.items.filter((it) => !idSet.has(it.id));
        }
      }
      if (!targetLayer || children.length < 2) {
        throw new Error("Could not find elements to group.");
      }
      const groupEl = normalizeVectorElement({
        type: "group",
        name: cmd.name || "Group",
        children,
      });
      targetLayer.items.splice(
        Math.min(insertIndex, targetLayer.items.length),
        0,
        groupEl,
      );
      return { doc: next, changed: true, result: { ok: true, group: groupEl } };
    }

    case "ungroup_element": {
      const loc = findElementLocation(next, cmd.id);
      if (!loc || loc.element.type !== "group") {
        throw new Error(`Group not found: ${cmd.id}`);
      }
      assertLayerUnlocked(loc.layer);
      const tx = Number(loc.element.transform?.tx ?? 0) || 0;
      const ty = Number(loc.element.transform?.ty ?? 0) || 0;
      const children = (loc.element.children || []).map((c) =>
        translateElement(c, tx, ty),
      );
      loc.items.splice(loc.index, 1, ...children);
      return {
        doc: next,
        changed: true,
        result: { ok: true, ids: children.map((c) => c.id) },
      };
    }

    case "update_path_nodes": {
      const loc = findElementLocation(next, cmd.id);
      if (!loc || loc.element.type !== "path") {
        throw new Error(`Path element not found: ${cmd.id}`);
      }
      assertLayerUnlocked(loc.layer);
      const el = loc.element;
      if (!Array.isArray(el.nodes) || el.nodes.length === 0) {
        const parsed = pathDataToNodes(el.d);
        el.nodes = parsed.nodes;
        el.closed = parsed.closed;
      }
      const nodes = el.nodes;

      if (cmd.action === "move_node") {
        const n = nodes[cmd.nodeIndex];
        if (!n) throw new Error(`Invalid nodeIndex: ${cmd.nodeIndex}`);
        const dx = roundNum(cmd.x) - n.x;
        const dy = roundNum(cmd.y) - n.y;
        n.x = roundNum(cmd.x);
        n.y = roundNum(cmd.y);
        if (n.handleIn) {
          n.handleIn = {
            x: roundNum(n.handleIn.x + dx),
            y: roundNum(n.handleIn.y + dy),
          };
        }
        if (n.handleOut) {
          n.handleOut = {
            x: roundNum(n.handleOut.x + dx),
            y: roundNum(n.handleOut.y + dy),
          };
        }
      } else if (cmd.action === "move_handle") {
        const n = nodes[cmd.nodeIndex];
        if (!n) throw new Error(`Invalid nodeIndex: ${cmd.nodeIndex}`);
        const which = cmd.which === "handleIn" ? "handleIn" : "handleOut";
        const other = which === "handleIn" ? "handleOut" : "handleIn";
        const hx = roundNum(cmd.x);
        const hy = roundNum(cmd.y);
        n[which] = { x: hx, y: hy };

        if (n.mode === "symmetric") {
          n[other] = { x: roundNum(2 * n.x - hx), y: roundNum(2 * n.y - hy) };
        } else if (n.mode === "smooth") {
          const dx = hx - n.x;
          const dy = hy - n.y;
          const mag = Math.hypot(dx, dy);
          if (mag > 0.0001) {
            const oldOther = n[other];
            const oppLen = oldOther
              ? Math.hypot(oldOther.x - n.x, oldOther.y - n.y)
              : mag;
            n[other] = {
              x: roundNum(n.x - (dx / mag) * oppLen),
              y: roundNum(n.y - (dy / mag) * oppLen),
            };
          }
        }
      } else if (cmd.action === "insert_node") {
        const i = clamp(cmd.afterIndex ?? 0, 0, Math.max(0, nodes.length - 1));
        const a = nodes[i];
        const b = nodes[(i + 1) % nodes.length];
        if (!a || !b) throw new Error("Cannot insert node into empty path.");
        const midX = roundNum((a.x + b.x) / 2);
        const midY = roundNum((a.y + b.y) / 2);
        nodes.splice(i + 1, 0, {
          x: midX,
          y: midY,
          handleIn: null,
          handleOut: null,
          mode: "cusp",
        });
      } else if (cmd.action === "delete_node") {
        if (nodes.length <= 2)
          throw new Error("Path must keep at least 2 nodes.");
        nodes.splice(cmd.nodeIndex, 1);
      } else if (cmd.action === "toggle_close") {
        el.closed = !el.closed;
      } else if (cmd.action === "set_node_mode") {
        const n = nodes[cmd.nodeIndex];
        if (n && ["cusp", "smooth", "symmetric"].includes(cmd.mode)) {
          n.mode = cmd.mode;
        }
      }

      el.d = nodesToPathData(el.nodes, el.closed);
      return { doc: next, changed: true, result: { ok: true, element: el } };
    }

    case "align_elements": {
      const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
      const locs = ids
        .map((id) => findElementLocation(next, id))
        .filter(Boolean);
      if (locs.length === 0)
        return { doc: next, changed: false, result: { ok: true } };
      for (const loc of locs) assertLayerUnlocked(loc.layer);

      const rel = cmd.relativeTo === "canvas" ? "canvas" : "selection";
      const refBox =
        rel === "canvas"
          ? { x: 0, y: 0, width: next.width, height: next.height }
          : computeSelectionBBox(locs.map((l) => l.element));

      const align = cmd.align || "left";
      for (const loc of locs) {
        const b = computeElementBBox(loc.element);
        let dx = 0;
        let dy = 0;
        if (align === "left") dx = refBox.x - b.x;
        else if (align === "center")
          dx = refBox.x + refBox.width / 2 - (b.x + b.width / 2);
        else if (align === "right")
          dx = refBox.x + refBox.width - (b.x + b.width);
        else if (align === "top") dy = refBox.y - b.y;
        else if (align === "middle")
          dy = refBox.y + refBox.height / 2 - (b.y + b.height / 2);
        else if (align === "bottom")
          dy = refBox.y + refBox.height - (b.y + b.height);
        translateElement(loc.element, roundNum(dx), roundNum(dy));
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "distribute_elements": {
      const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
      const locs = ids
        .map((id) => findElementLocation(next, id))
        .filter(Boolean);
      if (locs.length < 3)
        return { doc: next, changed: false, result: { ok: true } };
      for (const loc of locs) assertLayerUnlocked(loc.layer);

      const axis = cmd.axis === "vertical" ? "vertical" : "horizontal";
      const entries = locs
        .map((loc) => ({ loc, box: computeElementBBox(loc.element) }))
        .sort((a, b) =>
          axis === "horizontal" ? a.box.x - b.box.x : a.box.y - b.box.y,
        );

      const first = entries[0].box;
      const last = entries[entries.length - 1].box;

      if (axis === "horizontal") {
        const totalSpan = last.x + last.width - first.x;
        const sumWidths = entries.reduce((sum, e) => sum + e.box.width, 0);
        const gap = (totalSpan - sumWidths) / (entries.length - 1);
        let cursor = first.x + first.width + gap;
        for (let i = 1; i < entries.length - 1; i++) {
          const dx = cursor - entries[i].box.x;
          translateElement(entries[i].loc.element, roundNum(dx), 0);
          cursor += entries[i].box.width + gap;
        }
      } else {
        const totalSpan = last.y + last.height - first.y;
        const sumHeights = entries.reduce((sum, e) => sum + e.box.height, 0);
        const gap = (totalSpan - sumHeights) / (entries.length - 1);
        let cursor = first.y + first.height + gap;
        for (let i = 1; i < entries.length - 1; i++) {
          const dy = cursor - entries[i].box.y;
          translateElement(entries[i].loc.element, 0, roundNum(dy));
          cursor += entries[i].box.height + gap;
        }
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "transform_elements": {
      const ids = Array.isArray(cmd.ids) ? cmd.ids : [cmd.id].filter(Boolean);
      const locs = ids
        .map((id) => findElementLocation(next, id))
        .filter(Boolean);
      if (locs.length === 0)
        return { doc: next, changed: false, result: { ok: true } };
      for (const loc of locs) assertLayerUnlocked(loc.layer);

      const dx = Number(cmd.dx ?? 0) || 0;
      const dy = Number(cmd.dy ?? 0) || 0;
      for (const loc of locs) {
        if (dx || dy) translateElement(loc.element, dx, dy);
        if (cmd.rotate !== undefined) {
          loc.element.transform = loc.element.transform || {
            tx: 0,
            ty: 0,
            rotate: 0,
            scaleX: 1,
            scaleY: 1,
          };
          loc.element.transform.rotate =
            ((loc.element.transform.rotate || 0) + Number(cmd.rotate || 0)) %
            360;
        }
        if (cmd.flipH) {
          loc.element.transform = loc.element.transform || {
            tx: 0,
            ty: 0,
            rotate: 0,
            scaleX: 1,
            scaleY: 1,
          };
          loc.element.transform.scaleX = -(loc.element.transform.scaleX || 1);
        }
        if (cmd.flipV) {
          loc.element.transform = loc.element.transform || {
            tx: 0,
            ty: 0,
            rotate: 0,
            scaleX: 1,
            scaleY: 1,
          };
          loc.element.transform.scaleY = -(loc.element.transform.scaleY || 1);
        }
        if (cmd.scaleX !== undefined && loc.element.type === "rect") {
          loc.element.width = Math.max(
            1,
            roundNum(loc.element.width * Number(cmd.scaleX)),
          );
        }
        if (cmd.scaleY !== undefined && loc.element.type === "rect") {
          loc.element.height = Math.max(
            1,
            roundNum(loc.element.height * Number(cmd.scaleY)),
          );
        }
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    default:
      throw new Error(`Unknown vector command type: ${cmd.type}`);
  }
}
