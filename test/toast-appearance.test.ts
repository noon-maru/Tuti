import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { ToastSurface, ToastAction, ToastDismiss } from "@/shared/ui/ToastSurface";
import { palette } from "@/styles/tokens";

function luminance(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + .05) / (dark + .05);
}

test("작은 여행과 공용 토스트가 같은 밝은 표면과 텍스트·강조 버튼을 사용한다", () => {
  const html = renderToStaticMarkup(createElement(ToastSurface, null,
    createElement("span", { role: "status" }, "같은 이름의 하루마디가 있어요.\n만든 날짜로 구분해요."),
    createElement(ToastAction, { type: "button" }, "확인"),
    createElement(ToastDismiss, { type: "button", "aria-label": "알림 닫기" }, "닫기"),
  ));
  assert.match(html, /background:rgb\(var\(--color-white-rgb\) \/ 0.96\)/);
  assert.match(html, /color:var\(--color-text-muted\)/);
  assert.match(html, /border-radius:14px/);
  assert.match(html, /white-space:pre-line/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /background:var\(--color-action-secondary-background\)/);
  assert.match(html, /min-height:var\(--ui-control-height\)/);
  assert.match(html, /width:44px;height:44px/);
  assert.ok(contrast("#f5f5f5", palette.neutral[900]) >= 4.5, "96% 흰 바탕을 검정 위에 합성한 경우에도 본문 대비를 확보한다");
  assert.ok(contrast(palette.secondary[500], palette.secondary[1000]) >= 4.5);
});

test("양쪽은 공통 표면을 소비하고 기존 위치·수명·접근성·제스처 정책을 유지한다", () => {
  const host = readFileSync("src/shared/ui/FeedbackHost.tsx", "utf8");
  const travel = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  assert.match(host, /const ToastCard = styled\(ToastSurface\)/);
  assert.match(travel, /const LimitedResultsToast = styled\(ToastSurface\)/);
  assert.match(travel, /const LimitedResultsAction = ToastAction/);
  assert.doesNotMatch(host, /#26312c/);
  assert.match(host, /notice.tone === "error" \? "alert" : "status"/);
  assert.match(host, /notice.tone === "error" \? 10000 : 6000/);
  assert.match(host, /onMouseEnter=\{\(\) => setPaused\(true\)\}/);
  assert.match(host, /viewport \?\? document.body/);
  assert.match(travel, /LIMITED_RESULTS_TOAST_DURATION_MS = 10_000/);
  assert.match(travel, /onPointerDown=\{\(event\) => event.stopPropagation\(\)\}/);
});
