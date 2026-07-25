"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useJournalEntryTransition } from "@/features/tuti/components/JournalEntryTransition";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalPage() {
  const router = useRouter();
  const { startTransition } = useJournalEntryTransition();

  useEffect(() => {
    router.prefetch("/journal/detail");
  }, [router]);

  return (
    <JournalScreen
      onBack={() => router.replace("/")}
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
