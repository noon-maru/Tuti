import assert from "node:assert/strict";
import test from "node:test";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { createLoginContinuation, loginSuccessPath, safeLoginReturn } from "@/lib/loginContinuation";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/shared/notifications/preferences";
import { publicPlaceReturnPath, savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { PublicMadiUnavailable, readPublicMadi } from "@/lib/publicMadiRead";

const flush = () => new Promise(resolve => setImmediate(resolve));
test("작은 여행에서 선택한 책의 마디는 저장과 연결을 한 번만 요청하고 방금 쓴 쪽으로 복귀한다", async () => {
  let params = new URLSearchParams({ from: "explore", harumadiId: "book", placeId: "park", placeName: "공원", journeyId: "journey" });
  const paths: string[] = [], writes: Record<string, unknown>[] = [], origins: string[] = [], actions: Record<string, unknown>[] = [];
  const book = { id: "book", title: "함께한 하루", shared: false };
  const deps = {
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ replace: (path: string) => paths.push(path), back: () => paths.push("unexpected-history") }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/hooks/useTutiJournalEntries": { useTutiJournalEntries: () => ({ entries: [], isSuccess: true, addEntry: async (input: Record<string, unknown>) => { writes.push(input); return { id: "saved", placeId: "park", savedHarumadi: book }; } }) },
    "@/features/tuti/screens/journal/MadiCreateScreen": { MadiCreateScreen: "composer" },
    "@/features/tuti/screens/journal/MadiHarumadiSelection": { MadiHarumadiSelection: "selection" },
    "@/features/tuti/screens/journal/JournalDetailScreen": { JournalDetailStatusScreen: "status" },
    "@tanstack/react-query": { useQuery: () => ({ isSuccess: true, isFetchedAfterMount: true, isFetching: false, data: book }), useQueryClient: () => ({}) },
    "@/lib/madiComposeDestination": { cachedMadiDestination: () => book, madiDestinationScopeChanged: () => false },
    "@/features/tuti/auth/loginNudge": { requestLoginNudge() {} },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select({ setActiveJournalEntry() {} }) },
    "@/lib/harumadis": { harumadiPath: (id: string) => `/harumadi?harumadiId=${id}` },
    "@/lib/tutiApi": { recordRecommendationAction: async (action: Record<string, unknown>) => { actions.push(action); } },
    "../hooks/useLifecycleView": { useLifecycleView: (_event: string, origin: string) => origins.push(origin) },
    "@/lib/lifecycle": { trackLifecycle() {} }, "../hooks/useNotificationPresence": { useNotificationPresence() {} }, "@/lib/notificationSettings": {},
    "@/lib/savedMadiSelection": { publicPlaceReturnPath, savedMadiSelectionPath },
  };
  const create = () => clientFlowHarness("src/features/tuti/flows/JournalCreateFlow.tsx", "JournalCreateFlow", deps, { TextEncoder, window: { history: { length: 12 } } });
  const flow = create(), parent = flow.render(), composer = flow.render(parent.props, parent.type as never);
  assert.deepEqual(JSON.parse(JSON.stringify(composer.props.initialPlace)), { id: "park", name: "공원" });
  assert.equal(composer.props.collectionLabel, "하루마디로 돌아가기");
  assert.equal(composer.props.enterFromTop, true, "나들이에서 시작한 작성은 위에서 내려온다");
  const saved = await (composer.props.onSave as (draft: object) => Promise<object>)({ content: "함께 걸었다", placeId: "park" });
  (composer.props.onSaved as (entry: object) => void)(saved);
  (composer.props.onCollection as () => void)();
  assert.equal(writes.length, 1); assert.equal(writes[0].harumadiId, "book"); assert.equal(writes[0].expectedHarumadiShared, false);
  assert.equal(actions[0].journeyId, "journey"); assert.equal(actions[0].action, "journal_created");
  assert.equal(origins.at(-1), "explore");
  assert.equal(paths.at(-1), "/harumadi?harumadiId=book&focusEntryId=saved");
  params = new URLSearchParams({ from: "explore" });
  const standalone = create(), next = standalone.render();
  (standalone.render(next.props, next.type as never).props.onBack as () => void)();
  assert.equal(paths.at(-1), "/explore", "중간 로그인 화면으로 history.back하지 않는다");
  params = new URLSearchParams({ from: "place", placeId: "tourapi-1", placeName: "공유된 공원" });
  const shared = create(), sharedParent = shared.render();
  const sharedComposer = shared.render(sharedParent.props, sharedParent.type as never);
  assert.equal(sharedComposer.props.collectionLabel, "공유된 장소로 돌아가기");
  (sharedComposer.props.onBack as () => void)();
  assert.equal(paths.at(-1), "/place/tourapi-1");
  (sharedComposer.props.onCollection as () => void)();
  assert.equal(paths.at(-1), "/place/tourapi-1");
  params = new URLSearchParams({ from: "library", harumadiId: "book", cancelTo: "library" });
  const shelf = create(), shelfParent = shelf.render();
  const shelfComposer = shelf.render(shelfParent.props, shelfParent.type as never);
  assert.equal(shelfComposer.props.enterFromTop, true, "책장 끌어내리기도 같은 진입 전환을 사용한다");
  const beforeWrites = writes.length;
  (shelfComposer.props.onBack as () => void)();
  assert.equal(paths.at(-1), "/", "책장에서 내린 뒤 저장 없이 취소하면 책장으로 돌아간다");
  assert.equal(writes.length, beforeWrites, "취소는 마디를 저장하지 않는다");
  const shelfSaved = await (shelfComposer.props.onSave as (draft: object) => Promise<object>)({ content: "책장으로부터 남긴 하루" });
  (shelfComposer.props.onSaved as (entry: object) => void)(shelfSaved);
  (shelfComposer.props.onCollection as () => void)();
  assert.equal(paths.at(-1), "/harumadi?harumadiId=book&focusEntryId=saved", "저장했다면 방금 쓴 책의 지면으로 이동한다");
  for (const cancelTo of [undefined, "/outside"]) {
    params = new URLSearchParams({ from: "library", harumadiId: "book" });
    if (cancelTo) params.set("cancelTo", cancelTo);
    const reader = create(), readerParent = reader.render();
    const readerComposer = reader.render(readerParent.props, readerParent.type as never);
    assert.equal(readerComposer.props.enterFromTop, false, "책 안에서 시작하는 기존 작성에는 추가 진입 전환을 강제하지 않는다");
    (readerComposer.props.onBack as () => void)();
    assert.equal(paths.at(-1), "/harumadi?harumadiId=book", "펼친 책 안에서 시작했거나 취소 힌트가 잘못되면 기존 책 복귀를 유지한다");
  }
  assert.equal(safeLoginReturn("/madi/new?from=library&harumadiId=book&cancelTo=library"), "/madi/new?from=library&harumadiId=book&cancelTo=library");
  assert.equal(safeLoginReturn("/madi/new?cancelTo=https%3A%2F%2Foutside.invalid"), "/madi/new", "취소 힌트는 외부 경로를 허용하지 않는다");
});
test("실제 로그인 핸들러는 이메일·소셜·취소 후 원래 작업으로 돌아간다", async () => {
  const paths: string[] = []; let params = new URLSearchParams(); let linked = false, invite = false;
  const data = new Map<string, string>();
  const continuation = createLoginContinuation({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } });
  const router = { replace: (path: string) => paths.push(path) };
  const store = { entryRecord: null, finishEntry() {}, finishIntake() {}, skipInitialHelp() {}, resetAllData() {} };
  const deps = {
    "next/navigation": { useRouter: () => router, useSearchParams: () => params },
    "@capacitor/browser": { Browser: { open: async () => {} } }, "@capacitor/core": { Capacitor: { isNativePlatform: () => true } },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: async () => {}, removeQueries() {} }) },
    "@/features/tuti/screens/account/AccountScreen": { AccountScreen: "account" },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/lib/auth/session": { getSessionSnapshot: () => ({ userId: "owner" }), verifyEmailLoginCode: async () => ({ status: "authenticated", linked }), completeOAuthLogin: async () => ({ status: "authenticated", linked: true }), createOAuthLoginUrl: async () => "https://provider.test" },
    "@/shared/auth/config": { accountAuthEnabled: true },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select(store) },
    "@/lib/harumadiInviteIntent": { pendingHarumadiInvite: async () => invite ? "pending-token" : null },
    "@/lib/loginContinuation": { loginContinuation: continuation, loginSuccessPath, safeLoginReturn },
  };
  const create = () => clientFlowHarness("src/features/tuti/flows/AccountFlow.tsx", "AccountFlow", deps);
  for (const path of ["/settings", "/madi/detail?entryId=entry", "/harumadi?harumadiId=book&mode=together", "/explore?mode=questions&step=1", "/explore?harumadiId=book&ownerId=anonymous", "/entry"]) {
    params = new URLSearchParams({ returnTo: path }); linked = true;
    const screen = create().render();
    await (screen.props.onEmailCodeVerify as (...args: string[]) => Promise<unknown>)("test", "code");
    assert.equal(paths.at(-1), loginSuccessPath(path, "owner"));
  }
  params = new URLSearchParams({ returnTo: "/harumadi/invite" });
  await (create().render().props.onOAuth as (provider: string) => Promise<void>)("apple");
  params = new URLSearchParams({ oauthTicket: "one-time-ticket" });
  const callback = create(); callback.render(); callback.effects(); await flush();
  assert.equal(paths.at(-1), "/harumadi/invite"); assert.equal(await continuation.read(), null);
  assert.doesNotMatch([...data.values()].join(""), /ticket|code/);
  params = new URLSearchParams({ returnTo: "/explore?mode=questions&step=1" });
  (create().render().props.onBack as () => void)(); await flush(); assert.equal(paths.at(-1), "/explore?mode=questions&step=1");
  params = new URLSearchParams(); linked = false; invite = true;
  await (create().render().props.onEmailCodeVerify as (...args: string[]) => Promise<void>)("test", "code");
  assert.equal(paths.at(-1), "/harumadi/invite");
});

