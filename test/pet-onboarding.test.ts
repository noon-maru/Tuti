import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import styled from "@emotion/styled";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { clearPetOnboardingCompleted, hasPetOnboardingCompleted, isPetOnboardingStartPath, markPetOnboardingCompleted, readPetOnboardingCompleted } from "../src/lib/petOnboarding";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}

test("첫 시작 결정은 계정별로 보존하며 기존 책장·나들이 도달자는 다시 요청하지 않는다", async t => {
  const values = new Map<string, string>([["tuti-entry-completed:established-pet-owner", "complete"]]);
  t.mock.method(preferencesStorage, "getItem", async (key: string) => values.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { values.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { values.delete(key); });
  assert.equal(await readPetOnboardingCompleted("pet-first-owner"), false);
  await markPetOnboardingCompleted("pet-first-owner");
  assert.equal(values.get("tuti-pet-onboarding:pet-first-owner"), "complete");
  assert.equal(await readPetOnboardingCompleted("pet-first-owner"), true);
  assert.equal(await readPetOnboardingCompleted("pet-other-owner"), false);
  assert.equal(await readPetOnboardingCompleted("established-pet-owner"), true);
  values.set("tuti-pet-onboarding:restored-pet-owner", "complete");
  assert.equal(await readPetOnboardingCompleted("restored-pet-owner"), true);
  assert.equal(values.size, 3, "조회·건너뛰기에는 프로필 이름이나 데이터를 저장하지 않는다");
  await clearPetOnboardingCompleted("pet-first-owner");
  assert.equal(hasPetOnboardingCompleted("pet-first-owner"), false);
  assert.equal(values.has("tuti-pet-onboarding:pet-first-owner"), false);
});

test("저장소 장애에도 건너뛰기 결정을 이번 실행에서 보존한다", async t => {
  t.mock.method(preferencesStorage, "getItem", async () => { throw new Error("unavailable"); });
  t.mock.method(preferencesStorage, "setItem", async () => { throw new Error("unavailable"); });
  assert.equal(await readPetOnboardingCompleted("offline-pet-owner"), false);
  await markPetOnboardingCompleted("offline-pet-owner");
  assert.equal(hasPetOnboardingCompleted("offline-pet-owner"), true);
  assert.equal(await readPetOnboardingCompleted("offline-pet-owner"), true);
});

test("일반 시작·작성에 적용하고 로그인·권리 행사·초대·공개 열람은 가로막지 않는다", () => {
  for (const path of ["/", "/entry", "/explore", "/madi/new"]) assert.equal(isPetOnboardingStartPath(path), true);
  for (const path of ["/login", "/account-deletion", "/settings", "/location", "/inquiry", "/legal", "/pets", "/madi", "/madi/detail", "/harumadi/invite", "/place/p1"]) assert.equal(isPetOnboardingStartPath(path), false);
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  const rights = shell.slice(shell.indexOf("rightsChildren={"), shell.indexOf("<Providers>"));
  assert.match(rights, /<LocationAccessProvider key="tuti-content"><PetOnboardingGate>/);
  assert.equal((shell.match(/<LocationAccessProvider key="tuti-content"><PetOnboardingGate>/g) ?? []).length, 2, "권리 행사 모드 전환에도 삭제 완료 화면의 부모 트리를 유지한다");
});

test("게이트는 첫 화면을 대신 보여주고 완료 후 URL·원래 작업을 바꾸지 않고 이어준다", async () => {
  const children = "original-intended-content";
  const marked: string[] = [];
  const flow = clientFlowHarness("src/features/tuti/components/PetOnboardingGate.tsx", "PetOnboardingGate", {
    "next/navigation": { usePathname: () => "/entry" },
    "@/features/legal/ServiceAccessContext": { useServiceRightsOnly: () => false },
    "../hooks/useSession": { useSession: () => ({ userId: "new-owner" }) },
    "@/lib/petOnboarding": { hasPetOnboardingCompleted: () => false, readPetOnboardingCompleted: async () => false, markPetOnboardingCompleted: async (id: string) => { marked.push(id); }, isPetOnboardingStartPath },
    "../screens/onboarding/PetOnboardingScreen": { PetOnboardingScreen: "pet-onboarding-screen" },
  });
  const start = flow.render({ children });
  const outer = flow.render(start.props, start.type as (props: unknown) => ReactElement<Record<string, unknown>>);
  assert.equal(outer.key, "new-owner");
  const render = () => flow.render(outer.props, outer.type as (props: unknown) => ReactElement<Record<string, unknown>>);
  assert.equal(render(), null);
  flow.effects(); await tick();
  const screen = render();
  assert.equal(screen.type, "pet-onboarding-screen");
  (screen.props.onComplete as () => void)();
  assert.deepEqual(marked, ["new-owner"]);
  assert.equal(render(), children, "공유 장소의 returnTo나 선택한 책 맥락을 새 경로로 덮어쓰지 않는다");
});

test("완료한 계정은 프로필 화면을 그리지 않으며 계정 전환은 새 상태로 분리한다", () => {
  let owner = "existing-owner";
  const flow = clientFlowHarness("src/features/tuti/components/PetOnboardingGate.tsx", "PetOnboardingGate", {
    "next/navigation": { usePathname: () => "/" },
    "@/features/legal/ServiceAccessContext": { useServiceRightsOnly: () => false },
    "../hooks/useSession": { useSession: () => ({ userId: owner }) },
    "@/lib/petOnboarding": { hasPetOnboardingCompleted: () => true, readPetOnboardingCompleted: async () => true, markPetOnboardingCompleted: async () => {}, isPetOnboardingStartPath },
    "../screens/onboarding/PetOnboardingScreen": { PetOnboardingScreen: "pet-onboarding-screen" },
  });
  const start = flow.render({ children: "home" });
  const shell = flow.render(start.props, start.type as (props: unknown) => ReactElement<Record<string, unknown>>);
  assert.equal(flow.render(shell.props, shell.type as (props: unknown) => ReactElement<Record<string, unknown>>), "home");
  owner = "different-owner";
  assert.equal(flow.render(start.props, start.type as (props: unknown) => ReactElement<Record<string, unknown>>).key, "different-owner");
});

test("권리 행사 모드와 로그인 화면은 세션 준비·프로필 등록을 시작하지 않는다", () => {
  let rightsOnly = true, pathname = "/";
  const flow = clientFlowHarness("src/features/tuti/components/PetOnboardingGate.tsx", "PetOnboardingGate", {
    "next/navigation": { usePathname: () => pathname },
    "@/features/legal/ServiceAccessContext": { useServiceRightsOnly: () => rightsOnly },
    "../hooks/useSession": { useSession: () => { throw new Error("must not prepare a session"); } },
    "@/lib/petOnboarding": { isPetOnboardingStartPath },
    "../screens/onboarding/PetOnboardingScreen": { PetOnboardingScreen: "pet-onboarding-screen" },
  });
  assert.equal(flow.render({ children: "rights" }), "rights");
  rightsOnly = false; pathname = "/login";
  assert.equal(flow.render({ children: "login" }), "login");
});

test("건너뛰기는 프로필 조회를 기다리지 않고 저장과 경쟁하지 않는다", () => {
  let completed = 0;
  const flow = clientFlowHarness("src/features/tuti/screens/onboarding/PetOnboardingScreen.tsx", "PetOnboardingScreen", {
    "@emotion/styled": styled, "../../components/ScreenFrame": { ScreenFrame: "section" },
    "../../components/buttons": { TextButton: "button" }, "../../components/PetProfiles": { PetProfiles: "pet-profiles" },
  });
  const render = () => nodes(flow.render({ onComplete: () => { completed++; } }));
  const skip = () => render().find(node => node.props.children === "건너뛰기")!;
  (skip().props.onClick as () => void)(); assert.equal(completed, 1);
  const profile = render().find(node => node.type === "pet-profiles")!;
  assert.equal(profile.props.registrationOnly, true);
  const staleSkip = skip().props.onClick as () => void;
  (profile.props.onBusyChange as (value: boolean) => void)(true);
  staleSkip(); assert.equal(completed, 1, "이전 렌더의 버튼도 저장 중에는 건너뛰지 않는다");
  assert.equal(skip().props.disabled, true);
  (profile.props.onBusyChange as (value: boolean) => void)(false);
  (profile.props.onRegistered as () => void)(); assert.equal(completed, 2);
});
