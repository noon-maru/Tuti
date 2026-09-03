import assert from "node:assert/strict";
import test from "node:test";

import {
  canOwnerPublishJournalEntry,
  canViewerAccessJournalEntry,
  getJournalModerationTransition,
  isJournalEntryPublic,
} from "../src/server/journal/publicationState.ts";

test("only a complete published state is publicly readable", () => {
  const publishedAt = new Date("2026-09-03T00:00:00.000Z");

  assert.equal(
    isJournalEntryPublic({
      publicId: "a".repeat(32),
      publishedAt,
      publicationStatus: "published",
    }),
    true,
  );
  assert.equal(
    isJournalEntryPublic({
      publicId: "a".repeat(32),
      publishedAt,
      publicationStatus: "hidden",
    }),
    false,
  );
  assert.equal(
    isJournalEntryPublic({
      publicId: null,
      publishedAt,
      publicationStatus: "published",
    }),
    false,
  );
});

test("a viewer cannot access a public entry after blocking its author", () => {
  const entry = {
    publicId: "a".repeat(32),
    publishedAt: new Date("2026-09-03T00:00:00.000Z"),
    publicationStatus: "published" as const,
  };

  assert.equal(canViewerAccessJournalEntry(entry, false), true);
  assert.equal(canViewerAccessJournalEntry(entry, true), false);
  assert.equal(
    canViewerAccessJournalEntry({ ...entry, publicationStatus: "hidden" }, false),
    false,
  );
});

test("moderation only permits published-to-hidden and hidden-to-published", () => {
  assert.deepEqual(getJournalModerationTransition("published", "hide"), {
    expectedStatus: "published",
    nextStatus: "hidden",
  });
  assert.deepEqual(getJournalModerationTransition("hidden", "restore"), {
    expectedStatus: "hidden",
    nextStatus: "published",
  });
  assert.equal(getJournalModerationTransition("private", "hide"), null);
  assert.equal(getJournalModerationTransition("pending", "restore"), null);
});

test("an owner cannot republish a moderation-hidden journal entry", () => {
  assert.equal(canOwnerPublishJournalEntry("private"), true);
  assert.equal(canOwnerPublishJournalEntry("pending"), true);
  assert.equal(canOwnerPublishJournalEntry("published"), true);
  assert.equal(canOwnerPublishJournalEntry("hidden"), false);
});
