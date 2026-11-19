import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { renderToStaticMarkup } from "react-dom/server";
import type { SettingsScreen } from "@/features/tuti/screens/settings/SettingsScreen";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const defaults: ComponentProps<typeof SettingsScreen> = {
  accountConnected: true, accountLabel: "테스트 계정", notificationsAvailable: true,
  cardDisplayPreferences: { showPlaceName: true, showPublicTransitTime: false },
  onBack() {}, onNavigate() {}, onCardDisplayPreferenceChange() {}, async onLogout() {},
};
function settingsHarness() {
  return clientFlowHarness("src/features/tuti/screens/settings/SettingsScreen.tsx", "SettingsScreen", {
    "@/shared/ui/typography": { screenTitleStyles: "" }, "@emotion/styled": styled,
    "lucide-react": Object.fromEntries(["BellRing", "ChevronRight", "FileLock2", "LogOut", "MapPin", "MessageCircleQuestion", "UserRound", "PawPrint"].map(name => [name, "icon"])),
    "@/features/tuti/components/buttons": { BackButton: "button", BaseButton: "button" },
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: "section" },
    "@/features/tuti/components/TutiWordmark": { TutiWordmark: "wordmark" },
    "@/features/tuti/components/PetMenuPortraits": { PetMenuPortraits: ({ ownerId }: { ownerId: string }) => createElement("span", { "data-portrait-owner": ownerId }) },
  });
}
test("설정은 중복 설명과 색상 강조를 덜되 위치·알림·기기 계정 안내는 유지한다", () => {
  const page = settingsHarness();
  const html = renderToStaticMarkup(page.render(defaults));
  for (const label of ["함께하는 반려동물", "계정 관리", "위치 설정", "알림 설정", "1:1 문의", "약관 및 개인정보", "연결된 계정"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /선택 프로필을 등록하고 관리해요|계정과 마디를 한곳에서|문의하고 답변 내역을/);
  assert.match(html, /현재 위치 사용과 동의 내역/);
  assert.match(html, /함께 채우기 소식과 마디 기록 알림/);
  const guest = renderToStaticMarkup(page.render({ ...defaults, accountConnected: false, notificationsAvailable: false }));
  assert.match(guest, /로그인하면 다른 기기에서도/);
  assert.doesNotMatch(guest, /알림 설정|로그아웃/);
  page.dispose();
});

test("계정 요약은 내 이름과 반려동물 이름·사진을 함께 보여주고 자세한 관리로 연결한다", () => {
  const page = settingsHarness();
  const pets = Array.from({ length: 4 }, (_, index) => ({ id: `pet-${index}`, name: ["몽실이", "보리", "나비", "구름"][index], species: "dog" as const, weightKg: 3 }));
  let destination = "";
  const render = (list = pets, ownerId: string | undefined = "owner") => page.render({ ...defaults, accountLabel: "정연한", ownerId, pets: list, onNavigate: (value: string) => { destination = value; } });
  const html = renderToStaticMarkup(render());
  assert.match(html, /정연한/); assert.match(html, /몽실이 · 보리 외 2마리 더보기/);
  assert.doesNotMatch(html, /함께하는 몽실이/);
  assert.match(html, /data-portrait-owner="owner"/); assert.doesNotMatch(html, /3kg|나비|구름/);
  const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
  const link = nodes(render()).find(node => String(node.props["aria-label"]).endsWith("프로필 관리"))!;
  (link.props.onClick as () => void)(); assert.equal(destination, "pets");
  const single = renderToStaticMarkup(render(pets.slice(0, 1)));
  assert.match(single, /몽실이 더보기/); assert.doesNotMatch(single, /외 \d+마리/);
  const empty = renderToStaticMarkup(render([]));
  assert.match(empty, /정연한/); assert.match(empty, /연결된 계정/); assert.doesNotMatch(empty, /data-portrait-owner/);
  const anonymous = renderToStaticMarkup(page.render({ ...defaults, accountConnected: false, ownerId: "guest", pets: pets.slice(0, 1) }));
  assert.match(anonymous, /몽실이 더보기/); assert.match(anonymous, /로그인하면 다른 기기에서도/);
  const switched = renderToStaticMarkup(render(pets.slice(0, 1), "new-owner"));
  assert.match(switched, /data-portrait-owner="new-owner"/);
  page.dispose();
});

test("설정 항목 이동·스위치·로그아웃 실패 재시도는 스타일 정리 이후에도 유지한다", async () => {
  const destinations: string[] = [], toggles: unknown[] = [];
  let backed = 0, logouts = 0;
  const page = settingsHarness();
  const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
  const text = (root: ReactNode): string => Children.toArray(root).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
  const props = { ...defaults, onBack: () => { backed++; }, onNavigate: (destination: string) => destinations.push(destination), onCardDisplayPreferenceChange: (...args: unknown[]) => toggles.push(args), onLogout: async () => { logouts++; throw Error("다시 시도해주세요."); } };
  const render = () => nodes(page.render(props));
  const click = (label: string) => (render().find(node => node.props.onClick && text(node.props.children as ReactNode).startsWith(label))!.props.onClick as () => void)();
  for (const label of ["함께하는 반려동물", "계정 관리", "위치 설정", "알림 설정", "1:1 문의", "약관 및 개인정보"]) click(label);
  assert.deepEqual(destinations, ["pets", "account", "location", "notifications", "inquiry", "legal"]);
  (render().find(node => node.props["aria-label"] === "메인으로 돌아가기")!.props.onClick as () => void)();
  assert.equal(backed, 1);
  for (const node of render().filter(node => node.props.role === "switch")) (node.props.onChange as (event: unknown) => void)({ currentTarget: { checked: false } });
  assert.deepEqual(toggles, [["showPlaceName", false], ["showPublicTransitTime", false]]);
  click("로그아웃"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(logouts, 1); assert.ok(render().some(node => node.props.role === "alert"));
  click("로그아웃"); await new Promise(resolve => setImmediate(resolve)); assert.equal(logouts, 2);
  page.dispose();
});

test("설정은 현재 계정의 프로필만 연결하고 조회 대기·계정 전환에도 계정 화면을 막지 않는다", () => {
  let session: { userId: string; account: { displayName: string; email: string } } | null = { userId: "owner", account: { displayName: "정연한", email: "sample@example.test" } };
  let ready = false;
  const queried: string[] = [], routes: string[] = [];
  const pet = { id: "momo", name: "몽실이", species: "dog", weightKg: 3 };
  const flow = clientFlowHarness("src/features/tuti/flows/SettingsFlow.tsx", "SettingsFlow", {
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "next/navigation": { useRouter: () => ({ push: (path: string) => routes.push(path), prefetch() {}, replace() {} }) },
    "@/features/tuti/screens/settings/SettingsScreen": { SettingsScreen: "settings" },
    "@/features/tuti/hooks/useSession": { useSession: () => session },
    "@/lib/auth/session": { logoutAccount: async () => {} },
    "@/store/tuti": { useTutiStore: (select: (value: unknown) => unknown) => select({ cardDisplayPreferences: defaults.cardDisplayPreferences, setCardDisplayPreferences() {} }) },
    "../hooks/usePushEnvironment": { usePushEnvironment: () => "web" },
    "@/shared/notifications/rollout": { notificationSettingsAvailable: () => false },
    "@/lib/loginContinuation": { loginPath: () => "/login" },
    "../hooks/usePetProfiles": { usePetProfiles: (owner: string) => { queried.push(owner); return { data: ready && owner === "owner" ? { pets: [pet] } : undefined }; } },
  });
  const pending = flow.render(); assert.equal(pending.type, "settings"); assert.equal(pending.props.accountLabel, "정연한"); assert.equal(pending.props.pets, undefined);
  ready = true; const loaded = flow.render(); assert.deepEqual(loaded.props.pets, [pet]);
  assert.equal(queried.at(-1), "owner");
  (loaded.props.onNavigate as (value: string) => void)("pets"); assert.deepEqual(routes, ["/pets"]);
  session = { userId: "other", account: { displayName: "", email: "other@example.test" } };
  const switched = flow.render(); assert.equal(switched.props.ownerId, "other"); assert.equal(switched.props.accountLabel, "other@example.test"); assert.equal(switched.props.pets, undefined);
  session = null; const guest = flow.render(); assert.equal(queried.at(-1), ""); assert.equal(guest.props.ownerId, undefined); assert.equal(guest.props.pets, undefined);
  flow.dispose();
});
