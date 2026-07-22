"use client";

import { useRouter } from "next/navigation";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalPage() {
  const router = useRouter();
  const { places } = useTutiRecommendations();

  return (
    <JournalScreen
      places={places.slice(0, 3)}
      onBack={() => router.replace("/")}
    />
  );
}
