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
  assert.equal(canAccountPublishJournal(undefined, true, "public"), false);
});

test("public audience opens to users only after the policy effective date", () => {
  assert.equal(
    canAccountPublishJournal(
      "user",
      true,
      "public",
      new Date("2026-09-30T14:59:59.999Z"),
    ),
    false,
  );
  assert.equal(
    canAccountPublishJournal(
      "user",
      true,
      "public",
      new Date("2026-09-30T15:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    canAccountPublishJournal(
      "admin",
      true,
      "public",
      new Date("2026-09-01T00:00:00.000Z"),
    ),
    true,
  );
});
