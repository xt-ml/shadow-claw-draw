/**
 * .agents/scripts/shadow-claw-draw-svg-codec.js
 *
 * Pure-JS SVG 1.1/2.0 Serializer & Security-Hardened XML Parser.
 * Zero DOM dependencies so it executes natively in Node.js tests,
 * Web Workers, and browser UI layers.
 *
 * Ported concepts from Inkscape (src/xml/, src/object/).
 */

import {
  createVectorDocument,
  createVectorLayer,
  normalizeVectorElement,
  computeElementBBox,
  parseSvgPathData,
  formatSvgPathData,
} from "./shadow-claw-draw-vector.js";
import { clamp, roundNum, createUid } from "./shadow-claw-draw-schema.js";

export { parseSvgPathData, formatSvgPathData };

export function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(str) {
  return String(str ?? "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function isSafeHref(href) {
  const clean = String(href || "").trim();
  if (!clean) return false;
  if (/^(javascript|vbscript):/i.test(clean)) return false;
  if (/^data:/i.test(clean)) {
    return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);/i.test(clean);
  }
  return true;
}

function formatTransformAttr(el) {
  const t = el.transform;
  if (!t) return "";
  const parts = [];
  if (t.tx || t.ty) {
    parts.push(`translate(${roundNum(t.tx || 0)} ${roundNum(t.ty || 0)})`);
  }
  if (
    t.rotate ||
    (t.scaleX !== undefined && t.scaleX !== 1) ||
    (t.scaleY !== undefined && t.scaleY !== 1)
  ) {
    const b = computeElementBBox({ ...el, transform: { tx: 0, ty: 0 } });
    const cx = roundNum(b.x + b.width / 2);
    const cy = roundNum(b.y + b.height / 2);
    if (t.rotate) {
      parts.push(`rotate(${roundNum(t.rotate)} ${cx} ${cy})`);
    }
    if (
      (t.scaleX !== undefined && t.scaleX !== 1) ||
      (t.scaleY !== undefined && t.scaleY !== 1)
    ) {
      const sx = roundNum(t.scaleX ?? 1);
      const sy = roundNum(t.scaleY ?? 1);
      parts.push(
        `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`,
      );
    }
  }
  return parts.join(" ");
}

function formatCommonAttrs(el) {
  const attrs = [`id="${escapeXml(el.id)}"`];
  if (el.name) attrs.push(`data-name="${escapeXml(el.name)}"`);
  if (el.type !== "group" && el.type !== "image") {
    attrs.push(`fill="${escapeXml(el.fill ?? "none")}"`);
    attrs.push(`stroke="${escapeXml(el.stroke ?? "none")}"`);
    attrs.push(`stroke-width="${roundNum(el.strokeWidth ?? 0)}"`);
    if (el.fillOpacity !== undefined && el.fillOpacity !== 1) {
      attrs.push(`fill-opacity="${roundNum(el.fillOpacity)}"`);
    }
    if (el.strokeOpacity !== undefined && el.strokeOpacity !== 1) {
      attrs.push(`stroke-opacity="${roundNum(el.strokeOpacity)}"`);
    }
    if (el.strokeDasharray) {
      attrs.push(`stroke-dasharray="${escapeXml(el.strokeDasharray)}"`);
    }
    if (el.strokeLinecap && el.strokeLinecap !== "butt") {
      attrs.push(`stroke-linecap="${escapeXml(el.strokeLinecap)}"`);
    }
    if (el.strokeLinejoin && el.strokeLinejoin !== "miter") {
      attrs.push(`stroke-linejoin="${escapeXml(el.strokeLinejoin)}"`);
    }
  }
  if (el.opacity !== undefined && el.opacity !== 1) {
    attrs.push(`opacity="${roundNum(el.opacity)}"`);
  }
  if (el.visible === false) {
    attrs.push(`display="none"`);
  }
  const transform = formatTransformAttr(el);
  if (transform) {
    attrs.push(`transform="${escapeXml(transform)}"`);
  }
  return attrs.join(" ");
}

