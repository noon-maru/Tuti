"use client";

import { useRouter } from "next/navigation";
import { TutiRoute } from "@/features/tuti/components/TutiRoute";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalRoute() {
  return (
    <TutiRoute>
      <JournalFlow />
    </TutiRoute>
  );
}

function JournalFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();

  return <JournalScreen places={places.slice(0, 3)} onBack={() => router.push("/swipe")} />;
}
