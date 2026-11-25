/**
 * .agents/scripts/components/shadow-claw-draw-styles.js
 *
 * Shared CSS stylesheet tokens and mobile-first BEM utility classes
 * for ShadowClaw Draw Web Components (Light & Dark theme adaptive).
 */

import { installPageSwipeGuard as installSharedPageSwipeGuard } from "shadow-claw/utils/page-swipe-guard";
import {
  resolveWorkbenchFullscreenState as resolveSharedWorkbenchFullscreenState,
  setupWorkbenchFullscreen as setupSharedWorkbenchFullscreen,
} from "shadow-claw/utils/workbench-fullscreen";

export const SHARED_STYLES = `
:host {
  display: block;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  font-family: var(--shadow-claw-font-sans, system-ui, -apple-system, sans-serif);
  color: var(--shadow-claw-text-primary, #e2e8f0);
  --bg-app: var(--shadow-claw-bg-primary, #0f1419);
  --bg-card: var(--shadow-claw-bg-secondary, #18202a);
  --bg-elevated: var(--shadow-claw-bg-tertiary, #212b38);
  --border: var(--shadow-claw-border-color, #334155);
  --border-subtle: rgba(148, 163, 184, 0.2);
  --accent: var(--shadow-claw-accent-primary, #38bdf8);
  --accent-hover: var(--shadow-claw-accent-hover, #7dd3fc);
  --accent-secondary: var(--md-sys-color-secondary, #f59e0b);
  --on-accent: var(--shadow-claw-on-primary, #082f49);
  --accent-container: var(--md-sys-color-primary-container, rgba(56, 189, 248, 0.2));
  --on-accent-container: var(--md-sys-color-on-primary-container, #e0f2fe);
  --success: var(--shadow-claw-success-color, #4ade80);
  --warning: var(--shadow-claw-warning-color, #f59e0b);
  --danger: var(--shadow-claw-error-color, #dc2626);
  --mono: var(--shadow-claw-font-mono, "JetBrains Mono", ui-monospace, monospace);
  --text-primary: var(--shadow-claw-text-primary, #e2e8f0);
  --text-secondary: var(--shadow-claw-text-secondary, #94a3b8);
  --text-muted: var(--shadow-claw-text-tertiary, #64748b);
}

*, *::before, *::after {
  box-sizing: border-box;
}

.hidden,
[hidden] {
  display: none !important;
}

:focus-visible {
  outline: 2px solid var(--accent, #38bdf8) !important;
  outline-offset: 2px !important;
}

.scdraw-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  height: 100%;
}

.scdraw-panel__header {
  padding: 0.45rem 0.65rem;
  background: rgba(100, 116, 139, 0.1);
  border-bottom: 1px solid var(--border);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  flex-wrap: wrap;
  flex-shrink: 0;
  color: var(--text-primary);
}

.scdraw-btn {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.38rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  line-height: 1.15;
  white-space: nowrap;
  text-decoration: none;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  min-width: 0;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.scdraw-btn:hover {
  background: var(--bg-card);
  border-color: var(--accent);
  color: var(--text-primary);
}

.scdraw-btn:disabled,
.scdraw-btn[aria-disabled="true"] {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.scdraw-btn--primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
  font-weight: 700;
}

.scdraw-btn--primary:hover {
  background: var(--accent-hover);
  color: var(--on-accent);
  border-color: var(--accent-hover);
}

.scdraw-btn--active,
.scdraw-btn[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
}

.scdraw-btn--active:hover,
.scdraw-btn[aria-pressed="true"]:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--on-accent);
}

.scdraw-btn--danger {
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger);
  border-color: rgba(220, 38, 38, 0.4);
}

.scdraw-btn--sm {
  padding: 0.28rem 0.5rem;
  font-size: 0.74rem;
}

.scdraw-studio-switch {
  display: inline-flex;
  align-items: center;
  background: var(--bg-app);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.scdraw-studio-switch__item {
  border: none;
  border-radius: 5px;
  padding: 0.28rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-secondary);
  background: transparent;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  cursor: pointer;
}

.scdraw-studio-switch__item:hover {
  color: var(--text-primary);
  background: rgba(148, 163, 184, 0.14);
}

.scdraw-studio-switch__item[aria-current="page"] {
  background: var(--accent);
  color: var(--on-accent);
}

.scdraw-input,
.scdraw-select {
  background: var(--bg-app);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0.28rem 0.45rem;
  font-size: 0.78rem;
  font-family: inherit;
  min-width: 0;
  max-width: 100%;
}

input[type="range"] {
  min-width: 0;
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.scdraw-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-family: var(--mono);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.scdraw-fullscreen-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.scdraw-fullscreen-icon--exit {
  display: none;
}

[aria-pressed="true"] .scdraw-fullscreen-icon--enter {
  display: none;
}

[aria-pressed="true"] .scdraw-fullscreen-icon--exit {
  display: inline-flex;
}

.scdraw-fullscreen-label {
  white-space: nowrap;
}

.scdraw-scrollable {
  --scrollbar-thumb: var(--text-secondary);
  --scrollbar-track: var(--bg-card);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

@supports not (scrollbar-color: auto) {
  .scdraw-scrollable {
    scrollbar-width: auto;
  }
  .scdraw-scrollable::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .scdraw-scrollable::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }
  .scdraw-scrollable::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
}

.scdraw-panel-toggles {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--bg-app);
  border: 1px solid var(--border);
  border-radius: 7px;
  flex-shrink: 0;
}

.scdraw-panel-toggle {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
  padding: 0.24rem 0.48rem;
  font-size: 0.72rem;
}

.scdraw-panel-toggle:hover {
  background: rgba(148, 163, 184, 0.14);
  border-color: transparent;
  color: var(--text-primary);
}

.scdraw-panel-toggle[aria-pressed="true"] {
  background: var(--accent-container);
  border-color: var(--accent);
  color: var(--on-accent-container);
  font-weight: 700;
}

.scdraw-panel-toggle[aria-pressed="true"]:hover {
  background: var(--accent-container);
  border-color: var(--accent-hover);
  color: var(--on-accent-container);
}

@media (pointer: coarse) {
  .scdraw-btn,
  .scdraw-studio-switch__item,
  .scdraw-input,
  .scdraw-select,
  input[type="color"] {
    min-height: 44px;
  }
}
`;

