import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { AdminScreen } from "@/features/admin/AdminScreen";

export const metadata: Metadata = {
  title: "Tuti 관리자",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <Providers>
      <AdminScreen />
    </Providers>
  );
}
