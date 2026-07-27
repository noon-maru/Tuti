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
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const section = (await searchParams).section;
  const initialTab = normalizeAdminTab(
    Array.isArray(section) ? section[0] : section,
  );

  return (
    <Providers>
      <AdminScreen initialTab={initialTab} />
    </Providers>
  );
}

function normalizeAdminTab(value: unknown): AdminTab {
  return value === "logs" ||
    value === "places" ||
    value === "reports" ||
    value === "inquiries" ||
    value === "users" ||
    value === "settings"
    ? value
    : "overview";
}
