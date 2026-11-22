import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GROUP_ID,
  sanitizeGroupId,
  unsanitizeGroupId,
  sanitizeFilename,
  classifyDrawFile,
  formatFileSize,
  getDrawFileIcon,
  listConversations,
  listWorkspaceFiles,
  saveWorkspaceFile,
  readWorkspaceFile,
  deleteWorkspaceFile,
  setMockFsStorage,
  resetMockFsStorage,
} from "../.agents/scripts/scdraw-fs.js";

test("scdraw-fs: sanitizeGroupId, unsanitizeGroupId, and sanitizeFilename block traversal", () => {
  assert.equal(sanitizeGroupId("br:main"), "br-main");
  assert.equal(sanitizeGroupId(""), "br-main");
  assert.equal(unsanitizeGroupId("br-main"), "br:main");
  assert.equal(unsanitizeGroupId("room-draw1"), "room:draw1");

  assert.equal(sanitizeFilename("my-art.svg"), "my-art.svg");
  assert.equal(sanitizeFilename("../../etc/passwd.svg"), "passwd.svg");
  assert.throws(() => sanitizeFilename(""), /filename/i);
  assert.throws(() => sanitizeFilename(".."), /invalid filename/i);
});

test("scdraw-fs: classifyDrawFile & formatting helpers", () => {
  assert.deepEqual(classifyDrawFile("logo.svg"), {
    format: "svg",
    isVector: true,
    isBitmap: false,
    isProject: true,
  });
  assert.deepEqual(classifyDrawFile("sprite.png"), {
    format: "png",
    isVector: false,
    isBitmap: true,
    isProject: false,
  });
  assert.deepEqual(classifyDrawFile("doc.scdraw.json"), {
    format: "scdraw-json",
    isVector: false,
    isBitmap: false,
    isProject: true,
  });

  assert.equal(getDrawFileIcon("logo.svg"), "✒️");
  assert.equal(getDrawFileIcon("sprite.png"), "🖼️");
  assert.equal(getDrawFileIcon("doc.scdraw.json"), "📐");
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
});

test("scdraw-fs: save, list, read, and delete workspace files across conversations", async () => {
  resetMockFsStorage();

  const convs = await listConversations();
  assert.equal(convs[0].groupId, DEFAULT_GROUP_ID);

  await saveWorkspaceFile(
    DEFAULT_GROUP_ID,
    "hero-icon.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"></svg>',
  );

  const customGid = "br:illustration";
  setMockFsStorage({
    conversations: [{ groupId: customGid, name: "Illustration Room" }],
  });
  await saveWorkspaceFile(
    customGid,
    "frame.png",
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  const mainFiles = await listWorkspaceFiles(DEFAULT_GROUP_ID);
  assert.equal(mainFiles.length, 1);
  assert.equal(mainFiles[0].name, "hero-icon.svg");
  assert.equal(mainFiles[0].format, "svg");

  const customFiles = await listWorkspaceFiles(customGid);
  assert.equal(customFiles.length, 1);
  assert.equal(customFiles[0].format, "png");

  const loadedSvg = await readWorkspaceFile(DEFAULT_GROUP_ID, "hero-icon.svg");
  assert.ok(loadedSvg.text.includes("<svg"));

  const loadedPng = await readWorkspaceFile(customGid, "frame.png");
  assert.equal(loadedPng.uint8Array[0], 137);

  await deleteWorkspaceFile(DEFAULT_GROUP_ID, "hero-icon.svg");
  const afterDelete = await listWorkspaceFiles(DEFAULT_GROUP_ID);
  assert.equal(afterDelete.length, 0);
});
