"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TutiRoute } from "@/features/tuti/components/TutiRoute";
import { intakeSteps } from "@/features/tuti/data/intakeSteps";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";
import { useTutiStore } from "@/store/tuti";

export default function IntakeRoute() {
  return (
    <TutiRoute>
      <IntakeFlow />
    </TutiRoute>
  );
}

function IntakeFlow() {
  const router = useRouter();
  const setAnswer = useTutiStore((state) => state.setAnswer);
  const resetAnswers = useTutiStore((state) => state.resetAnswers);
  const [step, setStep] = useState(0);
  const activeStep = intakeSteps[step];

  const chooseAnswer = (value: string) => {
    setAnswer(activeStep.key, value as never);

    if (step < intakeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    router.push("/home");
  };

  const resetIntake = () => {
    resetAnswers();
    setStep(0);
  };

  return (
    <IntakeScreen
      step={step}
      total={intakeSteps.length}
      activeStep={activeStep}
      onChoose={chooseAnswer}
      onReset={resetIntake}
    />
  );
}
