/**
 * .agents/scripts/shadow-claw-draw-anim-svg.js
 *
 * Pure zero-DOM Animated SVG (SMIL & CSS @keyframes) Serializer & Round-Trip Parser.
 * Supports both cel-frame switching and true property/transform/path interpolation.
 */

import { roundNum } from "./shadow-claw-draw-schema.js";
import {
  escapeXml,
  unescapeXml,
  serializeVectorDocumentToSvg,
  parseSvgToVectorDocument,
} from "./shadow-claw-draw-svg-codec.js";
import {
  createAnimationDocument,
  createAnimationFrame,
  computePlaybackSequence,
} from "./shadow-claw-draw-animation.js";
import {
  computeElementBBox,
  findAllElements,
} from "./shadow-claw-draw-vector.js";

function easingToKeySpline(easing) {
  switch (easing) {
    case "ease-in":
      return "0.42 0 1 1";
    case "ease-out":
      return "0 0 0.58 1";
    case "ease-in-out":
      return "0.42 0 0.58 1";
    default:
      return "0 0 1 1";
  }
}

function buildKeyTimes(seq, frames) {
  const durations = seq.map((idx) => Math.max(10, frames[idx]?.delayMs ?? 83));
  const totalMs = durations.reduce((a, b) => a + b, 0);
  const times = [0];
  let acc = 0;
  for (let i = 0; i < durations.length - 1; i++) {
    acc += durations[i];
    times.push(roundNum(acc / totalMs, 4));
  }
  if (seq.length > 1) times.push(1);
  return { totalMs, durations, keyTimes: times };
}

function canInterpolateTrack(seq, frames) {
  if (seq.length < 2) return false;
  const firstIds = new Set(
    findAllElements(frames[seq[0]].doc).map((e) => e.id),
  );
  if (firstIds.size === 0) return false;
  for (let i = 1; i < seq.length; i++) {
    const els = findAllElements(frames[seq[i]].doc);
    if (els.length !== firstIds.size) return false;
    for (const el of els) {
      if (!firstIds.has(el.id)) return false;
    }
  }
  return true;
}

function formatStaticBodyLines(doc, indent = "    ") {
  const raw = serializeVectorDocumentToSvg(doc, {
    includeBackgroundRect: false,
  });
  const lines = raw.split("\n");
  // Strip outer <svg> and </svg> and <defs>...</defs> (handled at root)
  const out = [];
  let inDefs = false;
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.trim().startsWith("<defs>")) {
      inDefs = true;
      continue;
    }
    if (line.trim().startsWith("</defs>")) {
      inDefs = false;
      continue;
    }
    if (!inDefs) out.push(`${indent}${line.trimStart()}`);
  }
  return out;
}

function renderInterpolatedSmilElement(
  elFirst,
  elementSamples,
  keyTimes,
  totalSec,
  repeatCount,
  indent,
) {
  // Serialize base element with no inner children from serializeVectorDocumentToSvg
  const tmpDoc = {
    width: 100,
    height: 100,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    defs: { gradients: [] },
    layers: [
      {
        id: "tmp",
        name: "tmp",
        visible: true,
        opacity: 1,
        blendMode: "normal",
        items: [elFirst],
      },
    ],
  };
  const svgStr = serializeVectorDocumentToSvg(tmpDoc, {
    includeBackgroundRect: false,
  });
  const innerLines = svgStr
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("<svg") &&
        !l.startsWith("</svg") &&
        !l.trim().startsWith('<g id="tmp"') &&
        l.trim() !== "</g>",
    );
  const baseTag = innerLines.join("\n").trim();
  if (!baseTag) return "";

  const anims = [];
  const ktStr = keyTimes.join(";");
  const repeatAttr = `repeatCount="${repeatCount}"`;
  const durAttr = `dur="${roundNum(totalSec, 3)}s"`;

  // Ensure end value repeats at t=1 for smooth loop keyTimes alignment
  const padSamples = [
    ...elementSamples,
    elementSamples[elementSamples.length - 1],
  ];

  const txVals = padSamples.map(
    (e) =>
      `${roundNum(e.transform?.tx || 0)} ${roundNum(e.transform?.ty || 0)}`,
  );
  if (new Set(txVals).size > 1) {
    anims.push(
      `${indent}  <animateTransform attributeName="transform" type="translate" additive="sum" values="${txVals.join(";")}" keyTimes="${ktStr}" ${durAttr} ${repeatAttr} />`,
    );
  }

  const rotVals = padSamples.map((e) => {
    const b = computeElementBBox({ ...e, transform: { tx: 0, ty: 0 } });
    const cx = roundNum(b.x + b.width / 2);
    const cy = roundNum(b.y + b.height / 2);
    return `${roundNum(e.transform?.rotate || 0)} ${cx} ${cy}`;
  });
  if (new Set(rotVals.map((v) => v.split(" ")[0])).size > 1) {
    anims.push(
      `${indent}  <animateTransform attributeName="transform" type="rotate" additive="sum" values="${rotVals.join(";")}" keyTimes="${ktStr}" ${durAttr} ${repeatAttr} />`,
    );
  }

  const fillVals = padSamples.map((e) => escapeXml(e.fill ?? "none"));
  if (new Set(fillVals).size > 1) {
    anims.push(
      `${indent}  <animate attributeName="fill" values="${fillVals.join(";")}" keyTimes="${ktStr}" ${durAttr} ${repeatAttr} />`,
    );
  }

  const opVals = padSamples.map((e) => String(roundNum(e.opacity ?? 1)));
  if (new Set(opVals).size > 1) {
    anims.push(
      `${indent}  <animate attributeName="opacity" values="${opVals.join(";")}" keyTimes="${ktStr}" ${durAttr} ${repeatAttr} />`,
    );
  }

  for (const attr of [
    "x",
    "y",
    "width",
    "height",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
  ]) {
    if (typeof elFirst[attr] === "number") {
      const vals = padSamples.map((e) =>
        String(roundNum(e[attr] ?? elFirst[attr])),
      );
      if (new Set(vals).size > 1) {
        anims.push(
          `${indent}  <animate attributeName="${attr}" values="${vals.join(";")}" keyTimes="${ktStr}" ${durAttr} ${repeatAttr} />`,
        );
      }
    }
  }

  if (anims.length === 0) {
    return `${indent}${baseTag}`;
  }
  if (baseTag.endsWith("/>")) {
    const open = baseTag.slice(0, -2).trimEnd();
    const tagName = open.slice(1).split(/[\s>]/)[0];
    return `${indent}${open}>\n${anims.join("\n")}\n${indent}</${tagName}>`;
  }
  return `${indent}${baseTag}`;
}

