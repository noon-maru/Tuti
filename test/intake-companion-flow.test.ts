import test from "node:test";
import assert from "node:assert/strict";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import type { IntakeAnswers } from "@/shared/tuti/types";
import type { DogOuting } from "@/shared/pets/dogAccess";

test("실제 질문 핸들러로 동반·시간·차량 이후 여러 카테고리를 선택·해제하고 완료한다", async () => {
  const state = { answers: { movement: "near", transport: "transit" } as IntakeAnswers, setAnswer(key: keyof IntakeAnswers, value: never) { state.answers = { ...state.answers, [key]: value }; }, finishIntake() { completed = true; } };
  let completed = false;
  let committedOuting: DogOuting | undefined;
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
  const props = () => flow.render({ onDogOutingChange: (value?: DogOuting) => { committedOuting = value; } }).props;
  assert.equal((props().activeStep as { key: string }).key, "petCompanion");
  (props().onChoose as (value: string) => void)("dog");
  for (const key of ["petCompanion", "movement", "transport"]) {
    assert.equal((props().activeStep as { key: string }).key, key);
    await (props().onNext as () => Promise<void>)();
  }
  assert.equal((props().activeStep as { key: string }).key, "placeCategories");
  for (const value of ["shopping", "cafe", "shopping"]) (props().onChoose as (value: string) => void)(value);
  assert.deepEqual(Array.from(state.answers.placeCategories ?? []), ["cafe"]);
  const draft: DogOuting = { weightsKg: [8], leash: true, carrier: false };
  (props().onDogOutingChange as (value: DogOuting) => void)(draft);
  assert.equal(committedOuting, undefined, "질문 완료 전에는 실제 추천 조건을 바꾸지 않는다");
  (props().onDogValidityChange as (valid: boolean) => void)(false);
  await (props().onNext as () => Promise<void>)();
  assert.equal(completed, false);
  (props().onDogValidityChange as (valid: boolean) => void)(true);
  await (props().onNext as () => Promise<void>)();
  assert.ok(completed);
  assert.deepEqual(committedOuting, draft);
});
