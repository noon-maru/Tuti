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
import { HarumadiInviteContinuation } from "./HarumadiInviteContinuation";
import { LifecycleObserver } from "./LifecycleObserver";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      {/* 두 확인을 함께 시작하되, 둘 다 통과하기 전에는 일반 Providers를 마운트하지 않는다. */}
      <InitialServiceTermsGate renderContent={content => <NativeAppUpdateNotice>{content}</NativeAppUpdateNotice>} rightsChildren={
        <Providers activityEnabled={false} rightsOnly>
          <NativeOAuthCallbackHandler />
          {/* 세션 삭제로 권리 행사 모드로 바뀌어도 완료 화면의 로컬 상태를 보존한다. */}
          <LocationAccessProvider key="tuti-content">{children}</LocationAccessProvider>
        </Providers>
      }>
        <Providers>
          <LifecycleObserver />
          <HarumadiInviteContinuation />
          <NativeOAuthCallbackHandler />
          <LocalNotificationHandler />
          <PushNotificationHandler />
          <GentleLoginNudge />
          <LocationAccessProvider key="tuti-content">{children}</LocationAccessProvider>
        </Providers>
      </InitialServiceTermsGate>
    </AppFrame>
  );
}
