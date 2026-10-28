import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryLoadNotice } from "@/features/tuti/components/LibraryLoadNotice";

test("이미 보이는 책장은 작은 중립색 상태 안내와 재시도로 유지한다", () => {
  const html = renderToStaticMarkup(createElement(LibraryLoadNotice, { nextPage: true, busy: false, onRetry() {} }));
  assert.match(html, /나머지 하루마디를 잠시 불러오지 못했어요/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /다시 시도/);
  assert.match(html, /font-size:13px/);
  assert.match(html, /color:var\(--color-text-muted\)/);
  assert.match(html, /min-height:44px/);
  assert.doesNotMatch(html, /role="alert"|--color-error|<h[12]/);
});

test("추가 페이지 오류와 기존 책장 갱신 오류를 구분하고 재시도 중 중복 클릭을 막는다", () => {
  const html = renderToStaticMarkup(createElement(LibraryLoadNotice, { nextPage: false, busy: true, onRetry() {} }));
  assert.match(html, /책장을 새로 불러오지 못했어요/);
  assert.doesNotMatch(html, /나머지 하루마디/);
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /불러오는 중/);
  const flow = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(flow, /nextPage=\{query.isFetchNextPageError\}/);
  assert.match(flow, /if \(query.isFetchNextPageError\) void query.fetchNextPage\(\); else void query.refetch\(\)/);
  assert.match(flow, /query.hasNextPage && !query.isError/);
  assert.doesNotMatch(flow, /InlineError|다음 하루마디를 불러오지/);
  assert.match(flow, /query.isError && !query.data \? <Status role="alert"/);
});
