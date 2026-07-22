"use client";

import { HomeFlow } from "@/features/tuti/flows/HomeFlow";
import { IntakeFlow } from "@/features/tuti/flows/IntakeFlow";
import { useTutiStore } from "@/store/tuti";

export function RootFlow() {
  const intakeCompleted = useTutiStore((state) => state.intakeCompleted);

  return intakeCompleted ? <HomeFlow /> : <IntakeFlow />;
}
