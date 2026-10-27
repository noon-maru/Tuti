"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PersistedStateHydrator } from "@/app/PersistedStateHydrator";
import { SessionBootstrap } from "@/features/tuti/components/SessionBootstrap";
import { ProductActivityBootstrap } from "@/features/tuti/components/ProductActivityBootstrap";
import { ServiceRightsOnlyContext } from "@/features/legal/ServiceAccessContext";
import { HarumadiCacheLifecycle } from "@/features/tuti/components/HarumadiCacheLifecycle";

export function Providers({ children, activityEnabled = true, rightsOnly = false }: { children: React.ReactNode; activityEnabled?: boolean; rightsOnly?: boolean }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ServiceRightsOnlyContext value={rightsOnly}>
      <PersistedStateHydrator />
      <HarumadiCacheLifecycle />
      <SessionBootstrap />
      {activityEnabled && <ProductActivityBootstrap />}
      {children}
      </ServiceRightsOnlyContext>
    </QueryClientProvider>
  );
}
