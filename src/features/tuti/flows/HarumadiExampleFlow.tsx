"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeHarumadiPreview } from "@/features/tuti/screens/onboarding/WelcomeHarumadiPreview";
import { parseWelcomeHarumadiPage, welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { getWelcomeHarumadiOrigin, takeWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";
import { recordProductInteraction } from "@/lib/productInteraction";

export function HarumadiExampleFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const [origin] = useState(getWelcomeHarumadiOrigin);
  useEffect(() => { takeWelcomeHarumadiOrigin(); }, []);
  const source = params.get("from") === "library" ? "library" : "welcome";
  const page = parseWelcomeHarumadiPage(params.get("page"));
  return <WelcomeHarumadiPreview page={page} origin={origin}
    onPageChange={next => router.replace(welcomeHarumadiPath(next, source))}
    onRecord={() => {
      void recordProductInteraction("welcome_record_started", "welcome").catch(() => {});
      router.replace(`/madi/new?from=${source}`);
    }}
    onClose={() => {
      if (window.history.length > 1) router.back();
      else router.replace("/");
    }} />;
}
