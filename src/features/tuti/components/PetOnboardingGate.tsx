"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "../hooks/useSession";
import { hasPetOnboardingCompleted, isPetOnboardingStartPath, markPetOnboardingCompleted, readPetOnboardingCompleted } from "@/lib/petOnboarding";
import { PetOnboardingScreen } from "../screens/onboarding/PetOnboardingScreen";
import { useServiceRightsOnly } from "@/features/legal/ServiceAccessContext";

/** After consent, before normal content effects. Keep the intended route intact. */
export function PetOnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rightsOnly = useServiceRightsOnly();
  if (rightsOnly || !isPetOnboardingStartPath(pathname)) return children;
  return <SessionOnboarding>{children}</SessionOnboarding>;
}
function SessionOnboarding({ children }: { children: React.ReactNode }) {
  const ownerId = useSession()?.userId;
  return ownerId ? <OwnerOnboarding key={ownerId} ownerId={ownerId}>{children}</OwnerOnboarding> : null;
}
function OwnerOnboarding({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  const [completed, setCompleted] = useState<boolean | null>(() => hasPetOnboardingCompleted(ownerId) ? true : null);
  useEffect(() => {
    let active = true;
    void readPetOnboardingCompleted(ownerId).then(value => { if (active) setCompleted(value); });
    return () => { active = false; };
  }, [ownerId]);
  const finish = useCallback(() => {
    // Continue immediately even if Preferences is unavailable. No pet is created on skip.
    void markPetOnboardingCompleted(ownerId);
    setCompleted(true);
  }, [ownerId]);
  if (completed === null) return null;
  if (completed) return children;
  return <PetOnboardingScreen key={ownerId} onComplete={finish} />;
}