export function computeWorkspaceGridColumns({
  showToolbox = true,
  showLayers = true,
  showSecondary = true,
  toolboxTrack = "156px",
  layersVar = "var(--layers-width)",
  secondaryVar = "var(--filters-width)",
} = {}) {
  const cols = [];
  if (showToolbox) cols.push(toolboxTrack);
  cols.push("minmax(0, 1fr)");
  if (showLayers) cols.push("auto", layersVar);
  if (showSecondary) cols.push("auto", secondaryVar);
  return cols.join(" ");
}

export function installPageSwipeGuard(host) {
  return installSharedPageSwipeGuard(host, {
    extraSelectors: [".scdraw-workbench-page"],
  });
}

export function resolveWorkbenchFullscreenState(isFullscreen, options = {}) {
  const resolved = resolveSharedWorkbenchFullscreenState(isFullscreen, {
    hostClass: "scdraw-workbench--fullscreen",
    ...options,
  });
  return {
    ...resolved,
    hostClass: resolved.isFullscreen ? resolved.hostClass : "",
  };
}

export function setupWorkbenchFullscreen(options = {}) {
  return setupSharedWorkbenchFullscreen({
    workbenchClass: "scdraw-workbench--fullscreen",
    pageClass: "scdraw-workbench-page--fullscreen",
    activeBtnClass: "scdraw-btn--active",
    labelSelector: ".scdraw-fullscreen-label",
    iconSelector: ".scdraw-fullscreen-icon",
    enterIconSelector: ".scdraw-fullscreen-icon--enter",
    ...options,
  });
}
