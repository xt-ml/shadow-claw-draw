/**
 * .agents/scripts/components/shadow-claw-draw-resize-handle.js
 *
 * Accessible, touch-friendly split-pane resize handle (<shadow-claw-draw-resize-handle>).
 * Delegates to ShadowClaw's shared `<shadow-claw-resize-handle>` base element while
 * preserving the `scdraw-resize` / `scdraw-resize-end` custom event contract.
 */

import { defineElement } from "shadow-claw/components/shadow-claw-element";
import {
  ShadowClawResizeHandle,
  clampSize,
  computeKeyboardResize,
  getResizeHandleAriaAttributes,
} from "shadow-claw/components/shadow-claw-resize-handle";

export {
  clampSize,
  computeKeyboardResize,
  getResizeHandleAriaAttributes as getAriaAttributes,
};

export class ShadowClawDrawResizeHandle extends ShadowClawResizeHandle {
  connectedCallback() {
    if (
      typeof this.hasAttribute === "function" &&
      !this.hasAttribute("step") &&
      typeof this.setAttribute === "function"
    ) {
      this.setAttribute("step", "12");
    }

    super.connectedCallback();

    if (typeof this.addEventListener === "function") {
      const onResize = (e) => {
        this.dispatchEvent(
          new CustomEvent("scdraw-resize", {
            bubbles: true,
            composed: true,
            detail: e.detail,
          }),
        );
      };
      const onResizeEnd = (e) => {
        this.dispatchEvent(
          new CustomEvent("scdraw-resize-end", {
            bubbles: true,
            composed: true,
            detail: e.detail,
          }),
        );
      };
      this.addEventListener("shadow-claw-resize", onResize);
      this.addEventListener("shadow-claw-resize-end", onResizeEnd);
      this.addCleanup(() => {
        this.removeEventListener("shadow-claw-resize", onResize);
        this.removeEventListener("shadow-claw-resize-end", onResizeEnd);
      });
    }
  }
}

defineElement("shadow-claw-draw-resize-handle", ShadowClawDrawResizeHandle);
