import test from "node:test";
import assert from "node:assert/strict";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import type { IntakeAnswers } from "@/shared/tuti/types";

test("실제 질문 핸들러로 동반·시간·차량 이후 여러 카테고리를 선택·해제하고 완료한다", async () => {
  const state = { answers: { movement: "near", transport: "transit" } as IntakeAnswers, setAnswer(key: keyof IntakeAnswers, value: never) { state.answers = { ...state.answers, [key]: value }; }, finishIntake() { completed = true; } };
  let completed = false;
  const store = Object.assign((selector: (value: typeof state) => unknown) => selector(state), { getState: () => state });
  const flow = clientFlowHarness("src/features/tuti/flows/IntakeFlow.tsx", "IntakeFlow", {
    "next/navigation": { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams() },
    "@/lib/loginContinuation": { loginPath: (path: string) => path },
    "@/features/tuti/data/intakeSteps": { getIntakeSteps },
    "@/features/tuti/location/LocationAccessProvider": { useLocationAccess: () => ({ requestLocation: async () => undefined }) },
    "@/features/tuti/location/prepareRecommendationLocation": { prepareRecommendationLocation: async () => undefined },
    "@/features/tuti/screens/intake/IntakeScreen": { IntakeScreen: "screen" },
    "@/lib/productActivity": { recordProductActivity: async () => undefined },
    "@/store/tuti": { useTutiStore: store }, "@/lib/intakePreferences": { withDefaultIntakeAnswers },
  });
  const props = () => flow.render().props;
  assert.equal((props().activeStep as { key: string }).key, "petCompanion");
  (props().onChoose as (value: string) => void)("dog");
  for (const key of ["petCompanion", "movement", "transport"]) {
    assert.equal((props().activeStep as { key: string }).key, key);
    await (props().onNext as () => Promise<void>)();
  }
  assert.equal((props().activeStep as { key: string }).key, "placeCategories");
  for (const value of ["shopping", "cafe", "shopping"]) (props().onChoose as (value: string) => void)(value);
  assert.deepEqual(Array.from(state.answers.placeCategories ?? []), ["cafe"]);
  await (props().onNext as () => Promise<void>)();
  assert.ok(completed);
});
