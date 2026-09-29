"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";

export function IntakeFlow() {
  const router = useRouter();
  const { requestLocation } = useLocationAccess();
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const finishIntake = useTutiStore((state) => state.finishIntake);
  const answers = useTutiStore((state) => state.answers);
  const [step, setStep] = useState(0);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const activeSteps = getIntakeSteps(answers);
  const activeStep = activeSteps[step];

  useEffect(() => {
    if (!answers.movement) setAnswer("movement", "short");
  }, [answers.movement, setAnswer]);

  const chooseAnswer = (value: string) => {
    setAnswer(activeStep.key, value as never);
  };

  const goToNextQuestion = async () => {
    if (!answers[activeStep.key] || resolvingLocation) return;

    if (step < activeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setResolvingLocation(true);
    try {
      await requestLocation();
      void recordProductActivity("entry_completed").catch(() => {
        // 분석 기록 실패가 질문 완료를 막지 않도록 한다.
      });
      finishIntake("answered");
    } finally {
      setResolvingLocation(false);
    }
  };

  const skipIntake = async () => {
    if (resolvingLocation) return;

    setResolvingLocation(true);
    try {
      await requestLocation();
      void recordProductActivity("entry_skipped").catch(() => {
        // 분석 기록 실패가 둘러보기를 막지 않도록 한다.
      });
      finishIntake("skipped");
    } finally {
      setResolvingLocation(false);
    }
  };

  const goToPreviousQuestion = () => {
    setStep((current) => Math.max(0, current - 1));
  };

  return (
    <IntakeScreen
      step={step}
      total={activeSteps.length}
      activeStep={activeStep}
      selectedValue={answers[activeStep.key]}
      onBack={goToPreviousQuestion}
      onChoose={chooseAnswer}
      onNext={goToNextQuestion}
      resolvingLocation={resolvingLocation}
      onRestoreRecords={() => router.push("/login")}
      onSkip={skipIntake}
      auxiliaryConditions={answers}
      onCompanionChange={(value) => setAnswer("companion", value)}
      onBudgetChange={(value) => setAnswer("budget", value)}
    />
  );
}
