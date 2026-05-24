"use client";

import { AppFrame } from "@/features/tuti/components/AppFrame";
import { Providers } from "@/app/providers";

export function TutiAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppFrame>{children}</AppFrame>
    </Providers>
  );
}
