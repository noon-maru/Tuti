"use client";

import { useRouter } from "next/navigation";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { DetailScreen } from "@/features/tuti/screens/detail/DetailScreen";
import { useTutiStore } from "@/store/tuti";

export default function DetailRoute() {
  return <DetailFlow />;
}

function DetailFlow() {
  const router = useRouter();
  const { places } = useTutiRecommendations();
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const activePlace = places[activeIndex] ?? places[0];

  if (!activePlace) {
    return null;
  }

  return (
    <DetailScreen
      place={activePlace}
      onBack={() => router.push("/swipe")}
      swipeBackdrop={{ places, activeIndex, activePlace }}
    />
  );
}
