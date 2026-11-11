import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { editableReaderEntry } from "@/shared/harumadi/readerEditing";
import { harumadiContent } from "./fixtures/harumadiContent";

test("읽는 마디 수정은 표지·빈 쪽·다른 참여자의 마디에 제공하지 않는다", () => {
  const { harumadi: book, entries } = harumadiContent();
  const id = entries[0].id;
  assert.equal(editableReaderEntry(book, entries, id, "me"), id);
  assert.equal(editableReaderEntry(book, entries, undefined, "me"), null);
  assert.equal(editableReaderEntry(book, entries, "missing", "me"), null);
  assert.equal(editableReaderEntry(book, entries, id), null);
  assert.equal(editableReaderEntry({ ...book, shared: true }, [{ ...entries[0], authorId: "other" }], id, "me"), null);
  assert.equal(editableReaderEntry({ ...book, shared: true }, [{ ...entries[0], authorId: "me" }], id, "me"), id);
  assert.equal(editableReaderEntry({ ...book, role: "contributor" }, entries, id, "me"), null);
});

test("수정 진입 전에 읽던 마디·분할 쪽을 저장하고 최신 권한이 확인된 화면에서만 메뉴를 연결한다", () => {
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(viewer, /await harumadiReadingPositions.save\(ownerId, book.id, readingPosition\(pages, current\)\);\s*onEditEntry\?\.\(editableId\)/);
  assert.match(viewer, /editableId && <ContextMenu/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.match(flow, /onEditEntry=\{readOnly \? undefined/);
  assert.match(flow, /rememberMadiEditOrigin\(owner, entryId, "harumadi", harumadi.id\)/);
  assert.match(flow, /if \(getSessionSnapshot\(\)\?\.userId !== owner\) return;/);
  assert.match(viewer, /event.defaultPrevented/);
  assert.match(viewer, /> span \{ width: auto; \}/);
  assert.match(viewer, /> span > button \{ min-height: 44px;/);
  assert.match(viewer, /closest\('\[role="menu"\], \[aria-haspopup="menu"\], \[role="dialog"\], \[role="alertdialog"\]'\)/);
});