function serializeElement(el, indent = "    ") {
  const common = formatCommonAttrs(el);
  switch (el.type) {
    case "rect":
      return `${indent}<rect ${common} x="${roundNum(el.x)}" y="${roundNum(el.y)}" width="${roundNum(el.width)}" height="${roundNum(el.height)}"${el.rx ? ` rx="${roundNum(el.rx)}"` : ""}${el.ry ? ` ry="${roundNum(el.ry)}"` : ""} />`;
    case "ellipse":
      return `${indent}<ellipse ${common} cx="${roundNum(el.cx)}" cy="${roundNum(el.cy)}" rx="${roundNum(el.rx)}" ry="${roundNum(el.ry)}" />`;
    case "circle":
      return `${indent}<circle ${common} cx="${roundNum(el.cx)}" cy="${roundNum(el.cy)}" r="${roundNum(el.r)}" />`;
    case "line":
      return `${indent}<line ${common} x1="${roundNum(el.x1)}" y1="${roundNum(el.y1)}" x2="${roundNum(el.x2)}" y2="${roundNum(el.y2)}" />`;
    case "polygon":
    case "star": {
      const pts = (el.points || [])
        .map((p) => `${roundNum(p.x)},${roundNum(p.y)}`)
        .join(" ");
      return `${indent}<polygon ${common}${el.type === "star" ? ` data-shape="star"` : ""} points="${escapeXml(pts)}" />`;
    }
    case "polyline": {
      const pts = (el.points || [])
        .map((p) => `${roundNum(p.x)},${roundNum(p.y)}`)
        .join(" ");
      return `${indent}<polyline ${common} points="${escapeXml(pts)}" />`;
    }
    case "path":
      return `${indent}<path ${common} d="${escapeXml(el.d || "")}" />`;
    case "text":
      return `${indent}<text ${common} x="${roundNum(el.x)}" y="${roundNum(el.y)}" font-family="${escapeXml(el.fontFamily || "sans-serif")}" font-size="${roundNum(el.fontSize || 24)}" font-weight="${escapeXml(el.fontWeight || "600")}" text-anchor="${escapeXml(el.textAnchor || "start")}">${escapeXml(el.text || "")}</text>`;
    case "image": {
      const href = isSafeHref(el.href) ? el.href : "";
      return `${indent}<image ${common} x="${roundNum(el.x)}" y="${roundNum(el.y)}" width="${roundNum(el.width)}" height="${roundNum(el.height)}" href="${escapeXml(href)}" preserveAspectRatio="${escapeXml(el.preserveAspectRatio || "xMidYMid meet")}" />`;
    }
    case "group": {
      const inner = (el.children || [])
        .map((c) => serializeElement(c, indent + "  "))
        .join("\n");
      return `${indent}<g ${common}>\n${inner}\n${indent}</g>`;
    }
    default:
      return "";
  }
}

