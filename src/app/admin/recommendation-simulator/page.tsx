import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { RecommendationSimulatorScreen } from "@/features/admin/RecommendationSimulatorScreen";

export const metadata: Metadata = {
  title: "추천 시뮬레이터 | Tuti 관리자",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RecommendationSimulatorPage() {
  return (
    <Providers>
      <RecommendationSimulatorScreen />
    </Providers>
  );
}
