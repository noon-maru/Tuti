import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { madiDeletionMessage, harumadiDeletionMessage } from "../src/shared/tuti/deletionCopy";
import { TogetherConfirmationContent } from "../src/features/tuti/components/HarumadiTogetherConfirmDialog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("원본 삭제·책 삭제·책에서 빼기의 영향과 PDF 보존을 구분한다", () => {
  assert.match(madiDeletionMessage(), /모든 하루마디\(함께 채우기 포함\)/);
  assert.match(madiDeletionMessage(), /이미 저장한 PDF는 바뀌지 않아요/);
  assert.match(madiDeletionMessage(true), /서버 하루마디를 함께 삭제/);
  assert.match(madiDeletionMessage(true), /직접 정리/);
  assert.match(harumadiDeletionMessage(true), /모든 사람의 책장/);
  assert.match(harumadiDeletionMessage(true), /공유 댓글도 삭제/);
  assert.doesNotMatch(harumadiDeletionMessage(), /모든 사람의 책장/);
  const render = (action: "leave" | "remove-member" | "remove-entry" | "end-together") => renderToStaticMarkup(createElement(TogetherConfirmationContent, { action, idPrefix: "test", busy: false, onCancel() {}, onConfirm() {} }));
  for (const action of ["leave", "remove-member"] as const) {
    assert.match(render(action), /새 초대가 필요/); assert.match(render(action), /댓글 본문은 삭제/);
  }
  assert.match(render("remove-entry"), /원본을 삭제하는 것은 아니며/);
  assert.match(render("end-together"), /내가 담은 마디는 남아/);
  for (const path of ["src/features/tuti/screens/journal/JournalScreen.tsx", "src/features/tuti/flows/JournalDetailFlow.tsx"]) {
    assert.match(readFileSync(path, "utf8"), /confirmAction\(madiDeletionMessage\(/);
  }
});
