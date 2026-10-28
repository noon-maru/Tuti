import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HARUMADI_BACK_COVER_MESSAGES, HARUMADI_BACK_COVER_TEXT_LIMIT, LEGACY_HARUMADI_BACK_COVER_TEXT, isHarumadiBackCoverText, pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";
import { parseHarumadiSettings } from "@/shared/api/harumadi";
import { parseHarumadiPdfInput } from "@/shared/api/harumadiPdf";
import { buildHarumadiReaderPages } from "@/shared/harumadi/readerPages";
import { harumadiContent } from "./fixtures/harumadiContent";

test("혼자·함께한 하루의 문구를 준비하고 다른 문구는 현재 문구를 제외한다", () => {
  assert.equal(new Set(HARUMADI_BACK_COVER_MESSAGES).size, HARUMADI_BACK_COVER_MESSAGES.length);
  for (const [index, message] of HARUMADI_BACK_COVER_MESSAGES.entries()) {
    assert.ok(isHarumadiBackCoverText(message));
    assert.equal(pickHarumadiBackCoverText(undefined, () => index / HARUMADI_BACK_COVER_MESSAGES.length), message);
    assert.notEqual(pickHarumadiBackCoverText(message, () => 0), message);
  }
  assert.ok(HARUMADI_BACK_COVER_MESSAGES.some(message => message.includes("나의")));
  assert.ok(HARUMADI_BACK_COVER_MESSAGES.some(message => message.includes("우리")));
});

test("설정·PDF 입력은 빈 문구와 줄바꿈을 보존하고 과도한 글·잘못된 형식을 거부한다", () => {
  const settings = { title: "나의 하루", coverStyle: "white-plain" };
  const pdf = { ...settings, entryIds: ["entry-a"], letter: "", coverEntryId: null };
  for (const backCoverText of ["", "나의 하루", "첫 줄\n둘째 줄\n마지막 줄"]) {
    assert.equal(parseHarumadiSettings({ ...settings, backCoverText })?.backCoverText, backCoverText);
    assert.equal(parseHarumadiPdfInput({ ...pdf, backCoverText })?.backCoverText, backCoverText);
  }
  for (const backCoverText of [null, 1, "가".repeat(HARUMADI_BACK_COVER_TEXT_LIMIT + 1), "1\n2\n3\n4", "문구\u0000"]) {
    assert.equal(parseHarumadiSettings({ ...settings, backCoverText }), null);
    assert.equal(parseHarumadiPdfInput({ ...pdf, backCoverText }), null);
  }
  assert.equal(parseHarumadiSettings(settings)?.backCoverText, undefined);
});

test("읽기·PDF는 저장된 뒷표지를 사용하고 기존 문구·빈 뒷표지를 구분한다", () => {
  const { harumadi, entries } = harumadiContent();
  for (const backCoverText of ["나의 하루를 곁에", "", "첫 줄\n둘째 줄"]) {
    assert.equal(buildHarumadiReaderPages({ ...harumadi, backCoverText }, entries).at(-1)?.content, backCoverText);
  }
  assert.equal(buildHarumadiReaderPages(harumadi, entries).at(-1)?.content, LEGACY_HARUMADI_BACK_COVER_TEXT);
  const renderer = readFileSync("src/server/pdf/harumadiPdf.tsx", "utf8");
  assert.match(renderer, /input.backCoverText \?\? LEGACY_HARUMADI_BACK_COVER_TEXT/);
  assert.doesNotMatch(renderer, /pickHarumadiBackCoverText|Math.random/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /backCoverText: harumadi.backCoverText \?\? LEGACY_HARUMADI_BACK_COVER_TEXT/);
  assert.match(flow, /id="harumadi-back-cover"/);
  assert.match(readFileSync("src/server/harumadi/firstMadi.ts", "utf8"), /backCoverText: pickHarumadiBackCoverText\(\)/);
  assert.match(readFileSync("prisma/migrations/20261028150000_add_harumadi_back_cover_text/migration.sql", "utf8"), /DEFAULT '오늘 가능한 만큼만,'/);
});

test("실제 PDF 마지막 쪽은 사용자 문구·빈 문구·기존 문구를 각각 보존한다", async () => {
  const { renderHarumadiPdf } = await import("@/server/pdf/harumadiPdf");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const entry = { id: "entry-a", title: "하루", content: "남겨둔 이야기", image: null,
    placeName: "동네", visitedAt: new Date("2026-10-28T00:00:00Z") };
  for (const backCoverText of ["내가 좋아한 순간\n오래 곁에", "", undefined]) {
    const pdf = await renderHarumadiPdf({ title: "나의 하루", entryIds: [entry.id], letter: "", coverEntryId: null,
      coverStyle: "white-plain", ...(backCoverText !== undefined ? { backCoverText } : {}) }, [entry]);
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
    try {
      const document = await task.promise;
      const page = await document.getPage(document.numPages);
      const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join("");
      assert.equal(text.replaceAll(" ", ""), (backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT).replaceAll("\n", "").replaceAll(" ", ""));
    } finally { await task.destroy(); }
  }
});
