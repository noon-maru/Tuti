"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { loginPath } from "@/lib/loginContinuation";
import { useEffect, useState } from "react";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { prepareRecommendationLocation } from "@/features/tuti/location/prepareRecommendationLocation";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import type { DogOuting } from "@/shared/pets/dogAccess";

export function IntakeFlow({ dogOuting, onDogOutingChange }: { dogOuting?: DogOuting; onDogOutingChange?: (value?: DogOuting) => void } = {}) {
  const [draftDogOuting, setDraftDogOuting] = useState(dogOuting);
  const router = useRouter();
  const { requestLocation } = useLocationAccess();
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const finishIntake = useTutiStore((state) => state.finishIntake);
  const answers = useTutiStore((state) => state.answers);
  const initialStep = Number(useSearchParams().get("step") ?? 0);
  const [step, setStep] = useState(() => Number.isInteger(initialStep) ? Math.max(0, Math.min(initialStep, getIntakeSteps(answers).length - 1)) : 0);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const activeSteps = getIntakeSteps(answers);
  const activeStep = activeSteps[step];

  useEffect(() => {
    const defaults = withDefaultIntakeAnswers(answers);
    if (!answers.movement) setAnswer("movement", defaults.movement);
    if (!answers.transport) setAnswer("transport", defaults.transport);
  }, [answers, setAnswer]);

  const chooseAnswer = (value: string) => {
    if (activeStep.key === "placeCategories") {
      const selected = answers.placeCategories ?? [];
      const category = activeStep.options.find(option => option.value === value)?.value;
      if (category) setAnswer("placeCategories", selected.includes(category) ? selected.filter(item => item !== category) : [...selected, category]);
      return;
    }
    setAnswer(activeStep.key, value as never);
  };

  const goToNextQuestion = async () => {
    if ((activeStep.key !== "placeCategories" && !answers[activeStep.key]) || resolvingLocation) return;
    if (activeStep.key === "placeCategories" && !answers.placeCategories) setAnswer("placeCategories", []);

    if (step < activeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setResolvingLocation(true);
    try {
      await prepareRecommendationLocation(useTutiStore.getState, requestLocation);
      void recordProductActivity("entry_completed").catch(() => {
        // 분석 기록 실패가 질문 완료를 막지 않도록 한다.
      });
      onDogOutingChange?.(answers.petCompanion === "dog" ? draftDogOuting : undefined);
      finishIntake("answered");
    } finally {
      setResolvingLocation(false);
    }
  };

  const skipIntake = async () => {
    if (resolvingLocation) return;

    setResolvingLocation(true);
    try {
      await prepareRecommendationLocation(useTutiStore.getState, requestLocation);
      void recordProductActivity("entry_skipped").catch(() => {
        // 분석 기록 실패가 둘러보기를 막지 않도록 한다.
      });
      onDogOutingChange?.(undefined);
      finishIntake("skipped");
    } finally {
      setResolvingLocation(false);
    }
  };

  const goToPreviousQuestion = () => {
    if (step === 0) {
      router.replace("/");
      return;
    }
    setStep((current) => Math.max(0, current - 1));
  };

  return (
    <IntakeScreen
      step={step}
      total={activeSteps.length}
      dogOuting={draftDogOuting}
      onDogOutingChange={setDraftDogOuting}
      activeStep={activeStep}
      selectedValue={answers[activeStep.key]}
      onBack={goToPreviousQuestion}
      onChoose={chooseAnswer}
      onNext={goToNextQuestion}
      resolvingLocation={resolvingLocation}
      onRestoreRecords={() => router.push(loginPath(`/explore?mode=questions&step=${step}`))}
      onSkip={skipIntake}
      auxiliaryConditions={answers}
      onCompanionChange={(value) => setAnswer("companion", value)}
      onBudgetChange={(value) => setAnswer("budget", value)}
    />
  );
}
