/**
 * .agents/scripts/scdraw-fs.js
 *
 * ShadowClaw File System & OPFS (Origin Private File System) integration for ShadowClaw Draw.
 * Persists .svg, .png, .webp, .jpg, and .scdraw.json drawings into conversation workspaces.
 */

export const DEFAULT_GROUP_ID = "br:main";
export const DEFAULT_GROUP_NAME = "Main";
export const LEGACY_OPFS_ROOT = "shadowclaw";
export const LEGACY_DB_NAME = "shadowclaw";

const mockGroups = new Map([
  [
    DEFAULT_GROUP_ID,
    {
      groupId: DEFAULT_GROUP_ID,
      name: DEFAULT_GROUP_NAME,
      createdAt: 0,
      isDefault: true,
    },
  ],
]);

// Map<safeGroupId, Map<filename, { name, data: Uint8Array, size, lastModified }>>
const mockFiles = new Map();
let forceMockStorage = false;

export function setMockFsStorage(options = {}) {
  if (options.clearAll) {
    mockGroups.clear();
    mockFiles.clear();
    mockGroups.set(DEFAULT_GROUP_ID, {
      groupId: DEFAULT_GROUP_ID,
      name: DEFAULT_GROUP_NAME,
      createdAt: 0,
      isDefault: true,
    });
  }

  if (Array.isArray(options.conversations)) {
    for (const group of options.conversations) {
      const gid = group.groupId || DEFAULT_GROUP_ID;
      mockGroups.set(gid, {
        groupId: gid,
        name: group.name || gid,
        createdAt: group.createdAt || Date.now(),
        isDefault: gid === DEFAULT_GROUP_ID,
      });
    }
  }

  if (options.files && typeof options.files === "object") {
    for (const [gid, files] of Object.entries(options.files)) {
      const safeId = sanitizeGroupId(gid);
      if (!mockFiles.has(safeId)) mockFiles.set(safeId, new Map());
      const dirMap = mockFiles.get(safeId);
      for (const [fname, content] of Object.entries(files)) {
        const cleanName = sanitizeFilename(fname);
        const u8 = toUint8Array(content);
        dirMap.set(cleanName, {
          name: cleanName,
          data: u8,
          size: u8.byteLength,
          lastModified: Date.now(),
        });
      }
    }
  }

  if (typeof options.forceMock === "boolean") {
    forceMockStorage = options.forceMock;
  }
}

export function resetMockFsStorage() {
  forceMockStorage = false;
  mockGroups.clear();
  mockFiles.clear();
  mockGroups.set(DEFAULT_GROUP_ID, {
    groupId: DEFAULT_GROUP_ID,
    name: DEFAULT_GROUP_NAME,
    createdAt: 0,
    isDefault: true,
  });
}

function toUint8Array(content) {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return new Uint8Array(0);
}

export function sanitizeGroupId(groupId) {
  if (!groupId || typeof groupId !== "string") return "br-main";
  return groupId.trim().replace(/:/g, "-");
}

export function unsanitizeGroupId(safeId) {
  if (!safeId || typeof safeId !== "string") return DEFAULT_GROUP_ID;
  if (safeId.startsWith("br-")) return `br:${safeId.slice(3)}`;
  if (safeId.startsWith("server-")) return `server:${safeId.slice(7)}`;
  if (safeId.startsWith("peer-")) return `peer:${safeId.slice(5)}`;
  if (safeId.startsWith("room-")) return `room:${safeId.slice(5)}`;
  return safeId;
}

