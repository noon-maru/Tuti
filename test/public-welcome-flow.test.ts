import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { isPublicWelcomePath } from "@/shared/tuti/publicWelcome";
import { consentEntryPath, safeLoginReturn } from "@/lib/loginContinuation";
import * as guide from "@/shared/tuti/welcomeGuide";
import * as example from "@/shared/tuti/welcomeHarumadi";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const nodes = (tree: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);

test("정적 소개·이용 방법·예시만 동의 전에 허용하며 작업 목적지가 있으면 동의를 받는다", () => {
  for (const path of ["/", "/entry", "/entry?mode=guide&step=1", "/harumadi/example?page=2"]) {
    const url = new URL(path, "https://tuti.invalid");
    assert.equal(isPublicWelcomePath(url.pathname, url.searchParams), true, path);
  }
  for (const path of ["/madi/new", "/settings", "/explore", "/harumadi", "/entry?next=explore", "/entry?mode=questions", "/entry?returnTo=%2Fmadi%2Fnew", "/entry?returnTo=https://outside.invalid"]) {
    const url = new URL(path, "https://tuti.invalid");
    assert.equal(isPublicWelcomePath(url.pathname, url.searchParams), false, path);
  }
});

test("소개에서 선택한 작성·나들이는 URL로 동의를 거쳐 같은 작업으로 이어진다", () => {
  const paths: string[] = [];
  const page = clientFlowHarness("src/features/tuti/flows/PublicWelcomeFlow.tsx", "PublicWelcomeFlow", {
    "next/navigation": { usePathname: () => "/entry", useRouter: () => ({ push: (path: string) => paths.push(path), replace: (path: string) => paths.push(path) }), useSearchParams: () => new URLSearchParams() },
    "../screens/onboarding/WelcomeScreen": { WelcomeScreen: "welcome" }, "./HarumadiExampleFlow": { HarumadiExampleFlow: "example" },
    "@/shared/tuti/welcomeGuide": guide, "@/shared/tuti/welcomeHarumadi": example,
    "@/lib/welcomeHarumadiNavigation": { setWelcomeHarumadiOrigin() {} }, "@/lib/loginContinuation": { consentEntryPath },
  });
  const intro = page.render();
  (intro.props.onRecord as () => void)(); (intro.props.onExplore as () => void)();
  for (const [index, target] of [guide.welcomeMadiCreatePath("/entry"), "/explore"].entries()) {
    const url = new URL(paths[index], "https://tuti.invalid");
    assert.equal(url.pathname, "/entry");
    assert.equal(safeLoginReturn(url.searchParams.get("returnTo")), target);
    assert.equal(isPublicWelcomePath(url.pathname, url.searchParams), false);
  }
  (intro.props.onBookOpen as (origin: null) => void)(null);
  assert.equal(paths[2], "/harumadi/example?page=2", "첫 화면에서 보여준 반려묘 사진 지면을 그대로 펼친다");
  assert.equal(example.welcomeHarumadiNeighbor(example.WELCOME_HARUMADI_FEATURED_PAGE, 1), 3, "다음 쪽은 보호자 자신의 하루 예시다");
  const source = readFileSync("src/features/tuti/flows/PublicWelcomeFlow.tsx", "utf8");
  assert.doesNotMatch(source, /import .*Providers|recordProduct|ensureSession|useQuery|useSession/);
  page.dispose();
});

test("동의 전 예시의 작성은 동의 화면으로 보내고 활동 계측을 하지 않는다", () => {
  const paths: string[] = [], events: string[] = [];
  const page = clientFlowHarness("src/features/tuti/flows/HarumadiExampleFlow.tsx", "HarumadiExampleFlow", {
    "next/navigation": { useRouter: () => ({ push: (path: string) => paths.push(path), replace: (path: string) => paths.push(path) }), useSearchParams: () => new URLSearchParams("page=2") },
    "@/features/tuti/screens/onboarding/WelcomeHarumadiPreview": { WelcomeHarumadiPreview: "example" },
    "@/shared/tuti/welcomeHarumadi": example,
    "@/lib/welcomeHarumadiNavigation": { getWelcomeHarumadiOrigin: () => null, takeWelcomeHarumadiOrigin() {} },
    "@/lib/productInteraction": { recordProductInteraction: async () => { events.push("activity"); } },
    "@/lib/loginContinuation": { consentEntryPath },
    "@/shared/tuti/welcomeGuide": guide,
  }, { window: { history: { length: 1 } } });
  const screen = page.render({ beforeConsent: true });
  (screen.props.onRecord as () => void)(); (screen.props.onClose as () => void)();
  assert.equal(paths[0], consentEntryPath(guide.welcomeMadiCreatePath(example.welcomeHarumadiPath(2))));
  assert.equal(paths[1], "/entry"); assert.deepEqual(events, []);
  page.dispose();
});

