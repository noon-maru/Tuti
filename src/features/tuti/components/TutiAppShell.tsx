"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { AndroidBackButtonHandler } from "@/features/tuti/components/AndroidBackButtonHandler";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppFrame>
        <AndroidBackButtonHandler />
        <LocationAccessProvider>{children}</LocationAccessProvider>
      </AppFrame>
    </Providers>
  );
}
