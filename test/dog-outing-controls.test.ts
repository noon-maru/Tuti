import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { parseDogOuting, type DogOuting } from "../src/shared/pets/dogAccess";
function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
test("동반 입력은 별도 적용 없이 초안에 반영하며 잘못된 몸무게는 완료를 차단한다", () => {
  const calls: Array<DogOuting | undefined> = [], validity: boolean[] = [];
  const flow = clientFlowHarness("src/features/tuti/components/DogOutingControls.tsx", "DogOutingControls", {
    "@emotion/styled": styled, "@/shared/pets/dogAccess": { parseDogOuting },
    "./buttons": { BaseButton: "button", TextButton: "button" }, "@/shared/ui/typography": { inputControlStyles: "" },
  });
  const render = () => nodes(flow.render({ onChange: (value?: DogOuting) => calls.push(value), onValidityChange: (valid: boolean) => validity.push(valid), value: calls.at(-1) }));
  const weights = (value: string) => (render().find(node => node.props.inputMode === "decimal")!.props.onChange as (event: unknown) => void)({ target: { value } });
  render(); assert.equal(calls.length, 0);
  assert.equal(render().some(node => node.type === "select" || node.type === "details"), false);
  weights("5, 12");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { weightsKg: [5, 12], leash: null, carrier: null, space: "any", muzzle: null });
  const leash = render().find(node => node.props.role === "group" && String(node.props["aria-labelledby"]).endsWith("-leash"))!;
  (nodes(leash).find(node => node.props.children === "사용")!.props.onClick as () => void)();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { weightsKg: [5, 12], leash: true, carrier: null, space: "any", muzzle: null });
  const before = calls.length;
  weights("-5");
  assert.equal(calls.length, before); assert.equal(validity.at(-1), false);
  assert.ok(render().some(node => node.props.role === "alert"));
  assert.equal(render().find(node => node.props.inputMode === "decimal")!.props["aria-invalid"], true);
  (render().find(node => node.props.children === "반려견 조건 초기화")!.props.onClick as () => void)();
  assert.equal(calls.at(-1), undefined); assert.equal(validity.at(-1), true);
  assert.equal(render().some(node => node.props.role === "alert"), false);
});
