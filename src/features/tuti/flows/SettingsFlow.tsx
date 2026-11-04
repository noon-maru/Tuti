"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SettingsScreen } from "@/features/tuti/screens/settings/SettingsScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import { logoutAccount } from "@/lib/auth/session";
import { useTutiStore } from "@/store/tuti";
import { usePushEnvironment } from "../hooks/usePushEnvironment";
import { notificationSettingsAvailable } from "@/shared/notifications/rollout";

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
  const notificationsAvailable = notificationSettingsAvailable(usePushEnvironment());
  const account = session?.account;
  const cardDisplayPreferences = useTutiStore(
    (state) => state.cardDisplayPreferences,
  );
  const setCardDisplayPreferences = useTutiStore(
    (state) => state.setCardDisplayPreferences,
  );

  useEffect(() => {
    Object.entries(settingsRoutes).forEach(([name, route]) => {
      if (name !== "notifications" || notificationsAvailable) router.prefetch(route);
    });
  }, [router, notificationsAvailable]);

  return (
    <SettingsScreen
      accountConnected={Boolean(account)}
      accountLabel={account?.displayName ?? account?.email}
      notificationsAvailable={notificationsAvailable}
      cardDisplayPreferences={cardDisplayPreferences}
      onBack={() => router.replace("/")}
      onNavigate={(destination) => router.push(settingsRoutes[destination])}
      onCardDisplayPreferenceChange={(key, enabled) =>
        setCardDisplayPreferences({
          ...cardDisplayPreferences,
          [key]: enabled,
        })
      }
      onLogout={async () => {
        await logoutAccount();
        queryClient.setQueryData(["journal-entries"], []);
        router.replace("/");
      }}
    />
  );
}
