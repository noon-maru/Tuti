"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { AndroidBackButtonHandler } from "@/features/tuti/components/AndroidBackButtonHandler";
import { NativeOAuthCallbackHandler } from "@/features/tuti/components/NativeOAuthCallbackHandler";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";
import { LocalNotificationHandler } from "@/features/tuti/components/LocalNotificationHandler";
import { PushNotificationHandler } from "@/features/tuti/components/PushNotificationHandler";
import { PrivacyUpdateNotice } from "@/features/tuti/components/PrivacyUpdateNotice";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppFrame>
        <AndroidBackButtonHandler />
        <NativeOAuthCallbackHandler />
        <LocalNotificationHandler />
        <PushNotificationHandler />
        <PrivacyUpdateNotice />
        <LocationAccessProvider>{children}</LocationAccessProvider>
      </AppFrame>
    </Providers>
  );
}
