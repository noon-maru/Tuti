import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { parseDogOuting, type DogOuting } from "../src/shared/pets/dogAccess";
function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
test("동반 조건은 명시적으로 적용하고 미등록·다중 반려견과 잘못된 몸무게를 구분한다", () => {
  const calls: Array<DogOuting | undefined> = [];
  const flow = clientFlowHarness("src/features/tuti/components/DogOutingControls.tsx", "DogOutingControls", {
    "@emotion/styled": styled, "@/shared/pets/dogAccess": { parseDogOuting },
    "./buttons": { PrimaryButton: "button", TextButton: "button" }, "@/shared/ui/typography": { inputControlStyles: "" },
  });
  const render = () => nodes(flow.render({ onChange: (value?: DogOuting) => calls.push(value), value: calls.at(-1) }));
  const apply = () => (render().find(node => node.props.children === "이 조건으로 찾기")!.props.onClick as () => void)();
  const weights = (value: string) => (render().find(node => node.props.inputMode === "decimal")!.props.onChange as (event: unknown) => void)({ target: { value } });
  render(); assert.equal(calls.length, 0);
  apply(); assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ weightsKg: [], leash: false, carrier: false }]);
  weights("5, 12"); assert.equal(calls.length, 1, "입력만으로 질의하지 않는다");
  const leash = render().find(node => node.props.type === "checkbox")!;
  (leash.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  apply(); assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { weightsKg: [5, 12], leash: true, carrier: false });
  weights("-5"); apply(); assert.equal(calls.length, 2); assert.ok(render().some(node => node.props.role === "alert"));
  (render().find(node => node.props.children === "일반 장소로 보기")!.props.onClick as () => void)();
  assert.equal(calls.at(-1), undefined);
});