/**
 * Serialize a Vector AnimationDocument into a self-contained Animated SVG string.
 */
export function serializeAnimatedVectorDocumentToSvg(
  animDoc,
  { engine = "smil", interpolate = true, includeBackgroundRect = true } = {},
) {
  const seq = computePlaybackSequence(animDoc);
  const { totalMs, durations, keyTimes } = buildKeyTimes(seq, animDoc.frames);
  const totalSec = Math.max(0.02, totalMs / 1000);
  const repeatCount =
    animDoc.loopCount === 0
      ? "indefinite"
      : String(Math.max(1, animDoc.loopCount));

  const delaysAttr = seq.map((i) => animDoc.frames[i].delayMs).join(",");
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${roundNum(animDoc.width)}" height="${roundNum(animDoc.height)}" viewBox="0 0 ${roundNum(animDoc.width)} ${roundNum(animDoc.height)}" data-shadow-claw-draw-animation="true" data-scdraw-name="${escapeXml(animDoc.name)}" data-scdraw-fps="${roundNum(animDoc.fps)}" data-scdraw-frame-delays="${escapeXml(delaysAttr)}" data-scdraw-loop-count="${animDoc.loopCount}" data-scdraw-loop-mode="${escapeXml(animDoc.loopMode)}" data-scdraw-bg="${escapeXml(animDoc.background)}">`,
  ];

  const gradients = animDoc.frames[seq[0]]?.doc?.defs?.gradients || [];
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

  const useCss = engine === "css";
  const canInterp = Boolean(
    interpolate && !useCss && canInterpolateTrack(seq, animDoc.frames),
  );

  if (useCss) {
    lines.push("  <style>");
    let acc = 0;
    for (let sIdx = 0; sIdx < seq.length; sIdx++) {
      const startPct = roundNum((acc / totalMs) * 100, 3);
      acc += durations[sIdx];
      const endPct = roundNum((acc / totalMs) * 100, 3);
      const kfName = `scdraw_f_${sIdx}`;
      lines.push(`    @keyframes ${kfName} {`);
      if (startPct > 0)
        lines.push(
          `      0%, ${roundNum(Math.max(0, startPct - 0.001), 3)}% { opacity: 0; }`,
        );
      lines.push(
        `      ${startPct}%, ${roundNum(Math.max(startPct, endPct - 0.001), 3)}% { opacity: 1; }`,
      );
      if (endPct < 100) lines.push(`      ${endPct}%, 100% { opacity: 0; }`);
      lines.push(`    }`);
      const iter =
        animDoc.loopCount === 0
          ? "infinite"
          : String(Math.max(1, animDoc.loopCount));
      lines.push(
        `    [data-scdraw-frame="${sIdx}"] { animation: ${kfName} ${roundNum(totalSec, 3)}s step-end ${iter}; }`,
      );
    }
    lines.push("  </style>");
  }

  if (
    includeBackgroundRect &&
    animDoc.background &&
    animDoc.background !== "transparent"
  ) {
    lines.push(
      `  <rect data-scdraw-background="true" x="0" y="0" width="${roundNum(animDoc.width)}" height="${roundNum(animDoc.height)}" fill="${escapeXml(animDoc.background)}" />`,
    );
  }

  if (canInterp) {
    const baseDoc = animDoc.frames[seq[0]].doc;
    const mapsByStep = seq.map((frameIdx) => {
      const map = new Map();
      for (const el of findAllElements(animDoc.frames[frameIdx].doc)) {
        map.set(el.id, el);
      }
      return map;
    });

    for (const layer of baseDoc.layers || []) {
      lines.push(
        `  <g id="${escapeXml(layer.id)}" data-scdraw-layer="${escapeXml(layer.name)}">`,
      );
      for (const el of layer.items || []) {
        const samples = mapsByStep.map((m) => m.get(el.id) || el);
        const rendered = renderInterpolatedSmilElement(
          el,
          samples,
          keyTimes,
          totalSec,
          repeatCount,
          "    ",
        );
        if (rendered) lines.push(rendered);
      }
      lines.push("  </g>");
    }
  } else {
    // Cel frame groups
    for (let sIdx = 0; sIdx < seq.length; sIdx++) {
      const frame = animDoc.frames[seq[sIdx]];
      lines.push(
        `  <g data-scdraw-frame="${sIdx}" data-scdraw-delay="${frame.delayMs}">`,
      );
      if (!useCss && seq.length > 1) {
        const vals = seq.map((_, i) => (i === sIdx ? "inline" : "none"));
        vals.push(vals[vals.length - 1]);
        lines.push(
          `    <animate attributeName="display" values="${vals.join(";")}" keyTimes="${keyTimes.join(";")}" calcMode="discrete" dur="${roundNum(totalSec, 3)}s" repeatCount="${repeatCount}" />`,
        );
      }
      lines.push(...formatStaticBodyLines(frame.doc, "    "));
      lines.push("  </g>");
    }
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * Parse a ShadowClaw Animated SVG (or fallback static SVG) into an AnimationDocument.
 */
export function parseAnimatedSvgToAnimationDocument(svgString) {
  const raw = String(svgString || "");
  const rootMatch = raw.match(/<svg\b([^>]*)>/i);
  const rootAttrs = rootMatch ? rootMatch[1] : "";
  const attr = (name) => {
    const m = rootAttrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
    return m ? unescapeXml(m[1]) : null;
  };

  const baseParsed = parseSvgToVectorDocument(raw);
  const delaysStr = attr("data-scdraw-frame-delays");
  const delays = delaysStr
    ? delaysStr.split(",").map((n) => Number(n) || 83)
    : [];
  const fps = Number(attr("data-scdraw-fps")) || 12;
  const loopCount = Number(attr("data-scdraw-loop-count")) || 0;
  const loopMode = attr("data-scdraw-loop-mode") || "loop";
  const name =
    attr("data-scdraw-name") || baseParsed.name || "Imported Animation";

  const anim = createAnimationDocument({
    mode: "vector",
    width: baseParsed.width,
    height: baseParsed.height,
    background: attr("data-scdraw-bg") || baseParsed.background || "#ffffff",
    fps,
    loopCount,
    loopMode,
    name,
  });

  // Extract cel frames if present
  const frameGroups = [
    ...raw.matchAll(
      /<g\b[^>]*data-scdraw-frame="(\d+)"[^>]*>([\s\S]*?)<\/g>(?=\s*(?:<g\b[^>]*data-scdraw-frame|<\/svg>))/gi,
    ),
  ];
  if (frameGroups.length > 0) {
    anim.frames = frameGroups.map((m, idx) => {
      const innerSvg = `<svg width="${baseParsed.width}" height="${baseParsed.height}">${m[2]}</svg>`;
      const doc = parseSvgToVectorDocument(innerSvg);
      return createAnimationFrame({
        name: `Frame ${idx + 1}`,
        delayMs: delays[idx] ?? Math.round(1000 / fps),
        mode: "vector",
        width: baseParsed.width,
        height: baseParsed.height,
        doc,
      });
    });
  } else if (delays.length > 1) {
    // Interpolated SVG: reconstruct keyframe count from delays metadata
    anim.frames = delays.map((d, idx) =>
      createAnimationFrame({
        name: `Frame ${idx + 1}`,
        delayMs: d,
        mode: "vector",
        width: baseParsed.width,
        height: baseParsed.height,
        doc: baseParsed,
      }),
    );
  } else {
    anim.frames[0] = createAnimationFrame({
      name: "Frame 1",
      delayMs: delays[0] ?? Math.round(1000 / fps),
      mode: "vector",
      width: baseParsed.width,
      height: baseParsed.height,
      doc: baseParsed,
    });
  }
  anim.trimStart = 0;
  anim.trimEnd = Math.max(0, anim.frames.length - 1);
  return anim;
}
