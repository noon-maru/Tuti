import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
test("관리 메뉴에서 소장 안내를 열어도 노출·클릭 수집과 준비 중 모달을 보존한다", () => {
  const events: string[] = [], interactions: unknown[] = [];
  const page = clientFlowHarness("src/features/tuti/components/HarumadiPurchaseButton.tsx", "HarumadiPurchaseButton", {
    "@emotion/styled": styled,
    "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button", TextButton: "button" },
    "@/lib/productInteraction": { recordProductInteraction: (...args: unknown[]) => { interactions.push(args); return Promise.resolve(); } },
    "@/shared/ui/AppDialogFrame": { AppDialogFrame: "dialog" }, "@/shared/ui/typography": { captionStyles: "" },
    "@/lib/lifecycle": { trackLifecycle: (name: string) => events.push(name) }, "../hooks/useSession": { useSession: () => ({ userId: "owner" }) },
  });
  const props = { surface: "harumadi_reader", triggerComponent: ({ onOpen, onVisible }: { onOpen: () => void; onVisible: () => void }) => createElement("menu", { onOpen: onVisible, onSelect: onOpen }) };
  const render = () => nodes(page.render(props));
  const menu = render().find(node => node.type === props.triggerComponent)!;
  assert.equal(render().some(node => node.type === "dialog"), false);
  (menu.props.onVisible as () => void)(); (menu.props.onVisible as () => void)();
  assert.deepEqual(events, ["purchase_viewed"]);
  assert.equal(interactions.length, 0, "메뉴를 열었다고 구매 관심 클릭을 만들지 않는다");
  (menu.props.onOpen as () => void)();
  assert.deepEqual(events, ["purchase_viewed", "purchase_clicked"]);
  assert.equal(interactions.length, 1);
  assert.deepEqual((interactions[0] as unknown[]).slice(0, 2), ["harumadi_purchase_clicked", "harumadi_reader"]);
  const dialog = render().find(node => node.type === "dialog")!;
  assert.ok(dialog);
  (dialog.props.onCancel as () => void)();
  assert.equal(render().some(node => node.type === "dialog"), false);
  page.dispose();
});

test("관리 메뉴 노출 알림은 실제 열기에서만 호출한다", () => {
  let opens = 0;
  const page = clientFlowHarness("src/features/tuti/components/ContextMenu.tsx", "ContextMenu", {
    "@emotion/styled": styled, "react-dom": { createPortal() { throw Error("닫힌 메뉴는 포털을 만들지 않는다"); } },
    "@/features/tuti/components/buttons": { BaseButton: "button" }, "@/features/tuti/navigation/androidBack": { ANDROID_BACK_EVENT: "back" },
  });
  const tree = nodes(page.render({ label: "관리", items: [{ label: "소장", onSelect() {} }], onOpen: () => { opens++; } }));
  assert.equal(opens, 0);
  const trigger = tree.find(node => node.props["aria-haspopup"] === "menu")!;
  (trigger.props.onClick as (event: unknown) => void)({ preventDefault() {}, stopPropagation() {} });
  assert.equal(opens, 1);
  page.dispose();
});
