import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import * as icons from "lucide-react";
import * as tokens from "@/styles/tokens";
import { baseControlStyles } from "@/features/tuti/components/buttons";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

// Substitute Next's runtime-only image/link boundary; exercise the real page markup and styles.
const render = () => {
  const page = clientFlowHarness("src/features/download/DownloadPage.tsx", "DownloadPage", {
    "@emotion/styled": styled, "lucide-react": icons, "@/styles/tokens": tokens,
    "next/image": ({ src, alt, width, height, className }: Record<string, unknown>) => createElement("img", { src, alt, width, height, className }),
    "@/features/tuti/components/buttons": { BackLink: "a", baseControlStyles },
    "@/features/tuti/components/HarumadiSheet": { WelcomeHarumadiSample: ({ page }: { page: string }) => createElement("sample", { page }) },
  });
  return renderToStaticMarkup(page.render());
};

test("다운로드는 현재 브랜드 문구와 실제 하루마디 지면 예시로 기록의 결과를 보여준다", () => {
  const html = render();
  assert.match(html, /일상을 추억으로,<br\/>추억을 한 권으로\./);
  assert.match(html, /반려동물과 함께한 순간도, 나만의 하루도/);
  assert.match(html, /사진 한 장이나 짧은 글로 마디를 남겨보세요/);
  assert.match(html, /aria-label="하루마디 지면 예시"/);
  assert.match(html, /<sample page="page"/);
  assert.match(readFileSync("src/features/download/DownloadPage.tsx", "utf8"), /import \{ WelcomeHarumadiSample \} from "@\/features\/tuti\/components\/HarumadiSheet"/);
  assert.match(html, /가까운 사람과 함께 채우고, PDF로 간직할 수 있어요/);
  assert.doesNotMatch(html, /실물.*(?:배송|구매)|매일.*(?:작성|기록)/);
});

test("스토어 목적지와 QR을 유지하며 설치 버튼을 접힌 QR 안내보다 먼저 제공한다", () => {
  const html = render();
  for (const [name, url, qr] of [
    ["App Store", "https://apps.apple.com/kr/app/tuti/id6474651880", "tuti-ios-qr.svg"],
    ["Google Play", "https://play.google.com/store/apps/details?id=com.noonmaru.tuti", "tuti-android-qr.svg"],
  ]) {
    assert.ok(html.includes(`href="${url}" target="_blank" rel="noopener noreferrer"`));
    assert.ok(html.includes(`aria-label="${name}에서 Tuti 받기 (새 창)"`));
    assert.ok(html.indexOf(`href="${url}"`) < html.indexOf("<details"));
    assert.ok(html.includes(`/download/${qr}`));
    assert.ok(html.includes(`alt="Tuti ${name} 다운로드 QR 코드"`));
  }
  assert.match(html, /<details[^>]*><summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /먼저 웹에서 시작하기/);
  assert.doesNotMatch(html, /\$(?:tone|size)=/);
});

test("작은 화면에서는 설치를 예시보다 앞에 두고 QR·조작부·앱 제외 경로를 유지한다", () => {
  const source = readFileSync("src/features/download/DownloadPage.tsx", "utf8");
  assert.match(source, /grid-template-areas: "intro" "install" "memory"/);
  assert.match(source, /minmax\(min\(100%, 210px\), 1fr\)/);
  assert.match(source, /min-height: 52px/);
  assert.match(source, /summary:focus-visible/);
  assert.match(source, /env\(safe-area-inset-bottom/);
  const route = readFileSync("src/app/download/page.tsx", "utf8");
  assert.match(route, /canonical: "\/download"/);
  assert.match(route, /NEXT_PUBLIC_TUTI_TARGET === "app"/);
  assert.match(route, /notFound\(\)/);
});
