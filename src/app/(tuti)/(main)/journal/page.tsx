"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalPage() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/journal/detail");
  }, [router]);

  return (
    <JournalScreen
      onBack={() => router.replace("/")}
      onOpenEntry={(entryId) =>
        router.push(`/journal/detail?entryId=${encodeURIComponent(entryId)}`)
      }
    />
  );
}