export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== "string") {
    throw new Error("A valid filename is required.");
  }
  const normalized = filename.replace(/\\/g, "/");
  const base = normalized.split("/").filter(Boolean).pop() || "";
  if (!base || base === "." || base === "..") {
    throw new Error(`Invalid filename: "${filename}"`);
  }
  return base.replace(/[\0<>:"|?*]/g, "_");
}

export function getAppBasePath() {
  const loc =
    typeof window !== "undefined" && window.location
      ? window.location
      : typeof self !== "undefined" && self.location
        ? self.location
        : null;

  if (
    typeof document !== "undefined" &&
    typeof document.querySelector === "function"
  ) {
    const baseEl = document.querySelector("base[href]");
    if (baseEl) {
      const href = baseEl.getAttribute("href");
      if (href) {
        try {
          let base = new URL(href, loc ? loc.origin : "http://localhost")
            .pathname;
          if (!base.endsWith("/")) base += "/";
          return base;
        } catch (_) {}
      }
    }
  }

  if (!loc) return "/";
  const pathname = loc.pathname || "/";
  if (pathname === "/") return "/";
  const parts = pathname.split("/").filter(Boolean);
  const VALID_PAGES = new Set([
    "pages",
    "chat",
    "tasks",
    "files",
    "settings",
    "share",
  ]);
  const pageIndex = parts.findIndex((p) => VALID_PAGES.has(p.toLowerCase()));
  if (pageIndex >= 0) {
    return pageIndex === 0
      ? "/"
      : "/" + parts.slice(0, pageIndex).join("/") + "/";
  }
  if (parts.length >= 1 && !parts[0].includes(".")) {
    return "/" + parts[0] + "/";
  }
  return "/";
}

export function getDeploymentNamespace() {
  const g =
    typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
        ? self
        : globalThis;
  if (g && g.__SHADOWCLAW_DEPLOY_ID__) {
    const customId = String(g.__SHADOWCLAW_DEPLOY_ID__).trim();
    if (customId) return customId.replace(/[^a-zA-Z0-9_-]/g, "-");
  }
  const basePath = getAppBasePath();
  if (!basePath || basePath === "/") return "";
  return basePath.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function getOpfsRootName() {
  const ns = getDeploymentNamespace();
  return ns ? `shadowclaw-${ns}` : LEGACY_OPFS_ROOT;
}

export function getDbName() {
  const ns = getDeploymentNamespace();
  return ns ? `shadowclaw-${ns}` : LEGACY_DB_NAME;
}

export function isOpfsAvailable() {
  if (forceMockStorage) return false;
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.storage) &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function getOpfsGroupsDirectory(create = true) {
  if (!isOpfsAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const primaryName = getOpfsRootName();
    let appDir = null;
    try {
      appDir = await root.getDirectoryHandle(primaryName, { create });
    } catch (_) {
      if (primaryName !== LEGACY_OPFS_ROOT) {
        appDir = await root.getDirectoryHandle(LEGACY_OPFS_ROOT, { create });
      }
    }
    if (!appDir) return null;
    return await appDir.getDirectoryHandle("groups", { create });
  } catch (_) {
    return null;
  }
}

export async function getConversationDirHandle(
  groupId = DEFAULT_GROUP_ID,
  { create = false } = {},
) {
  if (!isOpfsAvailable()) return null;
  const groupsDir = await getOpfsGroupsDirectory(create);
  if (!groupsDir) return null;
  try {
    return await groupsDir.getDirectoryHandle(sanitizeGroupId(groupId), {
      create,
    });
  } catch (err) {
    if (create) throw err;
    return null;
  }
}

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

export function formatFileSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes <= 0)
    return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getDrawFileIcon(filename) {
  const { format, isBitmap } = classifyDrawFile(filename);
  if (format === "svg") return "✒️";
  if (format === "scdraw-anim-json" || format === "gif" || format === "apng")
    return "🎞️";
  if (format === "webm" || format === "mp4") return "🎬";
  if (format === "scdraw-json") return "📐";
  if (isBitmap) return "🖼️";
  return "📁";
}

export async function listConversations() {
  const map = new Map();
  map.set(DEFAULT_GROUP_ID, {
    groupId: DEFAULT_GROUP_ID,
    name: DEFAULT_GROUP_NAME,
    isDefault: true,
  });

  if (isOpfsAvailable()) {
    try {
      const groupsDir = await getOpfsGroupsDirectory(false);
      if (groupsDir) {
        for await (const [safeName, handle] of groupsDir.entries()) {
          if (handle.kind === "directory") {
            const gid = unsanitizeGroupId(safeName);
            if (!map.has(gid)) {
              map.set(gid, {
                groupId: gid,
                name: safeName === "br-main" ? DEFAULT_GROUP_NAME : gid,
                isDefault: gid === DEFAULT_GROUP_ID,
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  for (const [gid, g] of mockGroups.entries()) {
    if (!map.has(gid)) map.set(gid, g);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.groupId === DEFAULT_GROUP_ID) return -1;
    if (b.groupId === DEFAULT_GROUP_ID) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listWorkspaceFiles(groupId = DEFAULT_GROUP_ID) {
  const safeId = sanitizeGroupId(groupId);
  const files = [];

  if (!isOpfsAvailable()) {
    const dirMap = mockFiles.get(safeId);
    if (dirMap) {
      for (const item of dirMap.values()) {
        files.push({
          name: item.name,
          size: item.size,
          lastModified: item.lastModified || Date.now(),
          ...classifyDrawFile(item.name),
        });
      }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  try {
    const dirHandle = await getConversationDirHandle(groupId, {
      create: false,
    });
    if (!dirHandle) return [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file") {
        const file = await handle.getFile();
        files.push({
          name,
          size: file.size,
          lastModified: file.lastModified,
          ...classifyDrawFile(name),
        });
      }
    }
  } catch (_) {}

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readWorkspaceFile(groupId = DEFAULT_GROUP_ID, filename) {
  const cleanName = sanitizeFilename(filename);
  const safeId = sanitizeGroupId(groupId);

  if (!isOpfsAvailable()) {
    const item = mockFiles.get(safeId)?.get(cleanName);
    if (!item) {
      throw new Error(`File "${cleanName}" not found in "${groupId}".`);
    }
    const uint8Array = item.data;
    const buffer = uint8Array.buffer.slice(
      uint8Array.byteOffset,
      uint8Array.byteOffset + uint8Array.byteLength,
    );
    const text = new TextDecoder("utf-8").decode(uint8Array);
    return {
      name: cleanName,
      size: item.size,
      lastModified: item.lastModified,
      buffer,
      uint8Array,
      text,
      ...classifyDrawFile(cleanName),
    };
  }

  const dirHandle = await getConversationDirHandle(groupId, { create: false });
  if (!dirHandle) {
    throw new Error(`Workspace directory "${safeId}" not found.`);
  }
  const fileHandle = await dirHandle.getFileHandle(cleanName, {
    create: false,
  });
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8").decode(uint8Array);
  return {
    name: cleanName,
    size: file.size,
    lastModified: file.lastModified,
    buffer,
    uint8Array,
    text,
    ...classifyDrawFile(cleanName),
  };
}

export async function saveWorkspaceFile(
  groupId = DEFAULT_GROUP_ID,
  filename,
  content,
) {
  const cleanName = sanitizeFilename(filename);
  const safeId = sanitizeGroupId(groupId);
  let u8;
  if (typeof Blob !== "undefined" && content instanceof Blob) {
    u8 = new Uint8Array(await content.arrayBuffer());
  } else {
    u8 = toUint8Array(content);
  }

  if (!isOpfsAvailable()) {
    if (!mockFiles.has(safeId)) mockFiles.set(safeId, new Map());
    mockFiles.get(safeId).set(cleanName, {
      name: cleanName,
      data: u8,
      size: u8.byteLength,
      lastModified: Date.now(),
    });
    return {
      ok: true,
      name: cleanName,
      bytes: u8.byteLength,
      groupId,
      path: `groups/${safeId}/${cleanName}`,
      storageType: "memory",
    };
  }

  const dirHandle = await getConversationDirHandle(groupId, { create: true });
  if (!dirHandle) {
    throw new Error(`Unable to open OPFS directory for "${groupId}".`);
  }
  const fileHandle = await dirHandle.getFileHandle(cleanName, { create: true });
  if (typeof fileHandle.createWritable === "function") {
    const writable = await fileHandle.createWritable();
    await writable.write(u8);
    await writable.close();
  } else if (typeof fileHandle.createSyncAccessHandle === "function") {
    const sync = await fileHandle.createSyncAccessHandle();
    try {
      sync.truncate(0);
      sync.write(u8, { at: 0 });
      if (typeof sync.flush === "function") sync.flush();
    } finally {
      sync.close();
    }
  } else {
    throw new Error("OPFS writable handle unavailable.");
  }

  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent("scdraw-file-saved", {
          detail: {
            groupId,
            filename: cleanName,
            path: `groups/${safeId}/${cleanName}`,
          },
        }),
      );
    } catch (_) {}
  }

  return {
    ok: true,
    name: cleanName,
    bytes: u8.byteLength,
    groupId,
    path: `groups/${safeId}/${cleanName}`,
    storageType: "opfs",
  };
}

export async function deleteWorkspaceFile(
  groupId = DEFAULT_GROUP_ID,
  filename,
) {
  const cleanName = sanitizeFilename(filename);
  const safeId = sanitizeGroupId(groupId);

  if (!isOpfsAvailable()) {
    mockFiles.get(safeId)?.delete(cleanName);
    return { ok: true, name: cleanName, groupId };
  }

  const dirHandle = await getConversationDirHandle(groupId, { create: false });
  if (dirHandle) {
    await dirHandle.removeEntry(cleanName);
  }
  return { ok: true, name: cleanName, groupId };
}
