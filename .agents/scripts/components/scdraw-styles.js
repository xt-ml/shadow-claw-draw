/**
 * .agents/scripts/components/scdraw-styles.js
 *
 * Shared CSS stylesheet tokens and mobile-first BEM utility classes
 * for ShadowClaw Draw Web Components (Light & Dark theme adaptive).
 */

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

const SWIPE_GUARD_ATTRS = ["data-no-swipe", "data-no-nav"];
const ancestorRefCounts = new WeakMap();

/**
 * Suppresses ShadowClaw Pages horizontal swipe and arrow-key navigation across
 * the workbench host and its enclosing page viewer containers while mounted.
 * Uses WeakMap reference counting on shared ancestors so Vector <-> Bitmap <-> Animation
 * transitions keep protection intact and clean teardown restores prior state.
 *
 * @param {HTMLElement} host
 * @returns {() => void}
 */
export function installPageSwipeGuard(host) {
  if (host && typeof host.setAttribute === "function") {
    for (const attr of SWIPE_GUARD_ATTRS) {
      host.setAttribute(attr, "true");
    }
  }

  const tracked = [];
  if (host && typeof host.closest === "function") {
    const ancestors = new Set([
      host.closest(".scdraw-workbench-page"),
      host.closest(".pages__rendered"),
      host.closest(".pages__viewer"),
    ]);
    for (const el of ancestors) {
      if (!el || typeof el.setAttribute !== "function") continue;
      let entry = ancestorRefCounts.get(el);
      if (!entry) {
        const prev = {};
        for (const attr of SWIPE_GUARD_ATTRS) {
          prev[attr] =
            typeof el.getAttribute === "function"
              ? el.getAttribute(attr)
              : null;
        }
        entry = { count: 0, prev };
      }
      entry.count += 1;
      ancestorRefCounts.set(el, entry);
      for (const attr of SWIPE_GUARD_ATTRS) {
        el.setAttribute(attr, "true");
      }
      tracked.push(el);
    }
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    for (const el of tracked) {
      const entry = ancestorRefCounts.get(el);
      if (!entry) continue;
      entry.count -= 1;
      if (entry.count <= 0) {
        ancestorRefCounts.delete(el);
        for (const attr of SWIPE_GUARD_ATTRS) {
          const prevVal = entry.prev[attr];
          if (prevVal !== null && prevVal !== undefined) {
            el.setAttribute(attr, prevVal);
          } else if (typeof el.removeAttribute === "function") {
            el.removeAttribute(attr);
          }
        }
      }
    }
  };
}

/**
 * Resolves fullscreen state and UI attributes for a studio workbench button and host.
 *
 * @param {boolean} isFullscreen
 * @param {{ studioName?: string }} [options]
 * @returns {{
 *   isFullscreen: boolean,
 *   ariaLabel: string,
 *   ariaPressed: "true" | "false",
 *   title: string,
 *   btnText: string,
 *   btnIcon: string,
 *   hostClass: string,
 * }}
 */
export function resolveWorkbenchFullscreenState(
  isFullscreen,
  { studioName = "studio" } = {},
) {
  const active = Boolean(isFullscreen);
  return {
    isFullscreen: active,
    ariaLabel: active ? "Exit full screen mode" : "Enter full screen mode",
    ariaPressed: active ? "true" : "false",
    title: active
      ? "Exit full screen mode (restore app navigation)"
      : `Full screen mode (hide app navigation and focus on ${studioName})`,
    btnText: active ? "Exit Full Screen" : "Full Screen",
    btnIcon: active ? "✕" : "⛶",
    hostClass: active ? "scdraw-workbench--fullscreen" : "",
  };
}

/**
 * Toggles fullscreen mode for a studio workbench and host page container.
 * Uses the Fullscreen API when supported and synchronizes CSS fixed-overlay
 * fullscreen classes, ARIA attributes, Escape ordering, and fullscreenchange events.
 *
 * @param {Object} [options]
 * @param {HTMLElement} [options.workbenchEl]
 * @param {HTMLElement} [options.fullscreenBtn]
 * @param {HTMLElement|null} [options.pageEl]
 * @param {string} [options.studioName]
 * @param {Object|null} [options.windowObj]
 * @param {Object|null} [options.documentObj]
 * @param {(active: boolean) => void} [options.onStateChange]
 * @returns {{ toggle: (force?: boolean) => void, setState: (force?: boolean) => void, isFullscreen: () => boolean, dispose: () => void }}
 */
