import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as guide from "../src/shared/tuti/welcomeGuide";
import * as example from "../src/shared/tuti/welcomeHarumadi";

test("약관 게이트를 통과한 공유 방문자는 신규·기존 여부와 관계없이 소개 화면 없이 선택한 작은 여행으로 간다", () => {
  for (const completed of [false, true]) {
    const effects: Array<() => void> = [], paths: string[] = [], events: string[] = [];
    const state = { hasHydrated: true, entryRecord: completed ? {} : null, entryStage: "welcome" };
    const deps: Record<string, unknown> = {
      "react/jsx-runtime": jsx,
      react: { useState: () => [{ ownerId: "synthetic", completed }, () => {}], useEffect: (fn: () => void) => effects.push(fn) },
      "next/navigation": { useRouter: () => ({ replace: (path: string) => paths.push(path) }), useSearchParams: () => new URLSearchParams("next=explore") },
      "@/features/tuti/flows/RecommendationReadyFlow": { RecommendationReadyFlow: "ready" },
      "@/features/tuti/flows/IntakeFlow": { IntakeFlow: "intake" },
      "@/features/tuti/screens/onboarding/WelcomeScreen": { WelcomeScreen: "welcome" },
      "@/lib/productInteraction": { recordProductInteraction: async () => { events.push("interaction"); } },
      "@/lib/productActivity": { recordProductActivity: async () => { events.push("activity"); } },
      "@/store/tuti": { useTutiStore: (select: (state: unknown) => unknown) => select(state) },
      "@/shared/tuti/welcomeGuide": guide,
      "@/shared/tuti/welcomeHarumadi": example,
      "@/lib/welcomeHarumadiNavigation": { setWelcomeHarumadiOrigin() {} },
      "@/lib/libraryPreferences": { readLibraryEntryCompleted: async () => completed },
      "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "synthetic" }) },
    };
    const exports: { EntryFlow?: () => unknown } = {};
    vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/flows/EntryFlow.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, URLSearchParams, require: (id: string) => {
      if (!(id in deps)) throw Error(`Unexpected dependency ${id}`);
      return deps[id];
    } });
    assert.equal(exports.EntryFlow!(), null, "소개나 홈을 중간에 그리지 않는다");
    effects.forEach(effect => effect());
    assert.deepEqual(paths, ["/explore"]);
    assert.deepEqual(events, [], "소개 화면을 보지 않은 사용자를 소개 노출로 기록하지 않는다");
  }
});
