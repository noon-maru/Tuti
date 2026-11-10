import assert from "node:assert/strict";
import test from "node:test";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { createLoginContinuation, loginSuccessPath, safeLoginReturn } from "@/lib/loginContinuation";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/shared/notifications/preferences";
import { savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { PublicMadiUnavailable, readPublicMadi } from "@/lib/publicMadiRead";

const flush = () => new Promise(resolve => setImmediate(resolve));
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
    "@/lib/auth/session": { verifyEmailLoginCode: async () => ({ status: "authenticated", linked }), completeOAuthLogin: async () => ({ status: "authenticated", linked: true }), createOAuthLoginUrl: async () => "https://provider.test" },
    "@/shared/auth/config": { accountAuthEnabled: true },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select(store) },
    "@/lib/harumadiInviteIntent": { pendingHarumadiInvite: async () => invite ? "pending-token" : null },
    "@/lib/loginContinuation": { loginContinuation: continuation, loginSuccessPath, safeLoginReturn },
  };
  const create = () => clientFlowHarness("src/features/tuti/flows/AccountFlow.tsx", "AccountFlow", deps);
  for (const path of ["/settings", "/madi/detail?entryId=entry", "/harumadi?harumadiId=book&mode=together", "/explore?mode=questions&step=1", "/entry"]) {
    params = new URLSearchParams({ returnTo: path }); linked = true;
    const screen = create().render();
    await (screen.props.onEmailCodeVerify as (...args: string[]) => Promise<unknown>)("test", "code");
    assert.equal(paths.at(-1), loginSuccessPath(path));
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
    "@/lib/savedMadiSelection": { savedMadiSelectionPath },
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
