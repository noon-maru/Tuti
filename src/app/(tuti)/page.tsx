"use client";

import { useRouter } from "next/navigation";
import { OnboardingScreen } from "@/features/tuti/screens/onboarding/OnboardingScreen";

export default function OnboardingRoute() {
  const router = useRouter();

  return <OnboardingScreen onStart={() => router.push("/intake")} />;
}