test("실제 작성 흐름은 저장 후 URL에서 선택을 복원하고 다른 계정·조회 실패·삭제를 안전하게 처리한다", () => {
  let params = new URLSearchParams(), owner = "owner", creates = 0;
  const paths: string[] = [];
  const query = { entries: [{ id: "saved" }], isPending: false, isError: false, isSuccess: true, refetch() {}, addEntry() { creates++; } };
  const deps = {
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ replace: (path: string) => paths.push(path) }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: owner }) },
    "@/features/tuti/hooks/useTutiJournalEntries": { useTutiJournalEntries: () => query },
    "@/features/tuti/screens/journal/MadiCreateScreen": { MadiCreateScreen: "composer" },
    "@/features/tuti/screens/journal/MadiHarumadiSelection": { MadiHarumadiSelection: "selection" },
    "@/features/tuti/screens/journal/JournalDetailScreen": { JournalDetailStatusScreen: "status" },
    "@tanstack/react-query": { useQuery: () => ({}), useQueryClient: () => ({}) },
    "@/lib/madiComposeDestination": { cachedMadiDestination() {}, madiDestinationScopeChanged: () => false },
    "@/features/tuti/auth/loginNudge": { requestLoginNudge() {} },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select({ setActiveJournalEntry() {} }) },
    "@/lib/harumadis": {}, "@/lib/tutiApi": {}, "../hooks/useLifecycleView": { useLifecycleView() {} },
    "@/lib/lifecycle": {}, "../hooks/useNotificationPresence": { useNotificationPresence() {} }, "@/lib/notificationSettings": {},
    "@/lib/savedMadiSelection": { publicPlaceReturnPath, savedMadiSelectionPath },
  };
  const create = () => clientFlowHarness("src/features/tuti/flows/JournalCreateFlow.tsx", "JournalCreateFlow", deps);
  const first = create(), parent = first.render();
  const composer = first.render(parent.props, parent.type as never);
  (composer.props.onSaved as (entry: unknown) => void)({ id: "saved" });
  assert.equal(paths.at(-1), "/madi/new?savedEntryId=saved");
  params = new URLSearchParams({ savedEntryId: "saved", from: "explore" });
  const reload = create(), node = reload.render();
  const selection = reload.render(node.props, node.type as never); assert.equal(selection.type, "selection"); assert.equal(creates, 0);
  (selection.props.onDone as () => void)(); assert.equal(paths.at(-1), "/explore");
  (selection.props.onNext as () => void)(); assert.equal(paths.at(-1), "/madi/new?from=explore");
  params = new URLSearchParams({ savedEntryId: "saved", from: "place", placeId: "tourapi-1" });
  const sharedReload = create(), sharedNode = sharedReload.render();
  const sharedSelection = sharedReload.render(sharedNode.props, sharedNode.type as never);
  (sharedSelection.props.onDone as () => void)(); assert.equal(paths.at(-1), "/place/tourapi-1");
  assert.equal(creates, 0, "선택 완료는 마디를 다시 생성하지 않는다");
  query.isError = true; assert.equal(reload.render(node.props, node.type as never).type, "status");
  query.isError = false; query.entries = []; owner = "other";
  const switched = create(), switchedNode = switched.render();
  assert.equal(switched.render(switchedNode.props, switchedNode.type as never).type, "status"); assert.equal(creates, 0);
});