export function serializeVectorDocumentToSvg(doc, options = {}) {
  const vb = doc.viewBox || {
    x: 0,
    y: 0,
    width: doc.width,
    height: doc.height,
  };
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${roundNum(doc.width)}" height="${roundNum(doc.height)}" viewBox="${roundNum(vb.x)} ${roundNum(vb.y)} ${roundNum(vb.width)} ${roundNum(vb.height)}" data-scdraw-name="${escapeXml(doc.name || "Untitled Vector")}" data-scdraw-bg="${escapeXml(doc.background || "#ffffff")}">`,
  ];

  const gradients = doc.defs?.gradients || [];
  if (gradients.length > 0) {
    lines.push("  <defs>");
    for (const g of gradients) {
      if (g.type === "radial") {
        lines.push(
          `    <radialGradient id="${escapeXml(g.id)}" cx="${escapeXml(g.cx || "50%")}" cy="${escapeXml(g.cy || "50%")}" r="${escapeXml(g.r || "50%")}">`,
        );
      } else {
        lines.push(
          `    <linearGradient id="${escapeXml(g.id)}" x1="${escapeXml(g.x1 || "0%")}" y1="${escapeXml(g.y1 || "0%")}" x2="${escapeXml(g.x2 || "100%")}" y2="${escapeXml(g.y2 || "0%")}">`,
        );
      }
      for (const stop of g.stops || []) {
        lines.push(
          `      <stop offset="${escapeXml(stop.offset)}" stop-color="${escapeXml(stop.color)}" stop-opacity="${roundNum(stop.opacity ?? 1)}" />`,
        );
      }
      lines.push(
        g.type === "radial" ? "    </radialGradient>" : "    </linearGradient>",
      );
    }
    lines.push("  </defs>");
  }

  if (
    options.includeBackgroundRect &&
    doc.background &&
    doc.background !== "transparent"
  ) {
    lines.push(
      `  <rect data-scdraw-background="true" x="0" y="0" width="${roundNum(doc.width)}" height="${roundNum(doc.height)}" fill="${escapeXml(doc.background)}" />`,
    );
  }

  for (const layer of doc.layers || []) {
    const attrs = [
      `id="${escapeXml(layer.id)}"`,
      `data-scdraw-layer="${escapeXml(layer.name)}"`,
      layer.opacity !== 1 ? `opacity="${roundNum(layer.opacity)}"` : "",
      layer.visible === false ? `display="none"` : "",
      layer.locked ? `data-locked="true"` : "",
      layer.blendMode && layer.blendMode !== "normal"
        ? `style="mix-blend-mode:${escapeXml(layer.blendMode)}"`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`  <g ${attrs}>`);
    for (const item of layer.items || []) {
      const rendered = serializeElement(item, "    ");
      if (rendered) lines.push(rendered);
    }
    lines.push("  </g>");
  }

  lines.push("</svg>");
  return lines.join("\n");
}

function parseAttributes(attrString) {
  const attrs = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const key = m[1];
    // Strip all inline event handlers (XSS prevention)
    if (/^on/i.test(key)) continue;
    attrs[key] = unescapeXml(m[2] !== undefined ? m[2] : m[3] || "");
  }
  // Parse safe CSS declarations inside `style` attribute
  if (attrs.style) {
    for (const decl of attrs.style.split(";")) {
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const val = decl.slice(colon + 1).trim();
      if (
        val &&
        !/expression|javascript:|url\s*\(\s*['"]?javascript:/i.test(val)
      ) {
        if (attrs[prop] === undefined) attrs[prop] = val;
      }
    }
  }
  return attrs;
}

function parsePointsList(str) {
  if (!str) return [];
  const nums = str.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]) || 0, y: parseFloat(nums[i + 1]) || 0 });
  }
  return pts;
}

function parseTransformString(str) {
  const t = { tx: 0, ty: 0, rotate: 0, scaleX: 1, scaleY: 1 };
  if (!str) return t;
  const tr = /translate\(\s*([-+\d.]+)(?:[\s,]+([-+\d.]+))?\s*\)/i.exec(str);
  if (tr) {
    t.tx = parseFloat(tr[1]) || 0;
    t.ty = parseFloat(tr[2]) || 0;
  }
  const rot = /rotate\(\s*([-+\d.]+)/i.exec(str);
  if (rot) t.rotate = parseFloat(rot[1]) || 0;
  return t;
}

const BLOCKED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
]);

function parseXmlNodes(xmlString) {
  const root = { tag: "__root__", attrs: {}, children: [], text: "" };
  const stack = [root];
  const tokenRe =
    /<!--[\s\S]*?-->|<![\s\S]*?>|<\?[\s\S]*?\?>|<\/([a-zA-Z0-9_:-]+)\s*>|<([a-zA-Z0-9_:-]+)([^>]*?)(\/?)>/g;

  let lastIndex = 0;
  let match;
  let blockedDepth = 0;

  while ((match = tokenRe.exec(xmlString)) !== null) {
    if (match.index > lastIndex && blockedDepth === 0) {
      const txt = xmlString.slice(lastIndex, match.index);
      if (txt) stack[stack.length - 1].text += unescapeXml(txt);
    }
    lastIndex = tokenRe.lastIndex;

    if (match[1]) {
      // Closing tag
      const closeTag = match[1].toLowerCase();
      if (BLOCKED_TAGS.has(closeTag) && blockedDepth > 0) {
        blockedDepth--;
        continue;
      }
      if (blockedDepth === 0 && stack.length > 1) {
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tag === closeTag) {
            stack.length = i;
            break;
          }
        }
      }
      continue;
    }

    if (match[2]) {
      const tag = match[2].toLowerCase();
      const attrStr = match[3] || "";
      const selfClosing = Boolean(match[4]);

      if (BLOCKED_TAGS.has(tag)) {
        if (!selfClosing) blockedDepth++;
        continue;
      }
      if (blockedDepth > 0) continue;

      const node = {
        tag,
        attrs: parseAttributes(attrStr),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    }
  }

  return root;
}

