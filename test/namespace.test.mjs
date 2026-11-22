import test from "node:test";
import assert from "node:assert/strict";
import { checkNamespaceIsolation } from "../bin/check-namespace.mjs";

test("Namespace isolation: verifies scdraw_* / scdraw-* conventions and zero conflicts", () => {
  const result = checkNamespaceIsolation();

  if (!result.ok) {
    console.error("Namespace isolation failures:", result.issues);
  }

  assert.equal(
    result.ok,
    true,
    "Namespace isolation check must pass with 0 violations",
  );
  assert.ok(
    result.report.tools.length > 0,
    "Must define scdraw_* tools in enabledTools",
  );
  assert.ok(
    result.report.elements.length >= 7,
    "Must define scdraw-* custom elements",
  );
  assert.equal(
    result.report.channels.length,
    3,
    "Must define 3 broadcast channels",
  );
  assert.equal(result.report.namingViolations.length, 0);
  assert.equal(result.report.pinnedPageConflict, false);
});
