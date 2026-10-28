"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import { rememberMadiEditOrigin } from "@/lib/madiEditReturn";

export default function JournalPage() {
  return <Suspense fallback={null}><JournalPageContent /></Suspense>;
}
function JournalPageContent() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const params = useSearchParams();
  const backPath = params.get("from") === "explore" ? "/explore" : "/";
  const { startTransition } = useJournalEntryTransition();

  useEffect(() => {
    router.prefetch("/madi/detail");
    router.prefetch("/madi/edit");
    router.prefetch("/madi/new");
  }, [router]);

  return (
    <JournalScreen
      onBack={() => window.history.length > 1 ? router.back() : router.replace(backPath)}
      onCreateEntry={() => router.push("/madi/new")}
      onEditEntry={(entryId) => {
        rememberMadiEditOrigin(ownerId, entryId, "journal");
        router.push(
          `/madi/edit?entryId=${encodeURIComponent(entryId)}&source=journal`,
        );
      }}
      onOpenEntry={(entryId, image, sourceElement) => {
        startTransition({
          entryId,
          image: image ?? undefined,
          sourceElement,
          sourceSurface: "journal",
          navigate: () =>
            router.push(
              `/madi/detail?entryId=${encodeURIComponent(entryId)}`,
            ),
        });
      }}
    />
  );
}
