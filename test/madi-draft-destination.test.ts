import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMadiDraftStorage, newMadiDraftContext, type MadiDraft } from "../src/lib/madiDraft";
import { MadiCreateScreen } from "../src/features/tuti/screens/journal/MadiCreateScreen";

const value: MadiDraft = { title: "개인 초안", content: "아직 공유하지 않은 이야기", date: "2026-11-06", place: "", placeId: null, image: null, originalImage: false, stage: "write" };
test("공통 new 슬롯의 기존 재현과 달리 책·공유 범위별 초안은 서로 복원되지 않는다", async () => {
  const values = new Map<string, string>();
  const storage = createMadiDraftStorage({ getItem: key => values.get(key) ?? null, setItem: (key, raw) => { values.set(key, raw); }, removeItem: key => { values.delete(key); } });
  // 종전에는 책 A에서 저장한 내용도 모든 새 작성이 같은 new/new로 읽었다.
  await storage.save("owner", "new", "new", value, storage.ticket("owner"));
  assert.deepEqual(await storage.load("owner", "new", "new"), value);
  const a = newMadiDraftContext({ id: "a", shared: false }), b = newMadiDraftContext({ id: "b", shared: true });
  const sharedA = newMadiDraftContext({ id: "a", shared: true });
  assert.equal(await storage.load("owner", b.scope, b.source), null, "기존 불명확한 초안은 공유 책에 적용하지 않는다");
  await storage.save("owner", a.scope, a.source, value, storage.ticket("owner"));
  assert.equal(await storage.load("owner", b.scope, b.source), null);
  assert.equal(await storage.load("owner", sharedA.scope, sharedA.source), null, "같은 책도 공유 범위가 바뀌면 개인 초안을 가져오지 않는다");
  const unknown = newMadiDraftContext({ id: "a" });
  assert.equal(await storage.load("owner", unknown.scope, unknown.source), null, "공유 필드가 없는 응답을 개인 범위로 추정하지 않는다");
  assert.equal(await storage.load("other", a.scope, a.source), null);
  await storage.save("owner", b.scope, b.source, { ...value, title: "B 초안" }, storage.ticket("owner"));
  await storage.remove("owner", b.scope);
  assert.deepEqual(await storage.load("owner", a.scope, a.source), value, "다른 책 저장 완료는 A 초안을 지우지 않는다");
  const general = newMadiDraftContext();
  assert.deepEqual(await storage.load("owner", general.scope, general.source), value, "기존 초안은 삭제하지 않고 책 밖에서 유지한다");
});

test("책 확인 전·권한 조회 실패에는 작성 입력이나 초안을 먼저 노출하지 않는다", () => {
  for (const destinationError of [false, true]) {
    const html = renderToStaticMarkup(createElement(MadiCreateScreen, { inHarumadi: true, destinationError, onBack() {}, onCollection() {}, onRetryDestination() {} }));
    assert.match(html, /담을 하루마디를 확인/);
    assert.doesNotMatch(html, /앨범에서 사진 고르기|이대로 마디 남기기|마디 제목|type="file"/);
    if (destinationError) { assert.match(html, /다시 확인하기/); assert.match(html, /초안은 그대로/); }
  }
  const flow = readFileSync("src/features/tuti/flows/JournalCreateFlow.tsx", "utf8");
  assert.match(flow, /book.isSuccess && !book.isFetching && book.data.id === harumadiId/);
  assert.match(flow, /key=\{`\$\{ownerId \?\? "pending"\}:\$\{draftContext.scope\}`\}/);
  assert.match(flow, /refetchOnWindowFocus: false, refetchOnReconnect: false/);
  const screen = readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8");
  assert.match(screen, /newMadiDraftContext\(inHarumadi \? destination : null\)/);
  assert.match(screen, /enabled: !preview && !saved && \(!inHarumadi \|\| Boolean\(destination\)\)/);
});
