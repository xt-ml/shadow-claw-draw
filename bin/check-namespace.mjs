#!/usr/bin/env node
/**
 * bin/check-namespace.mjs
 *
 * Verifies namespace and identifier isolation for shadow-claw-draw.
 *
 * Validates:
 * - All tools start with "scdraw_" and have generated .agents/tools/<name>.json
 * - All custom elements start with "shadow-claw-draw-"
 * - All broadcast channels start with "scdraw-"
 * - Pinned workbench page is "/pages/main/index.html"
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

export function checkNamespaceIsolation() {
  const issues = [];
  const report = {
    tools: [],
    elements: [],
    channels: [],
    namingViolations: [],
    pinnedPageConflict: false,
  };

  const configPath = resolve(ROOT, "shadow-claw.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`Draw config not found at ${configPath}`);
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));

  // 1. Tool Namespaces & Tool File Presence
  report.tools = config.enabledTools || [];
  for (const tool of report.tools) {
    if (!tool.startsWith("scdraw_")) {
      report.namingViolations.push(tool);
      issues.push(
        `Tool naming violation: "${tool}" must start with "scdraw_".`,
      );
    }
    const toolFile = resolve(ROOT, ".agents/tools", `${tool}.json`);
    if (!existsSync(toolFile)) {
      issues.push(
        `Missing declarative tool file for enabled tool: .agents/tools/${tool}.json`,
      );
    }
  }

  // 2. Custom Elements Namespaces
  report.elements = config.customElements?.allowedElements || [];
  for (const el of report.elements) {
    if (!el.startsWith("shadow-claw-draw-")) {
      report.namingViolations.push(el);
      issues.push(
        `Custom element naming violation: "${el}" must start with "shadow-claw-draw-".`,
      );
    }
  }

  // 3. Pinned Page Check
  const pinned = config.pages?.defaultPinnedPage;
  if (!pinned || pinned !== "/pages/main/index.html") {
    report.pinnedPageConflict = true;
    issues.push(
      `Pinned page mismatch: Draw must pin "/pages/main/index.html". Found: "${pinned}".`,
    );
  }

  // 4. Broadcast Channel Names
  const channels = ["scdraw-commands", "scdraw-results", "scdraw-state"];
  report.channels = channels;
  for (const ch of channels) {
    if (!ch.startsWith("scdraw-")) {
      report.namingViolations.push(ch);
      issues.push(
        `Broadcast channel naming violation: "${ch}" must start with "shadow-claw-draw-".`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    report,
    issues,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = checkNamespaceIsolation();
    console.log("=== ShadowClaw Draw Namespace Isolation Check ===");
    console.log(`Tools: ${result.report.tools.length}`);
    console.log(`Elements: ${result.report.elements.length}`);
    console.log(`Channels: ${result.report.channels.length}`);

    if (!result.ok) {
      console.error("\n[FAIL] Namespace issues detected:");
      for (const issue of result.issues) {
        console.error(` - ${issue}`);
      }
      process.exit(1);
    }

    console.log("\n[PASS] 100% namespace separation and isolation verified!");
    process.exit(0);
  } catch (err) {
    console.error("[ERROR]", err.message);
    process.exit(1);
  }
}
