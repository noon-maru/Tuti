"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";
import { LocationAccessProvider } from "@/features/tuti/location/LocationAccessProvider";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppFrame>
        <LocationAccessProvider>{children}</LocationAccessProvider>
      </AppFrame>
    </Providers>
  );
}
