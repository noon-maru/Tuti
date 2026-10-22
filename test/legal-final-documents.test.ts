import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareServiceTermsReview } from "../src/server/legal/noticePreparation";
import { parseServiceTermsDocument } from "../src/shared/legal/serviceTerms";

const root = "docs/legal/release/";
const read = (file: string) => readFileSync(root + file, "utf8");
const manifest = JSON.parse(read("review-manifest.json"));

function sections(markdown: string) {
  return markdown.split(/^## /m).slice(1).map(part => {
    const newline = part.indexOf("\n");
    return { title: part.slice(0, newline).trim(), paragraphs: part.slice(newline + 1).trim()
      .split(/\n\s*\n/).map(p => p.split("\n").map(line => line.trim()).join(p.startsWith("- ") ? "\n" : " ")) };
  });
}

test("최종 검토 원문 네 개는 해시·필수 구조를 유지하고 내부 메모를 공고 본문에 섞지 않는다", () => {
  assert.equal(manifest.documents.length, 4);
  assert.equal(new Set(manifest.documents.map((d: { documentType: string }) => d.documentType)).size, 4);
  for (const item of manifest.documents) {
    const markdown = read(item.file);
    assert.equal(createHash("sha256").update(markdown).digest("hex"), item.markdownSha256, item.file);
    assert.doesNotMatch(markdown, /초안|미확정|공개 전 확정|검토 메모|로컬 구현|\[공개 전|\[운영 근거|readiness-status|2026-10-20 로컬|tokens truncated/);
    assert.doesNotThrow(() => parseServiceTermsDocument({
      title: markdown.split("\n")[0].replace(/^# /, ""), summary: "최종 검토 원문",
      importantTerms: ["개별 동의와 공고·시행을 구분합니다."], sections: sections(markdown),
    }), item.file);
  }
});

test("일반약관 최종 원문은 검토 생성기의 모든 조항과 일치하며 이번 전환은 명시적 동의다", () => {
  const review = prepareServiceTermsReview(readFileSync("docs/legal/service-terms-draft.md", "utf8"));
  assert.deepEqual(sections(read("service-terms.md")), review.document.sections);
  assert.match(read("service-terms.md"), /이번 전면 개편의 신규·기존 이용자 전환에는 위 동의 의제를 적용하지 않고/);
  assert.match(read("service-terms.md"), /0원 또는 최근 결제액으로 일률 제한하지 않는다/);
});

test("민감정보·차단·연락처·위치 권리 안내는 실제 서버 통제와 일치한다", () => {
  for (const file of ["privacy-policy.md", "publication-policy.md"]) {
    assert.match(read(file), /0504-008-4307/);
    assert.match(read(file), /새.*일반 기록/);
  }
  assert.match(read("publication-policy.md"), /차단을 요청한 이용자가 해당 작성자의 공개 기록을 보지 않도록/);
  assert.match(read("publication-policy.md"), /우편 수령 주소는 서울특별시/);
  assert.match(read("publication-policy.md"), /법령이 정한 소명·통보·재개 기한과 방법/);
  const location = read("location-terms.md");
  assert.match(location, /고의 또는\n과실이 없음을 입증하지 못하면/);
  assert.match(location, /방송미디어통신위원회/);
  assert.match(location, /통상 보존기간이 남았다는 이유만으로/);
  assert.match(location, /모아서 통보하는 방식/);
});

test("위임한 문안 확정과 전문가 보증·실제 공고·시행은 구분한다", () => {
  assert.equal(manifest.operatorFinalApproval, true);
  assert.equal(manifest.textApprovalReference, "LEGAL-TEXT-DECISION-20261022");
  for (const key of ["legalComplianceCertified", "publicationApplied", "enforcementApplied"]) assert.equal(manifest[key], false);
  assert.equal(manifest.documents.find((d: { documentType: string }) => d.documentType === "privacy").status, "text-finalized");
  const privacy = read("privacy-policy.md");
  for (const text of ["180일", "28일", "30일", "통상 수 주", "Cloudflare", "글로벌", "제공자의 공식 자료와 Firebase 지원 답신", "APNs 전용 고정 보관 상한이 제시되지 않아", "제28조의8제1항제3호가목", "제15조제1항제6호"]) assert.ok(privacy.includes(text), text);
  assert.match(read("README.md"), /푸시를 끄는 것만으로 이 쟁점이 없어지지 않는다/);
});
