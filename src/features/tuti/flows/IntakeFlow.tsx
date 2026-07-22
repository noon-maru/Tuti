"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { intakeSteps } from "@/features/tuti/data/intakeSteps";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";
import { useTutiStore } from "@/store/tuti";

export function IntakeFlow() {
  const router = useRouter();
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const resetAnswers = useTutiStore((state) => state.resetAnswers);
  const answers = useTutiStore((state) => state.answers);
  const [step, setStep] = useState(0);
  const [accountNoticeVisible, setAccountNoticeVisible] = useState(false);
  const activeStep = intakeSteps[step];

  const chooseAnswer = (value: string) => {
    setAccountNoticeVisible(false);
    setAnswer(activeStep.key, value as never);
  };

  const goToNextQuestion = () => {
    if (!answers[activeStep.key]) return;

    if (step < intakeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    router.push("/home");
  };

  const skipIntake = () => {
    resetAnswers();
    router.push("/home");
  };

  const goToPreviousQuestion = () => {
    setAccountNoticeVisible(false);
    setStep((current) => Math.max(0, current - 1));
  };

  return (
    <IntakeScreen
      step={step}
      total={intakeSteps.length}
      activeStep={activeStep}
      selectedValue={answers[activeStep.key]}
      accountNoticeVisible={accountNoticeVisible}
      onBack={goToPreviousQuestion}
      onChoose={chooseAnswer}
      onNext={goToNextQuestion}
      onRestoreRecords={() => setAccountNoticeVisible(true)}
      onSkip={skipIntake}
    />
  );
}
