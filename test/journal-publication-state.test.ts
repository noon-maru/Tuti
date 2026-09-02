import assert from "node:assert/strict";
import test from "node:test";

import {
  canOwnerPublishJournalEntry,
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

test("an owner cannot republish a moderation-hidden journal entry", () => {
  assert.equal(canOwnerPublishJournalEntry("private"), true);
  assert.equal(canOwnerPublishJournalEntry("pending"), true);
  assert.equal(canOwnerPublishJournalEntry("published"), true);
  assert.equal(canOwnerPublishJournalEntry("hidden"), false);
});
