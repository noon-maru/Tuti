import assert from "node:assert/strict";
import test from "node:test";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

class ElementStub {
  constructor(private tag: string, private ancestor?: string) {}
  closest(selector: string) {
    const names = selector.split(",").map(value => value.trim());
    return names.includes(this.tag) || Boolean(this.ancestor && names.includes(this.ancestor)) ? this : null;
  }
}
type Swipe = {
  gestureProps: Record<string, (event: unknown) => void>;
  isDragging: boolean; dragY: number;
};
function setup() {
  const flow = clientFlowHarness("src/features/tuti/hooks/useVerticalSwipeBack.ts", "useVerticalSwipeBack", {}, { Element: ElementStub, HTMLElement: ElementStub });
  const render = () => flow.render({ direction: "down", onBack() {} }) as unknown as Swipe;
  return { render };
}
test("바깥 공통 닫기 제스처도 summary와 자식의 클릭 기본 동작을 취소하지 않는다", () => {
  for (const target of [new ElementStub("summary"), new ElementStub("span", "summary"), new ElementStub("svg", "summary"), new ElementStub("span", "button")]) {
    const { render } = setup();
    let prevented = 0, captured = 0;
    render().gestureProps.onPointerDown({ isPrimary: true, button: 0, pointerType: "mouse", clientX: 0, clientY: 0, pointerId: 1, target,
      preventDefault() { prevented++; }, currentTarget: { setPointerCapture() { captured++; } } });
    assert.equal(prevented, 0); assert.equal(captured, 0); assert.equal(render().isDragging, false);
  }
});
test("summary에서 시작한 터치는 닫기 제스처가 되지 않고 일반 여백 스와이프는 유지한다", () => {
  const { render } = setup();
  let prevented = 0;
  const target = new ElementStub("span", "summary");
  render().gestureProps.onTouchStart({ target, touches: [{ clientX: 0, clientY: 0 }] });
  render().gestureProps.onTouchMove({ target, touches: [{ clientX: 0, clientY: 100 }], cancelable: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 0); assert.equal(render().isDragging, false); assert.equal(render().dragY, 0);
  render().gestureProps.onTouchStart({ target: new ElementStub("div"), touches: [{ clientX: 0, clientY: 0 }] });
  render().gestureProps.onTouchMove({ target: new ElementStub("div"), touches: [{ clientX: 0, clientY: 40 }], cancelable: true, preventDefault() { prevented++; } });
  assert.equal(render().isDragging, true); assert.equal(render().dragY, 40); assert.equal(prevented, 1);
});
