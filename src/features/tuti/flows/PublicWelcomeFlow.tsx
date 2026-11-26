"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen";
import { HarumadiExampleFlow } from "./HarumadiExampleFlow";
import { parseWelcomeGuideStep, welcomeGuidePath, welcomeMadiCreatePath, type WelcomeGuideStep } from "@/shared/tuti/welcomeGuide";
import { WELCOME_HARUMADI_FEATURED_PAGE, welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { setWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";
import { consentEntryPath } from "@/lib/loginContinuation";

/** No Providers, session creation, activity recording or personal-data queries before consent. */
export function PublicWelcomeFlow() {
  const pathname = usePathname(), router = useRouter(), params = useSearchParams();
  const guideStep = parseWelcomeGuideStep(params.get("mode"), params.get("step"));
  if (pathname === "/harumadi/example") return <HarumadiExampleFlow beforeConsent />;
  return <WelcomeScreen guideStep={guideStep}
    onRecord={() => router.push(consentEntryPath(welcomeMadiCreatePath(guideStep === null ? "/entry" : welcomeGuidePath(guideStep))))}
    onExplore={() => router.push(consentEntryPath("/explore"))}
    onBookOpen={origin => { setWelcomeHarumadiOrigin(origin); router.push(welcomeHarumadiPath(WELCOME_HARUMADI_FEATURED_PAGE)); }}
    onGuideOpen={() => router.push(welcomeGuidePath(0))}
    onGuideNext={() => { if (guideStep !== null && guideStep < 2) router.replace(welcomeGuidePath((guideStep + 1) as WelcomeGuideStep)); }}
    onGuideBack={() => router.replace(guideStep === null || guideStep === 0 ? "/entry" : welcomeGuidePath((guideStep - 1) as WelcomeGuideStep))}
  />;
}
