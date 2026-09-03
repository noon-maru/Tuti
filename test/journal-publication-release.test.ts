import assert from "node:assert/strict";
import test from "node:test";
import { canAccountPublishJournal } from "../src/shared/features/release.ts";

test("disabled journal publication denies every account", () => {
  assert.equal(canAccountPublishJournal("admin", false, "internal"), false);
  assert.equal(canAccountPublishJournal("user", false, "public"), false);
});

test("internal audience only allows administrators", () => {
  assert.equal(canAccountPublishJournal("admin", true, "internal"), true);
  assert.equal(canAccountPublishJournal("user", true, "internal"), false);
  assert.equal(canAccountPublishJournal("user", true, "public"), true);
});
