"use client";

import { useRouter } from "next/navigation";
import { DetailScreen } from "@/features/tuti/screens/detail/DetailScreen";
import type { TutiPlace } from "@/lib/recommendations";

export function PublicPlaceFlow({ place }: { place: TutiPlace }) {
  const router = useRouter();

  return (
    <DetailScreen
      place={place}
      travelTimeLabel="공유된 공간"
      backLabel="Tuti에서 다른 공간 찾기"
      showBackMenuItem
      onBack={() => router.push("/")}
    />
  );
}