test("알림 조회 재시도는 실제 flow에서 설정만 다시 읽고 권한·저장 요청을 하지 않는다", async () => {
  let reads = 0, saves = 0, permissions = 0;
  const router = { replace() {}, back() {} };
  const events = new EventTarget();
  const flow = clientFlowHarness("src/features/tuti/flows/NotificationSettingsFlow.tsx", "NotificationSettingsFlow", {
    "next/navigation": { useRouter: () => router },
    "@/features/tuti/screens/notifications/NotificationSettingsScreen": { NotificationSettingsScreen: "settings" },
    "@/lib/notificationSettings": { readNotificationSettings: async () => { if (++reads === 1) throw new Error("offline"); return DEFAULT_NOTIFICATION_SETTINGS; }, saveNotificationSettings: async () => { saves++; } },
    "@/shared/notifications/preferences": { DEFAULT_NOTIFICATION_SETTINGS },
    "../notifications/localNotifications": {},
    "../notifications/pushNotifications": { getPushNotificationStatus: async () => ({ supported: true }), enableServerPushNotifications: async () => { permissions++; } },
    "../hooks/usePushEnvironment": { usePushEnvironment: () => "native" },
    "@/lib/auth/session": { getSessionSnapshot: () => ({ userId: "owner" }), subscribeToSession: () => () => {} },
    "@/shared/notifications/rollout": { WEB_PUSH_USER_ENABLED: false }, "@capacitor/core": { Capacitor: { isNativePlatform: () => true } },
  }, { document: events });
  flow.render(); flow.effects(); await flush();
  const failed = flow.render(); assert.equal(failed.props.busy, true); assert.equal(typeof failed.props.onRetry, "function");
  (failed.props.onRetry as () => void)(); flow.render(); flow.effects(); await flush();
  const recovered = flow.render(); assert.equal(recovered.props.busy, false); assert.equal(recovered.props.onRetry, undefined);
  assert.equal(reads, 2); assert.equal(saves, 0); assert.equal(permissions, 0); flow.dispose();
});