function xmlNodeToElement(node) {
  const a = node.attrs || {};
  const base = {
    id: a.id || createUid("el"),
    name: a["data-name"] || undefined,
    fill: a.fill,
    stroke: a.stroke,
    strokeWidth:
      a["stroke-width"] !== undefined
        ? parseFloat(a["stroke-width"])
        : undefined,
    fillOpacity:
      a["fill-opacity"] !== undefined
        ? parseFloat(a["fill-opacity"])
        : undefined,
    strokeOpacity:
      a["stroke-opacity"] !== undefined
        ? parseFloat(a["stroke-opacity"])
        : undefined,
    strokeDasharray: a["stroke-dasharray"],
    strokeLinecap: a["stroke-linecap"],
    strokeLinejoin: a["stroke-linejoin"],
    opacity: a.opacity !== undefined ? parseFloat(a.opacity) : undefined,
    visible: a.display === "none" ? false : true,
    transform: parseTransformString(a.transform),
  };

  switch (node.tag) {
    case "rect":
      if (a["data-scdraw-background"] === "true") return null;
      return normalizeVectorElement({
        ...base,
        type: "rect",
        x: parseFloat(a.x || 0),
        y: parseFloat(a.y || 0),
        width: parseFloat(a.width || 0),
        height: parseFloat(a.height || 0),
        rx: parseFloat(a.rx || 0),
        ry: parseFloat(a.ry || a.rx || 0),
      });
    case "ellipse":
      return normalizeVectorElement({
        ...base,
        type: "ellipse",
        cx: parseFloat(a.cx || 0),
        cy: parseFloat(a.cy || 0),
        rx: parseFloat(a.rx || 0),
        ry: parseFloat(a.ry || 0),
      });
    case "circle":
      return normalizeVectorElement({
        ...base,
        type: "circle",
        cx: parseFloat(a.cx || 0),
        cy: parseFloat(a.cy || 0),
        r: parseFloat(a.r || 0),
      });
    case "line":
      return normalizeVectorElement({
        ...base,
        type: "line",
        x1: parseFloat(a.x1 || 0),
        y1: parseFloat(a.y1 || 0),
        x2: parseFloat(a.x2 || 0),
        y2: parseFloat(a.y2 || 0),
      });
    case "polygon": {
      const pts = parsePointsList(a.points);
      return normalizeVectorElement({
        ...base,
        type: a["data-shape"] === "star" ? "star" : "polygon",
        points: pts,
      });
    }
    case "polyline":
      return normalizeVectorElement({
        ...base,
        type: "polyline",
        points: parsePointsList(a.points),
      });
    case "path":
      return normalizeVectorElement({
        ...base,
        type: "path",
        d: a.d || "",
      });
    case "text":
      return normalizeVectorElement({
        ...base,
        type: "text",
        x: parseFloat(a.x || 0),
        y: parseFloat(a.y || 0),
        text: (node.text || "").trim(),
        fontFamily: a["font-family"] || "sans-serif",
        fontSize: parseFloat(a["font-size"] || 24),
        fontWeight: a["font-weight"] || "600",
        textAnchor: a["text-anchor"] || "start",
      });
    case "image": {
      const rawHref = a.href || a["xlink:href"] || "";
      if (!isSafeHref(rawHref)) return null;
      return normalizeVectorElement({
        ...base,
        type: "image",
        x: parseFloat(a.x || 0),
        y: parseFloat(a.y || 0),
        width: parseFloat(a.width || 100),
        height: parseFloat(a.height || 100),
        href: rawHref,
        preserveAspectRatio: a.preserveAspectRatio || "xMidYMid meet",
      });
    }
    case "g": {
      const children = node.children.map(xmlNodeToElement).filter(Boolean);
      return normalizeVectorElement({
        ...base,
        type: "group",
        children,
      });
    }
    default:
      return null;
  }
}

