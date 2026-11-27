import assert from "node:assert/strict";
import test from "node:test";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { welcomeMadiCancelPath, welcomeMadiCreatePath, welcomeGuidePath } from "@/shared/tuti/welcomeGuide";
import { welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { publicPlaceReturnPath, savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { consentEntryPath, safeLoginReturn } from "@/lib/loginContinuation";
import { createHarumadiHistory } from "@/lib/harumadiHistory";
import type { ComponentProps } from "react";
import type { HarumadiBookReader, HarumadiSettingsOpening } from "@/features/tuti/components/HarumadiBookReader";
import { readFileSync } from "node:fs";
import { findMadiControl, madiCreateHarness } from "./fixtures/madiCreateHarness";

function fixture(path = "/madi/new?from=welcome") {
  const params = new URL(path, "https://tuti.invalid").searchParams;
  const paths: string[] = [];
  const prefetches: string[] = [];
  let retries = 0;
  const query = { entries: [] as { id: string }[], isSuccess: false, isError: false, dataUpdatedAt: 0, refetch: () => { retries++; } };
  const stack = [{}]; let index = 0;
  const window = {
    location: { href: path },
    history: {
      get state() { return stack[index]; },
      pushState(state: object) { stack.splice(++index, Infinity, state); },
      replaceState(state: object) { stack[index] = state; },
      back() { index--; onPop?.(); },
      get length() { return stack.length; },
    },
    addEventListener(_: "popstate", listener: () => void) { onPop = listener; },
    removeEventListener() { onPop = undefined; },
  };
  let onPop: (() => void) | undefined;
  let opening: HarumadiSettingsOpening | null = null;
  const history = createHarumadiHistory<HarumadiSettingsOpening>(window, "owner", value => { opening = value; });
  const flow = clientFlowHarness("src/features/tuti/flows/JournalCreateFlow.tsx", "JournalCreateFlow", {
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ replace: (value: string) => paths.push(value), prefetch: (value: string) => prefetches.push(value), back: () => paths.push("history") }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/hooks/useTutiJournalEntries": { useTutiJournalEntries: () => query },
    "@/features/tuti/screens/journal/MadiCreateScreen": { MadiCreateScreen: "composer" },
    "@/features/tuti/components/HarumadiBookReader": { HarumadiBookReader: "settings" },
    "@/features/tuti/hooks/useHarumadiHistory": { useHarumadiHistory: () => ({ opening, openBook: history.open, closeBook: history.close, registerCloseGuard: history.setCloseGuard }) },
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
  }, { window });
  const scene = () => { const parent = flow.render(); return flow.render(parent.props, parent.type as never); };
  const composer = () => (scene().props.children as [{ props: { children: ReturnType<typeof scene> } }])[0].props.children;
  return { flow, query, paths, prefetches, scene, composer, window, get retries() { return retries; } };
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

test("첫 마디 진입을 프로필 등록으로 가로막지 않고 작성 중 선택한 프로필을 초안과 함께 저장한다", async () => {
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.doesNotMatch(shell, /PetOnboarding/);
  const saves: { content: string; petIds?: string[] }[] = [];
  const screen = madiCreateHarness({ firstMadi: true, onBack() {}, onCollection() {}, onSave: async input => {
    saves.push(input);
    throw new Error("test save");
  } });
  screen.change("기억하고 싶은 이야기", "같이 걷고 돌아온 오후.");
  const getPicker = () => findMadiControl(screen.render(), props => "attachOnRegister" in props);
  const summary = () => findMadiControl(screen.render(), props => props.className === "pet-selection")?.children;
  const tree = screen.render();
  const content = findMadiControl(tree, props => props["aria-label"] === "마디 내용");
  const details = findMadiControl(tree, props => typeof props.onToggle === "function" && Array.isArray(props.children) && props.children[0]?.props?.["data-madi-source"] === "pets")!;
  assert.equal((content?.children as { props: unknown }[])[0].props, details, "사진과 이야기보다 앞에서 선택할 수 있다");
  assert.equal(summary(), "선택");
  assert.equal(getPicker(), undefined);
  (details.onToggle as (event: unknown) => void)({ currentTarget: { open: true } });
  const picker = getPicker()!;
  assert.equal((picker.selected as string[]).length, 0);
  (picker.onBusyChange as (busy: boolean) => void)(true);
  assert.equal(screen.control("첫 마디 남기기").disabled, true);
  (picker.onChange as (ids: string[]) => void)(["new-pet"]);
  assert.equal(summary(), "1마리 선택", "이름을 알기 전에는 선택 수를 보여준다");
  (picker.onChange as (ids: string[]) => void)(["pet-a"]);
  assert.equal(summary(), "몽실이");
  (picker.onBusyChange as (busy: boolean) => void)(false);
  screen.click("첫 마디 남기기");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves.length, 1);
  assert.equal(saves[0].content, "같이 걷고 돌아온 오후.");
  assert.deepEqual(saves[0].petIds, ["pet-a"]);
});

test("첫 저장은 완료 화면을 유지하고 책에 담긴 쪽 또는 저장한 마디를 직접 연다", () => {
  const f = fixture(); f.query.isSuccess = true;
  const screen = f.composer();
  const entry = { id: "saved&entry", savedHarumadi: { id: "book&new" } };
  const unfiled = { id: "saved&entry" };
  const saved = screen.props.onSaved as (entry: object, first: boolean) => void;
  const open = screen.props.onOpenSaved as (entry: object) => void;
  saved(entry, true); saved(unfiled, true); assert.deepEqual(f.paths, []);
  assert.deepEqual(f.prefetches, ["/harumadi?harumadiId=book%26new&focusEntryId=saved%26entry"]);
  open(entry); assert.equal(f.paths.at(-1), "/harumadi?harumadiId=book%26new&focusEntryId=saved%26entry");
  open(unfiled); assert.equal(f.paths.at(-1), "/madi/detail?entryId=saved%26entry");
  (screen.props.onSelectHarumadi as (entry: object) => void)(unfiled);
  assert.equal(f.paths.at(-1), savedMadiSelectionPath(unfiled.id, "welcome", null));
  saved(unfiled, false);
  assert.equal(f.paths.at(-1), savedMadiSelectionPath(unfiled.id, "welcome", null), "다음 마디는 기존 담기 경로를 사용한다");
  assert.equal(f.paths.length, 4);
  f.flow.dispose();
});

test("첫 마디 이름 설정은 히스토리 한 단계만 열고 저장·뒤로가기 모두 원래 완료 화면을 유지한다", () => {
  const f = fixture(); f.query.isSuccess = true;
  const screen = f.composer();
  const book = { id: "book&new", title: "첫 하루마디" };
  (screen.props.onSaved as (entry: object, first: boolean) => void)({ id: "saved", savedHarumadi: book }, true);
  const open = screen.props.onRenameFirstHarumadi as (book: object) => void;
  const settings = () => (f.scene().props.children as [unknown, { props: ComponentProps<typeof HarumadiBookReader> } | null])[1];
  open(book);
  assert.equal(f.composer().props.suspended, true);
  assert.equal(f.window.history.length, 2);
  assert.equal(f.window.location.href, "/madi/new?from=welcome");
  f.window.history.back();
  assert.equal(settings(), null);
  assert.equal(f.composer().props.suspended, false);
  open(book);
  const layer = settings();
  if (!layer) assert.fail("이름 설정이 열려야 한다");
  const renamed = { ...book, title: "함께한 하루" };
  assert.ok(layer.props.settingsReturn);
  layer.props.settingsReturn.onSaved(renamed);
  layer.props.onClose();
  assert.equal(f.composer().props.suspended, false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.composer().props.renamedHarumadi)), renamed);
  assert.deepEqual(f.paths, [], "작성 또는 책 페이지로 다시 이동하지 않는다");
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
