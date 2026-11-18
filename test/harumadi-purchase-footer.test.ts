import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
test("하단 소장 버튼은 노출·클릭 수집과 준비 중 모달을 보존하며 안내 행을 추가하지 않는다", () => {
  const events: string[] = [], interactions: unknown[] = [];
  let observeVisibility: ((entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) | undefined;
  const page = clientFlowHarness("src/features/tuti/components/HarumadiPurchaseButton.tsx", "HarumadiPurchaseButton", {
    "@emotion/styled": styled,
    "lucide-react": { BookOpen: "icon" },
    "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button", TextButton: "button" },
    "@/lib/productInteraction": { recordProductInteraction: (...args: unknown[]) => { interactions.push(args); return Promise.resolve(); } },
    "@/shared/ui/AppDialogFrame": { AppDialogFrame: "dialog" }, "@/shared/ui/typography": { captionStyles: "" },
    "@/lib/lifecycle": { trackLifecycle: (name: string) => events.push(name) }, "../hooks/useSession": { useSession: () => ({ userId: "owner" }) },
  }, { document: { visibilityState: "visible" }, IntersectionObserver: class {
    constructor(callback: NonNullable<typeof observeVisibility>) { observeVisibility = callback; }
    observe() {} disconnect() {}
  } });
  const props = { surface: "harumadi_reader", compact: true, disabled: false };
  const render = () => nodes(page.render(props));
  const button = render().find(node => node.props.$compact)!;
  (button.props.ref as { current: unknown }).current = {};
  page.effects();
  assert.equal(render().some(node => node.type === "dialog"), false);
  observeVisibility!([{ isIntersecting: true, intersectionRatio: 1 }]);
  observeVisibility!([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.deepEqual(events, ["purchase_viewed"]);
  assert.equal(interactions.length, 0, "화면 노출만으로 관심 클릭을 만들지 않는다");
  assert.equal(render().some(node => node.type === "small"), false, "하단에는 두 버튼 외에 준비 안내 행을 붙이지 않는다");
  (button.props.onClick as () => void)();
  assert.deepEqual(events, ["purchase_viewed", "purchase_clicked"]);
  assert.equal(interactions.length, 1);
  assert.deepEqual((interactions[0] as unknown[]).slice(0, 2), ["harumadi_purchase_clicked", "harumadi_reader"]);
  const dialog = render().find(node => node.type === "dialog")!;
  assert.ok(dialog);
  (dialog.props.onCancel as () => void)();
  assert.equal(render().some(node => node.type === "dialog"), false);
  props.disabled = true;
  const disabled = render().find(node => node.props.$compact)!;
  assert.equal(disabled.props.disabled, true);
  (disabled.props.onClick as () => void)();
  assert.equal(interactions.length, 1);
  page.dispose();
});
