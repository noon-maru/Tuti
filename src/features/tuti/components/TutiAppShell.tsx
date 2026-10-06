"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { NativeOAuthCallbackHandler } from "@/features/tuti/components/NativeOAuthCallbackHandler";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";
import { LocalNotificationHandler } from "@/features/tuti/components/LocalNotificationHandler";
import { PushNotificationHandler } from "@/features/tuti/components/PushNotificationHandler";
import { PrivacyUpdateNotice } from "@/features/tuti/components/PrivacyUpdateNotice";
import { GentleLoginNudge } from "@/features/tuti/components/GentleLoginNudge";
import { NativeAppUpdateNotice } from "@/features/tuti/components/NativeAppUpdateNotice";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppFrame>
        <NativeOAuthCallbackHandler />
        <LocalNotificationHandler />
        <PushNotificationHandler />
        <NativeAppUpdateNotice />
        <PrivacyUpdateNotice />
        <GentleLoginNudge />
        <LocationAccessProvider>{children}</LocationAccessProvider>
      </AppFrame>
    </Providers>
  );
}
