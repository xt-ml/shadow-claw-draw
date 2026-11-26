import "shadow-claw/components/shadow-claw-dialog";
import { clearUrlParam } from "shadow-claw/utils/url-file-param";
import { scdraw } from "./shadow-claw-draw-engine.js";
import { parseAnimatedSvgToAnimationDocument } from "./shadow-claw-draw-anim-svg.js";

function getOrCreateConfirmDialog(shadowRoot) {
  if (!shadowRoot) return null;
  let dialogWrapper = shadowRoot.getElementById("scdraw-url-file-dialog");
  if (dialogWrapper) return dialogWrapper;

  dialogWrapper = document.createElement("shadow-claw-dialog");
  dialogWrapper.id = "scdraw-url-file-dialog";
  dialogWrapper.setAttribute("dialog-class", "scdraw-dialog");
  dialogWrapper.setAttribute("dialog-aria-labelledby", "scdraw-url-file-title");
  dialogWrapper.innerHTML = `
    <form method="dialog" class="scdraw-dialog__form">
      <h3 id="scdraw-url-file-title" class="scdraw-dialog__title">Load File from URL</h3>
      <p id="scdraw-url-file-message" class="scdraw-dialog__message"></p>
      <div class="scdraw-dialog__actions">
        <button type="submit" value="cancel" id="scdraw-url-file-cancel" class="scdraw-btn" autofocus>Cancel</button>
        <button type="submit" value="confirm" id="scdraw-url-file-confirm" class="scdraw-btn scdraw-btn--primary">Load File</button>
      </div>
    </form>
  `;
  shadowRoot.appendChild(dialogWrapper);
  return dialogWrapper;
}

async function confirmLoadFromUrlDialog(
  workbench,
  { title, message, confirmText = "Load File", cancelText = "Cancel" },
) {
  const shadowRoot = workbench?.shadowRoot;
  if (
    typeof customElements !== "undefined" &&
    !customElements.get("shadow-claw-dialog")
  ) {
    await Promise.race([
      customElements.whenDefined("shadow-claw-dialog"),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }

  if (workbench?.isConnected === false) return false;

  const dialogWrapper = getOrCreateConfirmDialog(shadowRoot);
  const nativeDialog =
    dialogWrapper?.dialog || dialogWrapper?.querySelector?.("dialog");

  if (
    !dialogWrapper ||
    typeof dialogWrapper.showModal !== "function" ||
    !nativeDialog
  ) {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(`${title}\n\n${message}`);
    }
    return false;
  }

  const titleEl = shadowRoot.getElementById("scdraw-url-file-title");
  const msgEl = shadowRoot.getElementById("scdraw-url-file-message");
  const cancelBtn = shadowRoot.getElementById("scdraw-url-file-cancel");
  const confirmBtn = shadowRoot.getElementById("scdraw-url-file-confirm");

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (cancelBtn) cancelBtn.textContent = cancelText;
  if (confirmBtn) confirmBtn.textContent = confirmText;

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      nativeDialog.removeEventListener("close", handleClose);
      confirmBtn?.removeEventListener("click", handleConfirmClick);
      cancelBtn?.removeEventListener("click", handleCancelClick);
    };
    const finish = (isConfirmed) => {
      if (settled) return;
      settled = true;
      cleanup();
      nativeDialog.returnValue = "";
      resolve(isConfirmed);
    };
    const handleClose = () => {
      finish(nativeDialog.returnValue === "confirm");
    };
    const closeWith = (val) => {
      nativeDialog.returnValue = val;
      if (typeof dialogWrapper.close === "function") {
        dialogWrapper.close(val);
      } else if (typeof nativeDialog.close === "function") {
        nativeDialog.close(val);
      }
      finish(val === "confirm");
    };
    const handleConfirmClick = (e) => {
      e?.preventDefault?.();
      closeWith("confirm");
    };
    const handleCancelClick = (e) => {
      e?.preventDefault?.();
      closeWith("cancel");
    };

    nativeDialog.addEventListener("close", handleClose, { once: true });
    confirmBtn?.addEventListener("click", handleConfirmClick);
    cancelBtn?.addEventListener("click", handleCancelClick);

    try {
      dialogWrapper.showModal();
      confirmBtn?.focus?.();
    } catch (err) {
      cleanup();
      console.error("[scdraw] Failed to open confirmation dialog:", err);
      resolve(false);
    }
  });
}

/**
 * Prompts the user before loading a decoded `#file=` URL payload into ShadowClaw Draw,
 * preventing accidental replacement of the active document.
 */
export async function openDrawFileFromUrl(
  workbench,
  payload,
  { studioLabel = "ShadowClaw Draw" } = {},
) {
  if (!payload?.content) return false;
  if (workbench?._checkingFileUrlParam) return false;
  if (workbench) workbench._checkingFileUrlParam = true;

  try {
    if (globalThis.__scdrawHandledUrlFile === payload.content) {
      clearUrlParam("file");
      clearUrlParam("name");
      return false;
    }

    const displayName = payload.name || "shared file";
    const confirmed = await confirmLoadFromUrlDialog(workbench, {
      title: "Load File from URL",
      message: `Would you like to load "${displayName}" into ${studioLabel}? This will replace your current document.`,
      confirmText: "Load File",
      cancelText: "Cancel",
    });

    if (confirmed) {
      globalThis.__scdrawHandledUrlFile = payload.content;
      const isAnimationStudio = studioLabel === "Animation Studio";
      const isSvgContent =
        String(payload.name || "")
          .toLowerCase()
          .endsWith(".svg") ||
        String(payload.content || "")
          .trimStart()
          .startsWith("<svg");
      if (isAnimationStudio && isSvgContent) {
        try {
          const anim = parseAnimatedSvgToAnimationDocument(payload.content);
          scdraw.importAnimationFrames({
            frames: anim.frames.map((f) => ({
              doc: f.doc,
              delayMs: f.delayMs,
              name: f.name,
            })),
            width: anim.width,
            height: anim.height,
            mode: "vector",
            replace: true,
          });
          scdraw.statusMessage.set(`Loaded ${payload.name || "SVG"}`);
        } catch (err) {
          scdraw.statusMessage.set(
            `Failed to load animated SVG: ${err?.message || err}`,
          );
        }
      } else {
        scdraw.loadFromText(payload.name, payload.content);
      }
      clearUrlParam("file");
      clearUrlParam("name");
      return true;
    } else if (workbench?.isConnected !== false) {
      globalThis.__scdrawHandledUrlFile = payload.content;
    }
    return false;
  } catch (err) {
    scdraw.statusMessage.set(`Failed to load URL file: ${err?.message || err}`);
    return false;
  } finally {
    if (workbench) workbench._checkingFileUrlParam = false;
  }
}
