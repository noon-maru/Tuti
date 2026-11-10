import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MadiHarumadiSelection } from "../src/features/tuti/screens/journal/MadiHarumadiSelection";

test("저장한 마디를 담을 책이 없으면 해당 마디 ID로 새 책 만들기를 바로 연결한다", () => {
  const client = new QueryClient();
  client.setQueryData(["library-harumadis", "owner", "all"], { pages: [{ harumadis: [], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(["recent-harumadis", "owner"], { harumadis: [] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MadiHarumadiSelection, { ownerId: "owner", entryId: "saved-entry", onDone() {}, onNext() {} })));
  assert.match(html, /href="\/harumadi\?addEntryId=saved-entry"/);
  assert.match(html, /새 하루마디 만들어 담기/); assert.match(html, /담지 않고 마치기/);
  client.clear();
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /harumadiPath\(saved.id\).*addEntryId.*encodeURIComponent\(addEntryId\)/);
  assert.match(flow, /이 하루마디에 첫 마디 남기기/);
  assert.match(flow, /entries.isError \? <Quiet/);
});
