import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import {
  TourismDataScreen,
  type TourismWorkspaceMode,
} from "@/features/admin/TourismDataScreen";
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
  searchParams: Promise<{
    tab?: string | string[];
    view?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const initialTab = normalizeTab(tab);
  const initialMode = normalizeMode(view, initialTab);

  return (
    <Providers>
      <TourismDataScreen
        initialTab={initialTab}
        initialMode={initialMode}
      />
    </Providers>
  );
}

function normalizeTab(value: unknown): TourismDataTab {
  return value === "wellness" ||
    value === "municipalCore" ||
    value === "related" ||
    value === "concentration" ||
    value === "visitors" ||
    value === "photos" ||
    value === "metrics" ||
    value === "runs"
    ? value
    : "places";
}

function normalizeMode(
  value: unknown,
  tab: TourismDataTab,
): TourismWorkspaceMode {
  if (value === "overview") return "overview";
  if (value === "runs" || tab === "runs") return "runs";
  return "explorer";
}
