"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalPage() {
  return <Suspense fallback={null}><JournalPageContent /></Suspense>;
}
function JournalPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const backPath = params.get("from") === "explore" ? "/explore" : "/";
  const { startTransition } = useJournalEntryTransition();

  useEffect(() => {
    router.prefetch("/journal/detail");
    router.prefetch("/journal/edit");
    router.prefetch("/journal/new");
  }, [router]);

  return (
    <JournalScreen
      backPath={backPath}
      onBack={() => router.replace(backPath)}
      onCreateEntry={() => router.push("/journal/new")}
      onEditEntry={(entryId) =>
        router.push(
          `/journal/edit?entryId=${encodeURIComponent(entryId)}&source=journal`,
        )
      }
      onOpenEntry={(entryId, image, sourceElement) => {
        startTransition({
          entryId,
          image: image ?? undefined,
          sourceElement,
          sourceSurface: "journal",
          navigate: () =>
            router.push(
              `/journal/detail?entryId=${encodeURIComponent(entryId)}`,
            ),
        });
      }}
    />
  );
}
