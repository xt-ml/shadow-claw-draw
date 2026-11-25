/**
 * .agents/scripts/shadow-claw-draw-fs.js
 *
 * ShadowClaw File System & OPFS (Origin Private File System) integration for ShadowClaw Draw.
 * Delegates conversation storage and mocks to `shadow-claw/utils/workspace-fs`, adding Draw
 * file classification and icons.
 */

import {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  LEGACY_OPFS_ROOT,
  LEGACY_DB_NAME,
  sanitizeGroupId,
  unsanitizeGroupId,
  sanitizeWorkspaceFilename as sanitizeFilename,
  getAppBasePath,
  getDeploymentNamespace,
  getOpfsRootName,
  getDbName,
  isOpfsAvailable,
  getConversationDirHandle,
  formatFileSize,
  listConversations,
  listWorkspaceFiles as listSharedWorkspaceFiles,
  readWorkspaceFile as readSharedWorkspaceFile,
  saveWorkspaceFile as saveSharedWorkspaceFile,
  deleteWorkspaceFile,
  setMockWorkspaceFsStorage as setMockFsStorage,
  resetMockWorkspaceFsStorage as resetMockFsStorage,
} from "shadow-claw/utils/workspace-fs";

export {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  LEGACY_OPFS_ROOT,
  LEGACY_DB_NAME,
  setMockFsStorage,
  resetMockFsStorage,
  sanitizeGroupId,
  unsanitizeGroupId,
  sanitizeFilename,
  getAppBasePath,
  getDeploymentNamespace,
  getOpfsRootName,
  getDbName,
  isOpfsAvailable,
  getConversationDirHandle,
  formatFileSize,
  listConversations,
  deleteWorkspaceFile,
};

export function classifyDrawFile(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".svg")) {
    return { format: "svg", isVector: true, isBitmap: false, isProject: true };
  }
  if (lower.endsWith(".scdraw-anim.json")) {
    return {
      format: "scdraw-anim-json",
      isVector: false,
      isBitmap: false,
      isProject: true,
      isAnimation: true,
    };
  }
  if (lower.endsWith(".scdraw.json") || lower.endsWith(".json")) {
    return {
      format: "scdraw-json",
      isVector: false,
      isBitmap: false,
      isProject: true,
    };
  }
  if (lower.endsWith(".gif")) {
    return {
      format: "gif",
      isVector: false,
      isBitmap: true,
      isProject: false,
      isAnimation: true,
    };
  }
  if (lower.endsWith(".apng")) {
    return {
      format: "apng",
      isVector: false,
      isBitmap: true,
      isProject: false,
      isAnimation: true,
    };
  }
  if (lower.endsWith(".webm") || lower.endsWith(".mp4")) {
    return {
      format: lower.endsWith(".mp4") ? "mp4" : "webm",
      isVector: false,
      isBitmap: false,
      isProject: false,
      isAnimation: true,
    };
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  ) {
    const format = lower.endsWith(".png")
      ? "png"
      : lower.endsWith(".webp")
        ? "webp"
        : "jpeg";
    return { format, isVector: false, isBitmap: true, isProject: false };
  }
  return {
    format: "other",
    isVector: false,
    isBitmap: false,
    isProject: false,
  };
}

export function getDrawFileIcon(filename) {
  const { format, isBitmap } = classifyDrawFile(filename);
  if (format === "svg") return "✒️";
  if (format === "scdraw-anim-json" || format === "gif" || format === "apng") {
    return "🎞️";
  }
  if (format === "webm" || format === "mp4") return "🎬";
  if (format === "scdraw-json") return "📐";
  if (isBitmap) return "🖼️";
  return "📁";
}

export async function listWorkspaceFiles(groupId = DEFAULT_GROUP_ID) {
  return await listSharedWorkspaceFiles(groupId, {
    classify: classifyDrawFile,
  });
}

export async function readWorkspaceFile(groupId = DEFAULT_GROUP_ID, filename) {
  return await readSharedWorkspaceFile(groupId, filename, {
    classify: classifyDrawFile,
  });
}

export async function saveWorkspaceFile(
  groupId = DEFAULT_GROUP_ID,
  filename,
  content,
) {
  return await saveSharedWorkspaceFile(groupId, filename, content, {
    eventName: "scdraw-workspace-changed",
  });
}
