import assert from "node:assert/strict";
import test from "node:test";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { welcomeMadiCancelPath, welcomeMadiCreatePath, welcomeGuidePath } from "@/shared/tuti/welcomeGuide";
import { welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { publicPlaceReturnPath, savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { consentEntryPath, safeLoginReturn } from "@/lib/loginContinuation";

function fixture(path = "/madi/new?from=welcome") {
  const params = new URL(path, "https://tuti.invalid").searchParams;
  const paths: string[] = [];
  let retries = 0;
  const query = { entries: [] as { id: string }[], isSuccess: false, isError: false, dataUpdatedAt: 0, refetch: () => { retries++; } };
  const flow = clientFlowHarness("src/features/tuti/flows/JournalCreateFlow.tsx", "JournalCreateFlow", {
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ replace: (value: string) => paths.push(value), back: () => paths.push("history") }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/hooks/useTutiJournalEntries": { useTutiJournalEntries: () => query },
    "@/features/tuti/screens/journal/MadiCreateScreen": { MadiCreateScreen: "composer" },
    "@/features/tuti/screens/journal/MadiHarumadiSelection": { MadiHarumadiSelection: "selection" },
    "@/features/tuti/screens/journal/JournalDetailScreen": { JournalDetailStatusScreen: "status" },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: "loading" },
    "@/shared/tuti/welcomeGuide": { welcomeMadiCancelPath },
    "@tanstack/react-query": { useQuery: () => ({}), useQueryClient: () => ({}) },
    "@/lib/madiComposeDestination": { cachedMadiDestination() {}, madiDestinationScopeChanged: () => false },
    "@/features/tuti/auth/loginNudge": { requestLoginNudge() {} },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select({ setActiveJournalEntry() {} }) },
    "@/lib/harumadis": { harumadiPath: (id: string) => `/harumadi?harumadiId=${encodeURIComponent(id)}` }, "@/lib/tutiApi": {}, "../hooks/useLifecycleView": { useLifecycleView() {} },
    "@/lib/lifecycle": {}, "../hooks/useNotificationPresence": { useNotificationPresence() {} }, "@/lib/notificationSettings": {},
    "@/lib/savedMadiSelection": { publicPlaceReturnPath, savedMadiSelectionPath },
  }, { window: { history: { length: 5 } } });
  const composer = () => { const parent = flow.render(); return flow.render(parent.props, parent.type as never); };
  return { flow, query, paths, composer, get retries() { return retries; } };
}

test("첫 마디 여부를 확인하기 전 잘못된 제목의 편집기를 열지 않고 확인 후 제목을 유지한다", () => {
  const f = fixture();
  assert.equal(f.flow.render().type, "loading");
  f.query.isError = true;
  const failed = f.flow.render(); assert.equal(failed.type, "status");
  (failed.props.onRetry as () => void)(); assert.equal(f.retries, 1);
  f.query.isError = false; f.query.isSuccess = true; f.query.dataUpdatedAt = 1;
  assert.equal(f.composer().props.firstMadi, true);
  f.query.entries.push({ id: "saved" });
  assert.equal(f.composer().props.firstMadi, true, "저장 후 캐시 갱신이 현재 작성의 이름을 바꾸지 않는다");
  f.query.isSuccess = false; f.query.isError = true;
  assert.equal(f.composer().type, "composer", "백그라운드 확인 실패가 작성 화면을 제거하지 않는다");
  f.flow.dispose();
  const existing = fixture(); existing.query.isSuccess = true; existing.query.entries.push({ id: "old" });
  assert.equal(existing.composer().props.firstMadi, false); existing.flow.dispose();
});

test("첫 저장은 완료 화면을 유지하고 책에 담긴 쪽 또는 저장한 마디를 직접 연다", () => {
  const f = fixture(); f.query.isSuccess = true;
  const screen = f.composer();
  const entry = { id: "saved&entry", savedHarumadi: { id: "book&new" } };
  const unfiled = { id: "saved&entry" };
  const saved = screen.props.onSaved as (entry: object, first: boolean) => void;
  const open = screen.props.onOpenSaved as (entry: object) => void;
  saved(entry, true); saved(unfiled, true); assert.deepEqual(f.paths, []);
  open(entry); assert.equal(f.paths.at(-1), "/harumadi?harumadiId=book%26new&focusEntryId=saved%26entry");
  open(unfiled); assert.equal(f.paths.at(-1), "/madi/detail?entryId=saved%26entry");
  (screen.props.onSelectHarumadi as (entry: object) => void)(unfiled);
  assert.equal(f.paths.at(-1), savedMadiSelectionPath(unfiled.id, "welcome", null));
  saved(unfiled, false);
  assert.equal(f.paths.at(-1), savedMadiSelectionPath(unfiled.id, "welcome", null), "다음 마디는 기존 담기 경로를 사용한다");
  assert.equal(f.paths.length, 4);
  f.flow.dispose();
});

test("첫 단계 취소는 실제 소개·가이드·예시로 복귀하고 저장 완료의 책장 복귀와 구분한다", () => {
  for (const previous of ["/entry", welcomeGuidePath(2), welcomeHarumadiPath(0), welcomeHarumadiPath(3, "library")]) {
    const createPath = welcomeMadiCreatePath(previous);
    assert.equal(safeLoginReturn(createPath), createPath);
    assert.equal(new URL(consentEntryPath(createPath), "https://tuti.invalid").searchParams.get("returnTo"), createPath);
    const f = fixture(welcomeMadiCreatePath(previous)); f.query.isSuccess = true;
    const screen = f.composer();
    (screen.props.onBack as () => void)(); assert.equal(f.paths.at(-1), previous);
    (screen.props.onSaved as (entry: unknown) => void)({ id: "saved", savedHarumadi: { id: "book" } });
    (screen.props.onCollection as () => void)(); assert.equal(f.paths.at(-1), "/");
    f.flow.dispose();
  }
  const legacy = fixture(); legacy.query.isSuccess = true;
  (legacy.composer().props.onBack as () => void)(); assert.equal(legacy.paths.at(-1), "/entry"); legacy.flow.dispose();
  for (const target of ["https://outside.invalid", "//outside.invalid", "/entry?returnTo=/madi/new", "/settings", "/harumadi/example?page=500"]) assert.equal(welcomeMadiCancelPath(target), null);
});
