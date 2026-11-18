import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";
import { madiCreateHarness } from "./fixtures/madiCreateHarness";

test("작성 화면은 요청된 진입에만 위에서 아래로 내려오고 동작 줄이기에서는 페이드한다", () => {
  const render = (enterFromTop: boolean, preview = false) => renderToStaticMarkup(createElement(MadiCreateScreen, { enterFromTop, preview, onBack() {}, onCollection() {} }));
  const animated = render(true);
  assert.match(animated, /translateY\(-100%\)/);
  assert.match(animated, /420ms cubic-bezier\(\.22,\.75,\.22,1\) backwards/);
  assert.match(animated, /prefers-reduced-motion:\s*reduce/);
  assert.match(animated, /100ms ease backwards/);
  assert.doesNotMatch(animated, /\$enterFromTop=/);
  assert.doesNotMatch(render(false), /420ms|translateY\(-100%\)/);
  assert.doesNotMatch(render(true, true), /420ms|translateY\(-100%\)/);
});

test("작성 단계가 바뀌어도 같은 화면과 진입 스타일을 유지해 다시 내려오지 않는다", () => {
  const screen = madiCreateHarness({ enterFromTop: true, onBack() {}, onCollection() {} }, "photo");
  const before = screen.render() as { type: unknown; props: { $enterFromTop: boolean; key?: unknown } };
  screen.click("사진 없이 글로 시작하기");
  const after = screen.render() as typeof before;
  assert.equal(after.type, before.type);
  assert.equal(after.props.$enterFromTop, true);
  assert.equal(after.props.key, before.props.key);
});
