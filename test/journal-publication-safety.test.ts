import assert from "node:assert/strict";
import test from "node:test";

import { assessJournalPublicationSafety } from "../src/server/journal/publicationSafety.ts";

test("plain text-only journal entries can proceed without manual review", () => {
  assert.deepEqual(
    assessJournalPublicationSafety({
      title: "조용했던 오후",
      content: "강변을 천천히 걷고 돌아왔어요.",
      image: null,
    }),
    { decision: "allow", reasons: [] },
  );
});

test("images and personal contact information require review", () => {
  const assessment = assessJournalPublicationSafety({
    title: "같이 걸어요",
    content: "연락처는 010-1234-5678이에요.",
    image: "journal-images/user/entry/image.webp",
  });

  assert.equal(assessment.decision, "review");
  assert.deepEqual(assessment.reasons, [
    "image_review_required",
    "contact_information",
  ]);
});

test("external links and repeated promotional text require review", () => {
  const assessment = assessJournalPublicationSafety({
    title: "자세한 내용",
    content: "https://example.com ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ",
    image: null,
  });

  assert.equal(assessment.decision, "review");
  assert.deepEqual(assessment.reasons, ["external_link", "spam_pattern"]);
});
