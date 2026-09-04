"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PersistedStateHydrator } from "@/app/PersistedStateHydrator";
import { SessionBootstrap } from "@/features/tuti/components/SessionBootstrap";
import { ProductActivityBootstrap } from "@/features/tuti/components/ProductActivityBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PersistedStateHydrator />
      <SessionBootstrap />
      <ProductActivityBootstrap />
      {children}
    </QueryClientProvider>
  );
}
