"use client";

import { useRouter } from "next/navigation";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";
import { useTutiStore } from "@/store/tuti";

export default function JournalPage() {
  return <JournalFlow />;
}

function JournalFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const activePlace = places[activeIndex] ?? places[0];

  return (
    <JournalScreen
      places={places.slice(0, 3)}
      onBack={() => router.replace("/")}
      recommendationsBackdrop={{ places, activeIndex, activePlace }}
    />
  );
}
