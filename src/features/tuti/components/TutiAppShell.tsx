"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { NativeOAuthCallbackHandler } from "@/features/tuti/components/NativeOAuthCallbackHandler";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";
import { LocalNotificationHandler } from "@/features/tuti/components/LocalNotificationHandler";
import { PushNotificationHandler } from "@/features/tuti/components/PushNotificationHandler";
import { GentleLoginNudge } from "@/features/tuti/components/GentleLoginNudge";
import { NativeAppUpdateNotice } from "@/features/tuti/components/NativeAppUpdateNotice";
import { ServiceTermsNotice } from "@/features/legal/ServiceTermsNotice";
import { InitialServiceTermsGate } from "@/features/legal/InitialServiceTermsGate";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <NativeAppUpdateNotice>
        <InitialServiceTermsGate rightsChildren={
          <Providers activityEnabled={false} rightsOnly>
            <NativeOAuthCallbackHandler />
            <LocationAccessProvider>{children}</LocationAccessProvider>
          </Providers>
        }>
          <Providers>
            <NativeOAuthCallbackHandler />
            <LocalNotificationHandler />
            <PushNotificationHandler />
            <ServiceTermsNotice />
            <GentleLoginNudge />
            <LocationAccessProvider>{children}</LocationAccessProvider>
          </Providers>
        </InitialServiceTermsGate>
      </NativeAppUpdateNotice>
    </AppFrame>
  );
}
