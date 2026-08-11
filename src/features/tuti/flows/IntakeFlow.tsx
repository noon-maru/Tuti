"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";
import { useTutiStore } from "@/store/tuti";

export function IntakeFlow() {
  const router = useRouter();
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const finishIntake = useTutiStore((state) => state.finishIntake);
  const answers = useTutiStore((state) => state.answers);
  const [step, setStep] = useState(0);
  const activeSteps = getIntakeSteps(answers);
  const activeStep = activeSteps[step];

  const chooseAnswer = (value: string) => {
    setAnswer(activeStep.key, value as never);
  };

  const goToNextQuestion = () => {
    if (!answers[activeStep.key]) return;

    if (step < activeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    finishIntake("answered");
  };

  const skipIntake = () => {
    finishIntake("skipped");
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
      onRestoreRecords={() => router.push("/login")}
      onSkip={skipIntake}
    />
  );
}
