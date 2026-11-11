import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import ts from "typescript";

const root = "src/features/tuti/";
const read = (path: string) => readFileSync(root + path, "utf8");

function renderFrame(target: string, platform: string, server = false) {
  const source = ts.transpileModule(read("components/AppFrame.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: { AppFrame?: (props: { children: React.ReactNode }) => React.ReactElement } = {};
  const Empty = () => null;
  const dependencies: Record<string, unknown> = {
    react: { ...React, useSyncExternalStore: (_subscribe: unknown, get: () => string, getServer: () => string) => server ? getServer() : get() },
    "react/jsx-runtime": jsx,
    "@emotion/styled": styled,
    "@capacitor/core": { Capacitor: { getPlatform: () => platform } },
    "next/image": Empty,
    "next/link": Empty,
    "lucide-react": { Download: Empty },
    "@/features/tuti/components/AdaptiveOrientation": { AdaptiveOrientation: Empty },
    "@/features/tuti/components/TutiWordmark": { TutiWordmark: Empty },
    "@/styles/tokens": { breakpoints: { mobile: 600, laptop: 1024 } },
    "@/features/tuti/components/buttons": { baseControlStyles: "" },
  };
  vm.runInNewContext(source, { exports, process: { env: { NEXT_PUBLIC_TUTI_TARGET: target } }, require(id: string) {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return renderToStaticMarkup(exports.AppFrame!({ children: null }));
}

test("간격 조정은 iOS 앱에만 표시하고 웹·Android에는 적용하지 않는다", () => {
  for (const [target, platform, expected] of [
    ["app", "ios", "ios"], ["app", "android", "android"],
    ["web", "ios", "web"], ["web", "web", "web"],
  ]) {
    const html = renderFrame(target, platform);
    assert.ok(html.includes(`data-native-platform="${expected}"`));
    assert.match(html, /\[data-native-platform="ios"\]\{--app-header-top-space:16px;--app-navigation-bottom-space:4px;/);
  }
});

test("서버 스냅샷은 web으로 고정해 hydration 불일치를 피한다", () => {
  assert.ok(renderFrame("app", "ios", true).includes('data-native-platform="web"'));
});

test("공통 화면·책장·작은 화면은 플랫폼 여백을 사용하고 안전 영역은 보존한다", () => {
  const frame = read("components/ScreenFrame.tsx");
  const home = read("flows/LibraryHomeFlow.tsx");
  const navigation = read("components/MainNavigation.tsx");
  assert.match(frame, /var\(--app-header-top-space, var\(--space-11\)\) \+ var\(--app-safe-area-top, 0px\)/);
  assert.match(frame, /var\(--app-header-top-space, var\(--space-7\)\) \+ var\(--app-safe-area-top, 0px\)/);
  assert.ok(home.includes("var(--app-header-top-space, 24px) + var(--app-safe-area-top, 0px)"));
  assert.ok(!home.includes("var(--app-header-top-space, 40px)"));
  assert.match(navigation, /var\(--app-navigation-bottom-space, 10px\) \+ var\(--app-safe-area-bottom, 0px\)/);
  assert.match(navigation, /--main-navigation-item-height: 56px/);
  assert.match(navigation, /--main-navigation-create-height: 52px/);
});