for (const hasStoredSession of [false, true]) test(`저장 세션 ${hasStoredSession}: 신규 소개와 기존 사용자 대기를 구분하고 실제 동의 전 일반 화면을 마운트하지 않는다`, async () => {
  let pathname = "/entry", params = new URLSearchParams();
  let resolve!: (state: unknown) => void;
  const request = new Promise(done => { resolve = done; });
  const windowTarget = Object.assign(new EventTarget(), { location: { href: "https://tuti.invalid/entry", pathname: "/entry", search: "" } });
  const page = clientFlowHarness("src/features/legal/InitialServiceTermsGate.tsx", "InitialServiceTermsGate", {
    "@emotion/styled": styled, "lucide-react": { ChevronRight: "icon" }, "next/link": "a",
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => params, useRouter: () => ({ replace() {} }) },
    "@/features/tuti/components/TutiWordmark": { TutiWordmark: "wordmark" },
    "@/lib/initialServiceTerms": { InitialTermsLoadError: Error, initialTermsEntryRedirect: () => null, isInitialTermsRightsPath: () => false,
      startInitialServiceTerms: (_cached: unknown, _enabled: boolean, ready: (stored: boolean) => void) => { ready(hasStoredSession); return request; } },
    "@/lib/initialConsent": { submitInitialConsents() { throw Error("must not auto-accept"); } },
    "@/lib/requiredConsentAnimation": { animateRequiredConsents() {} },
    "@/lib/auth/session": { getSessionSnapshot: () => null, subscribeToSession: () => () => {} },
    "@/lib/serviceTermsAcceptanceCache": { serviceTermsAcceptanceCache: {} },
    "@/shared/ui/buttons": { Button: "button", BackButton: "button", baseControlStyles: "" },
    "@/lib/serviceTerms": { SERVICE_TERMS_REQUIRED_EVENT: "terms-required", ServiceTermsSessionExpiredError: Error },
    "@/shared/location/terms": { getLocationTerms: () => ({}), getLocationTermsVersion: () => "test" },
    "@/lib/harumadiInviteIntent": { rememberHarumadiInviteUrl: async () => {} },
    "@/features/tuti/hooks/usePushEnvironment": { usePushEnvironment() {} },
    "@/lib/notificationSettings": { optInInitialNotifications() {} },
    "@/features/tuti/notifications/webPushNotifications": { requestWebPushPermission() {} },
    "@/shared/notifications/rollout": { notificationSettingsAvailable: () => false },
    "@/lib/loginContinuation": { consentEntryPath }, "@/shared/tuti/publicWelcome": { isPublicWelcomePath },
    "@/features/tuti/flows/PublicWelcomeFlow": { PublicWelcomeFlow: "public-welcome" },
    "@/lib/feedback": { showErrorToast() {} },
  }, { window: windowTarget, document: new EventTarget() });
  const render = () => page.render({ children: "protected-content", rightsChildren: "rights-content" });
  render(); page.effects(); await flush();
  assert.equal(render().type === "public-welcome", !hasStoredSession);
  params = new URLSearchParams({ returnTo: "/madi/new?from=welcome" });
  assert.notEqual(render().type, "public-welcome");
  resolve({ allowed: false, hasStoredSession, offer: { version: "test", documentHash: "hash" } }); await flush();
  const consent = render(); assert.notEqual(consent, "protected-content");
  const form = nodes(consent).find(node => node.props.onAccepted)!;
  assert.ok(form);
  (form.props.onAccepted as (state: unknown) => void)({ allowed: true, hasStoredSession: true, userId: "new-owner" });
  assert.equal(render(), "protected-content");
  pathname = "/madi/new"; assert.equal(render(), "protected-content");
  page.dispose();
});
