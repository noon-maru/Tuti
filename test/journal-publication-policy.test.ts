import assert from "node:assert/strict";
import test from "node:test";

import {
  isCurrentJournalPublicationPolicy,
  JOURNAL_PUBLICATION_POLICY_VERSION,
} from "../src/shared/legal/journalPublicationPolicy.ts";

test("only the current explicit journal publication consent is accepted", () => {
  assert.equal(
    isCurrentJournalPublicationPolicy(JOURNAL_PUBLICATION_POLICY_VERSION),
    true,
  );
  assert.equal(isCurrentJournalPublicationPolicy(undefined), false);
  assert.equal(isCurrentJournalPublicationPolicy("legacy-pre-consent"), false);
  assert.equal(isCurrentJournalPublicationPolicy({}), false);
});
