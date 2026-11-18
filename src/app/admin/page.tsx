import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import {
  AdminScreen,
  type AdminTab,
} from "@/features/admin/AdminScreen";

export const metadata: Metadata = {
  title: "Tuti 관리자",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[]; q?: string | string[]; candidate?: string | string[] }>;
}) {
  const params = await searchParams;
  const section = params.section;
  const initialTab = normalizeAdminTab(
    Array.isArray(section) ? section[0] : section,
  );

  return (
    <Providers>
      <AdminScreen initialTab={initialTab} initialQuery={typeof params.q === "string" ? params.q.trim().slice(0, 120) : ""} initialAllPlaces={params.candidate === "all"} />
    </Providers>
  );
}

function normalizeAdminTab(value: unknown): AdminTab {
  return value === "logs" ||
    value === "business" ||
    value === "activity" ||
    value === "security" ||
    value === "notifications" ||
    value === "location" ||
    value === "funnel" ||
    value === "places" ||
    value === "reports" ||
    value === "inquiries" ||
    value === "users" ||
    value === "admins" ||
    value === "settings"
    ? value
    : "overview";
}
