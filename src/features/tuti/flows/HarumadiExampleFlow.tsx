"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeHarumadiPreview } from "@/features/tuti/screens/onboarding/WelcomeHarumadiPreview";
import { parseWelcomeHarumadiPage, welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { getWelcomeHarumadiOrigin, takeWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";
import { recordProductInteraction } from "@/lib/productInteraction";
import { consentEntryPath } from "@/lib/loginContinuation";
import { welcomeMadiCreatePath } from "@/shared/tuti/welcomeGuide";

export function HarumadiExampleFlow({ beforeConsent = false }: { beforeConsent?: boolean } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const [origin] = useState(getWelcomeHarumadiOrigin);
  useEffect(() => { takeWelcomeHarumadiOrigin(); }, []);
  const source = params.get("from") === "library" ? "library" : "welcome";
  const page = parseWelcomeHarumadiPage(params.get("page"));
  return <WelcomeHarumadiPreview page={page} origin={origin}
    onPageChange={next => router.replace(welcomeHarumadiPath(next, source))}
    onRecord={() => {
      const destination = welcomeMadiCreatePath(welcomeHarumadiPath(page, source), source);
      if (beforeConsent) { router.push(consentEntryPath(destination)); return; }
      void recordProductInteraction("welcome_record_started", "welcome").catch(() => {});
      router.replace(destination);
    }}
    onClose={() => {
      if (window.history.length > 1) router.back();
      else router.replace(beforeConsent ? "/entry" : "/");
    }} />;
}
