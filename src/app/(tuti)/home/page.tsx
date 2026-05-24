"use client";

import { useRouter } from "next/navigation";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { HomeScreen } from "@/features/tuti/screens/home/HomeScreen";

export default function HomeRoute() {
  return <HomeFlow />;
}

function HomeFlow() {
  const router = useRouter();
  const { feature, places } = useTutiRecommendations();

  return (
    <HomeScreen
      place={places[0]}
      feature={feature}
      onEnterSwipe={() => router.push("/swipe")}
    />
  );
}
