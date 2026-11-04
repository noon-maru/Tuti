import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { groupHarumadiSelection, toggleHarumadiSelection } from "@/shared/harumadi/selection";
import { HarumadiEntryPicker } from "@/features/tuti/components/HarumadiEntryPicker";
import { harumadiContent } from "./fixtures/harumadiContent";

test("검색은 제목·이야기·장소·날짜를 찾고 한국 날짜별로 묶되 원본과 선택은 변형하지 않는다", () => {
  const base = harumadiContent().entries[0];
  const entries = [{ ...base, id: "older", title: "CAFE", visitedAt: "2026-10-25T14:59:00Z" },
    { ...base, id: "newer", visitedAt: "2026-10-25T15:01:00Z", content: "함께한 오후" }];
  const groups = groupHarumadiSelection(entries, "");
  assert.deepEqual(groups.map(group => group.key), ["2026-10-26", "2026-10-25"]);
  assert.deepEqual(groupHarumadiSelection(entries, "cafe")[0].entries.map(entry => entry.id), ["older"]);
  assert.equal(groupHarumadiSelection(entries, "공원 오후")[0].entries[0].id, "newer");
  assert.equal(groupHarumadiSelection(entries, "2026-10-26")[0].entries[0].id, "newer");
  assert.deepEqual(groupHarumadiSelection(entries, "없는 검색어"), []);
  assert.equal(entries[0].id, "older");
  const selected = ["older"];
  assert.deepEqual(toggleHarumadiSelection(selected, "newer"), ["older", "newer"]);
  assert.deepEqual(toggleHarumadiSelection(selected, "older"), []);
  assert.deepEqual(selected, ["older"]);
});

test("사진·글 전용 마디의 인식 단서와 미리보기 및 선택 상태를 제공한다", () => {
  const entry = harumadiContent().entries[0];
  // next/image의 서버 번들 변환은 Actions에서 검증하고 Node SSR은 글 전용으로 검사한다.
  const html = renderToStaticMarkup(createElement(HarumadiEntryPicker, { entries: [entry, { ...entry, id: "second", title: "다른 마디" }], selected: [entry.id], onChange() {}, disabled: false }));
  assert.match(html, /type="search"/);
  assert.match(html, /aria-label="마디 검색"/);
  assert.match(html, /2개 마디 · 1개 선택/);
  assert.match(html, /가볍게 걸었던 하루/);
  assert.match(html, /type="checkbox" checked/);
  assert.match(html, /미리보기/);
  const source = readFileSync("src/features/tuti/components/HarumadiEntryPicker.tsx", "utf8");
  assert.match(source, /entry.image \? <Image src=\{entry.image\}/);
  assert.match(source, /AppDialogFrame role="dialog"/);
  assert.match(source, /onChange\(toggleHarumadiSelection\(selected, entry.id\)\)/);
  assert.match(source, /선택 목록으로/);
  assert.doesNotMatch(source, /<Choice[^>]*>[\s\S]*?<Preview[\s\S]*?<\/Choice>/);
});