export function parseSvgToVectorDocument(svgString) {
  if (!svgString || typeof svgString !== "string") {
    throw new Error("parseSvgToVectorDocument requires an SVG string.");
  }

  const ast = parseXmlNodes(svgString);
  const svgNode = ast.children.find((c) => c.tag === "svg");
  if (!svgNode) {
    throw new Error("No <svg> root element found.");
  }

  const sa = svgNode.attrs || {};
  let vb = { x: 0, y: 0, width: 1024, height: 768 };
  if (sa.viewBox) {
    const nums = sa.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (nums.length >= 4 && nums.every(Number.isFinite)) {
      vb = { x: nums[0], y: nums[1], width: nums[2], height: nums[3] };
    }
  }
  const width = parseFloat(sa.width) || vb.width || 1024;
  const height = parseFloat(sa.height) || vb.height || 768;
  if (!sa.viewBox) {
    vb = { x: 0, y: 0, width, height };
  }

  const doc = createVectorDocument({
    width,
    height,
    background: sa["data-scdraw-bg"] || "#ffffff",
    name: sa["data-scdraw-name"] || "Imported SVG",
  });
  doc.viewBox = vb;
  doc.layers = [];

  const looseItems = [];
  for (const child of svgNode.children) {
    if (child.tag === "defs") {
      for (const defChild of child.children) {
        if (
          defChild.tag === "lineargradient" ||
          defChild.tag === "radialgradient"
        ) {
          const ga = defChild.attrs || {};
          doc.defs.gradients.push({
            id: ga.id || createUid("grad"),
            type: defChild.tag === "radialgradient" ? "radial" : "linear",
            x1: ga.x1 || "0%",
            y1: ga.y1 || "0%",
            x2: ga.x2 || "100%",
            y2: ga.y2 || "0%",
            cx: ga.cx || "50%",
            cy: ga.cy || "50%",
            r: ga.r || "50%",
            stops: defChild.children
              .filter((s) => s.tag === "stop")
              .map((s) => ({
                offset: s.attrs.offset || "0%",
                color: s.attrs["stop-color"] || "#000000",
                opacity:
                  s.attrs["stop-opacity"] !== undefined
                    ? clamp(parseFloat(s.attrs["stop-opacity"]), 0, 1)
                    : 1,
              })),
          });
        }
      }
      continue;
    }

    if (
      child.tag === "g" &&
      (child.attrs["data-scdraw-layer"] || child.children.length >= 0)
    ) {
      const layer = createVectorLayer({
        id: child.attrs.id || createUid("layer"),
        name:
          child.attrs["data-scdraw-layer"] ||
          child.attrs["data-name"] ||
          `Layer ${doc.layers.length + 1}`,
        visible: child.attrs.display === "none" ? false : true,
        locked: child.attrs["data-locked"] === "true",
        opacity:
          child.attrs.opacity !== undefined
            ? parseFloat(child.attrs.opacity)
            : 1,
        blendMode: child.attrs["mix-blend-mode"] || "normal",
        items: child.children.map(xmlNodeToElement).filter(Boolean),
      });
      doc.layers.push(layer);
    } else {
      const el = xmlNodeToElement(child);
      if (el) looseItems.push(el);
    }
  }

  if (looseItems.length > 0) {
    if (doc.layers.length === 0) {
      doc.layers.push(
        createVectorLayer({
          id: "layer_1",
          name: "Layer 1",
          items: looseItems,
        }),
      );
    } else {
      doc.layers[0].items.unshift(...looseItems);
    }
  }

  if (doc.layers.length === 0) {
    doc.layers.push(createVectorLayer({ id: "layer_1", name: "Layer 1" }));
  }

  return doc;
}
