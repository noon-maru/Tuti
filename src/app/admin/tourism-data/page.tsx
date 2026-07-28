import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { TourismDataScreen } from "@/features/admin/TourismDataScreen";
import type { TourismDataTab } from "@/shared/api/tourismAdmin";

export const metadata: Metadata = {
  title: "관광 데이터 | Tuti 관리자",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function TourismDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tab = (await searchParams).tab;
  const initialTab = normalizeTab(Array.isArray(tab) ? tab[0] : tab);

  return (
    <Providers>
      <TourismDataScreen initialTab={initialTab} />
    </Providers>
  );
}

function normalizeTab(value: unknown): TourismDataTab {
  return value === "metrics" || value === "runs" ? value : "places";
}
