import test from "node:test";
import assert from "node:assert/strict";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { toActiveIntakeAnswers, type IntakeAnswers } from "@/shared/tuti/types";

function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
test("재질문도 여러 카테고리를 선택하고 해제한 뒤 저장하며 기존 선택을 다시 사용할 수 있다", () => {
  let submitted: IntakeAnswers | undefined;
  const flow = clientFlowHarness("src/features/tuti/screens/intake/DailyCheckInScreen.tsx", "DailyCheckInScreen", {
    "@emotion/styled": styled,
    "@/features/tuti/components/buttons": { BackButton: "button", BaseButton: "button", PrimaryButton: "button", TextButton: "button" },
    "@/features/tuti/components/AuxiliaryConditions": { AuxiliaryConditions: "aside" },
    "@/features/tuti/data/intakeSteps": { getIntakeSteps },
    "@/features/tuti/hooks/useDeferredAnimationStart": { useDeferredAnimationStart: () => true },
    "@/lib/intakePreferences": { withDefaultIntakeAnswers },
    "@/shared/tuti/types": { toActiveIntakeAnswers },
  }, { window: { setTimeout: (complete: () => void) => { complete(); return 1; } } });
  const props = { previousAnswers: { petCompanion: "dog", placeCategories: ["shopping", "cafe"], movement: "near", transport: "transit" } as IntakeAnswers, dismissible: true, onSubmit: (answers: IntakeAnswers) => { submitted = answers; } };
  const render = () => nodes(flow.render(props));
  const click = (label: string) => {
    const node = render().find(item => item.props.children === label || nodes(item).some(child => child.type === "span" && child.props.children === label));
    assert.ok(node, `control ${label}`);
    (node.props.onClick as () => void)();
  };
  assert.ok(render().some(item => item.props.children === "이대로 볼게요"));
  click("오늘 상태 다시 고르기");
  click("다음"); click("다음"); click("다음");
  // A selected option is removed; a second selection is independently retained.
  const option = render().find(item => item.props["aria-pressed"] === true && nodes(item).some(child => child.props.children === "쇼핑"));
  assert.ok(option); (option.props.onClick as () => void)();
  click("오늘 상태로 보기");
  assert.deepEqual(Array.from(submitted?.placeCategories ?? []), ["cafe"]);
});
