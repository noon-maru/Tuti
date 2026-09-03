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

test("sexual exploitation, hate, threats, and self-harm signals require review", () => {
  const assessment = assessJournalPublicationSafety({
    title: "꺼져라",
    content: "혐오 표현과 아동 성 착취, 죽인다 또는 자살해 같은 위해 표현",
    image: null,
  });

  assert.equal(assessment.decision, "review");
  assert.deepEqual(assessment.reasons, [
    "unsafe_language",
    "sexual_or_exploitative_content",
    "hate_or_harassment",
    "threat_or_self_harm",
  ]);
});

test("legacy external images cannot pass publication automatically", () => {
  assert.deepEqual(
    assessJournalPublicationSafety({
      title: "오래된 기록",
      content: "기존에 저장한 기록이에요.",
      image: "https://images.example.com/tracking-pixel.jpg",
    }),
    {
      decision: "review",
      reasons: [
        "image_review_required",
        "external_image_not_publishable",
      ],
    },
  );
});
