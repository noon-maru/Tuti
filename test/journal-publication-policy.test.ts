import assert from "node:assert/strict";
import test from "node:test";

import {
  isCurrentJournalPublicationPolicy,
  isJournalPublicationPolicyEffective,
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

test("기록 공개 정책은 한국시간 2026년 10월 1일부터 시행한다", () => {
  assert.equal(
    isJournalPublicationPolicyEffective(
      new Date("2026-09-30T14:59:59.999Z"),
    ),
    false,
  );
  assert.equal(
    isJournalPublicationPolicyEffective(
      new Date("2026-09-30T15:00:00.000Z"),
    ),
    true,
  );
});