test("공유 마디 flow는 재시도·사진 복원·중단된 이전 요청을 구분한다", async t => {
  let mode = "error", created = 0, revoked = 0;
  t.mock.method(URL, "createObjectURL", () => { created++; return "blob:test-photo"; });
  t.mock.method(URL, "revokeObjectURL", () => { revoked++; });
  const request = async (path: string) => {
    if (mode === "error") return new Response(null, { status: 503 });
    if (path.startsWith("public/journal-entries/")) return Response.json({ entry: { publicId: "id", content: "본문", image: "/api/photo" } });
    if (mode === "photo-error") return new Response(null, { status: 503 });
    return new Response("photo");
  };
  const deps = {
    "@/features/tuti/screens/journal/PublicJournalScreen": { PublicJournalScreen: "public" },
    "@/lib/auth/session": { fetchWithSession: request }, "@/lib/publicMadiRead": { PublicMadiUnavailable, readPublicMadi },
  };
  const flow = clientFlowHarness("src/features/tuti/flows/PublicJournalFlow.tsx", "PublicJournalFlow", deps, { AbortController });
  const root = flow.render({ publicId: "id" });
  const render = () => flow.render(root.props, root.type as never);
  render(); flow.effects(); await flush();
  assert.equal(render().props.loadError, true);
  mode = "photo-error"; (render().props.onRetry as () => void)(); render(); flow.effects(); await flush();
  assert.equal((render().props.entry as { content: string }).content, "본문"); assert.equal(render().props.imageFailed, true);
  mode = "ready"; (render().props.onRetry as () => void)(); render(); flow.effects(); await flush();
  assert.equal((render().props.entry as { image: string }).image, "blob:test-photo"); assert.equal(created, 1);
  flow.dispose(); assert.equal(revoked, 1);

  let complete!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  const pending = clientFlowHarness("src/features/tuti/flows/PublicJournalFlow.tsx", "PublicJournalFlow", {
    ...deps, "@/lib/auth/session": { fetchWithSession: async (_path: string, init: RequestInit) => {
      signal = init.signal as AbortSignal; return new Promise<Response>(resolve => { complete = resolve; });
    } },
  }, { AbortController });
  const node = pending.render({ publicId: "old-id" });
  pending.render(node.props, node.type as never); pending.effects(); pending.dispose();
  assert.equal(signal?.aborted, true);
  complete(Response.json({ entry: { publicId: "old-id", content: "늦은 본문", image: null } })); await flush();
  assert.equal(pending.render(node.props, node.type as never).props.entry, null);
});
