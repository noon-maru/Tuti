"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SettingsScreen } from "@/features/tuti/screens/settings/SettingsScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import { logoutAccount } from "@/lib/auth/session";

const settingsRoutes = {
  account: "/login",
  inquiry: "/inquiry",
  legal: "/legal",
  location: "/location",
  notifications: "/notifications",
} as const;

export function SettingsFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const account = session?.account;

  useEffect(() => {
    Object.values(settingsRoutes).forEach((route) => router.prefetch(route));
  }, [router]);

  return (
    <SettingsScreen
      accountConnected={Boolean(account)}
      accountLabel={account?.displayName ?? account?.email}
      notificationsAvailable={
        process.env.NEXT_PUBLIC_TUTI_TARGET === "app"
      }
      onBack={() => router.replace("/")}
      onNavigate={(destination) => router.push(settingsRoutes[destination])}
      onLogout={async () => {
        await logoutAccount();
        queryClient.setQueryData(["journal-entries"], []);
        router.replace("/");
      }}
    />
  );
}
