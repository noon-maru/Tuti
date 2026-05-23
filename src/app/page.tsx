"use client";

import { useRouter } from "next/navigation";
import { TutiRoute } from "@/features/tuti/components/TutiRoute";
import { OnboardingScreen } from "@/features/tuti/screens/onboarding/OnboardingScreen";

export default function OnboardingRoute() {
  const router = useRouter();

  return (
    <TutiRoute>
      <OnboardingScreen onStart={() => router.push("/intake")} />
    </TutiRoute>
  );
}