export function setupWorkbenchFullscreen({
  workbenchEl,
  fullscreenBtn,
  pageEl,
  studioName = "studio",
  windowObj = typeof window !== "undefined" ? window : null,
  documentObj = typeof document !== "undefined" ? document : null,
  onStateChange,
} = {}) {
  let isFullscreen = false;
  let hostPageEl = null;
  let savedHostTransform = null;

  const findHostPageContainer = (startEl) => {
    let cur = startEl;
    for (let i = 0; i < 12 && cur; i++) {
      if (
        cur !== workbenchEl &&
        cur !== pageEl &&
        cur.classList?.contains?.("page")
      ) {
        return cur;
      }
      if (cur.parentElement) {
        cur = cur.parentElement;
      } else {
        const root =
          typeof cur.getRootNode === "function" ? cur.getRootNode() : null;
        if (!root || root === cur) {
          cur = null;
        } else if (typeof ShadowRoot !== "undefined") {
          cur = root instanceof ShadowRoot ? root.host : null;
        } else {
          cur = root.host || null;
        }
      }
    }
    return null;
  };

  const applyHostPageTransform = (active) => {
    if (active) {
      hostPageEl = findHostPageContainer(pageEl || workbenchEl);
      if (hostPageEl?.style && savedHostTransform === null) {
        savedHostTransform = {
          value: hostPageEl.style.getPropertyValue?.("transform") || "",
          priority: hostPageEl.style.getPropertyPriority?.("transform") || "",
        };
        hostPageEl.style.setProperty?.("transform", "none", "important");
      }
    } else if (hostPageEl?.style && savedHostTransform !== null) {
      if (savedHostTransform.value) {
        hostPageEl.style.setProperty?.(
          "transform",
          savedHostTransform.value,
          savedHostTransform.priority,
        );
      } else {
        hostPageEl.style.removeProperty?.("transform");
      }
      savedHostTransform = null;
      hostPageEl = null;
    }
  };

  const getDocFullscreenEl = () =>
    documentObj?.fullscreenElement ||
    documentObj?.webkitFullscreenElement ||
    null;

  const updateUI = () => {
    const state = resolveWorkbenchFullscreenState(isFullscreen, { studioName });

    workbenchEl?.classList?.toggle(
      "scdraw-workbench--fullscreen",
      isFullscreen,
    );
    pageEl?.classList?.toggle(
      "scdraw-workbench-page--fullscreen",
      isFullscreen,
    );
    applyHostPageTransform(isFullscreen);

    if (fullscreenBtn) {
      fullscreenBtn.setAttribute?.("aria-pressed", state.ariaPressed);
      fullscreenBtn.setAttribute?.("aria-label", state.ariaLabel);
      fullscreenBtn.title = state.title;
      fullscreenBtn.classList?.toggle("scdraw-btn--active", state.isFullscreen);

      const labelEl = fullscreenBtn.querySelector?.(".scdraw-fullscreen-label");
      if (labelEl) labelEl.textContent = state.btnText;

      const hasEnterIcon = Boolean(
        fullscreenBtn.querySelector?.(".scdraw-fullscreen-icon--enter"),
      );
      if (!hasEnterIcon) {
        const iconEl = fullscreenBtn.querySelector?.(".scdraw-fullscreen-icon");
        if (iconEl) iconEl.textContent = state.btnIcon;
      }
    }

    if (typeof onStateChange === "function") {
      onStateChange(isFullscreen);
    }
  };

  const setState = (nextActive) => {
    const active = Boolean(nextActive);
    if (isFullscreen === active) return;
    isFullscreen = active;

    if (documentObj) {
      const docFsEl = getDocFullscreenEl();
      if (isFullscreen && !docFsEl) {
        const target = pageEl || workbenchEl;
        const req =
          target?.requestFullscreen || target?.webkitRequestFullscreen;
        if (typeof req === "function") {
          try {
            const p = req.call(target);
            p?.catch?.(() => {});
          } catch {}
        }
      } else if (!isFullscreen && docFsEl) {
        const exit =
          documentObj.exitFullscreen || documentObj.webkitExitFullscreen;
        if (typeof exit === "function") {
          try {
            const p = exit.call(documentObj);
            p?.catch?.(() => {});
          } catch {}
        }
      }
    }

    updateUI();
  };

  const toggle = (force) => {
    const next = typeof force === "boolean" ? force : !isFullscreen;
    setState(next);
  };

  const onBtnClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    toggle();
  };

  const onKeyDown = (e) => {
    if (e?.key === "Escape" && isFullscreen && !e?.defaultPrevented) {
      e?.preventDefault?.();
      setState(false);
    }
  };

  const onFullscreenChange = () => {
    const docActive = Boolean(getDocFullscreenEl());
    if (docActive !== isFullscreen) {
      setState(docActive);
    }
  };

  fullscreenBtn?.addEventListener?.("click", onBtnClick);
  windowObj?.addEventListener?.("keydown", onKeyDown);
  documentObj?.addEventListener?.("fullscreenchange", onFullscreenChange);
  documentObj?.addEventListener?.("webkitfullscreenchange", onFullscreenChange);

  updateUI();

  return {
    toggle,
    setState,
    isFullscreen: () => isFullscreen,
    dispose: () => {
      fullscreenBtn?.removeEventListener?.("click", onBtnClick);
      windowObj?.removeEventListener?.("keydown", onKeyDown);
      documentObj?.removeEventListener?.(
        "fullscreenchange",
        onFullscreenChange,
      );
      documentObj?.removeEventListener?.(
        "webkitfullscreenchange",
        onFullscreenChange,
      );

      if (documentObj) {
        const docFsEl = getDocFullscreenEl();
        if (docFsEl && (docFsEl === pageEl || docFsEl === workbenchEl)) {
          const exit =
            documentObj.exitFullscreen || documentObj.webkitExitFullscreen;
          if (typeof exit === "function") {
            try {
              const p = exit.call(documentObj);
              p?.catch?.(() => {});
            } catch {}
          }
        }
      }

      isFullscreen = false;
      applyHostPageTransform(false);
      workbenchEl?.classList?.remove?.("scdraw-workbench--fullscreen");
      pageEl?.classList?.remove?.("scdraw-workbench-page--fullscreen");
    },
  };
}
