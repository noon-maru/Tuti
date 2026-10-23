"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { NativeOAuthCallbackHandler } from "@/features/tuti/components/NativeOAuthCallbackHandler";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";
import { LocalNotificationHandler } from "@/features/tuti/components/LocalNotificationHandler";
import { PushNotificationHandler } from "@/features/tuti/components/PushNotificationHandler";
import { GentleLoginNudge } from "@/features/tuti/components/GentleLoginNudge";
import { NativeAppUpdateNotice } from "@/features/tuti/components/NativeAppUpdateNotice";
import { InitialServiceTermsGate } from "@/features/legal/InitialServiceTermsGate";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      {/* 두 확인을 함께 시작하되, 둘 다 통과하기 전에는 일반 Providers를 마운트하지 않는다. */}
      <InitialServiceTermsGate renderContent={content => <NativeAppUpdateNotice>{content}</NativeAppUpdateNotice>} rightsChildren={
        <Providers activityEnabled={false} rightsOnly>
          <NativeOAuthCallbackHandler />
          <LocationAccessProvider>{children}</LocationAccessProvider>
        </Providers>
      }>
        <Providers>
          <NativeOAuthCallbackHandler />
          <LocalNotificationHandler />
          <PushNotificationHandler />
          <GentleLoginNudge />
          <LocationAccessProvider>{children}</LocationAccessProvider>
        </Providers>
      </InitialServiceTermsGate>
    </AppFrame>
  );
}
