import assert from "node:assert/strict";
import test from "node:test";

import {
  getJournalModerationRetentionCutoff,
  JOURNAL_MODERATION_RETENTION_YEARS,
} from "../src/server/journal/moderationRetention.ts";

test("completed journal moderation records use a three-year UTC cutoff", () => {
  assert.equal(JOURNAL_MODERATION_RETENTION_YEARS, 3);
  assert.equal(
    getJournalModerationRetentionCutoff(
      new Date("2028-02-29T12:34:56.000Z"),
    ).toISOString(),
    "2025-03-01T12:34:56.000Z",
  );
});
