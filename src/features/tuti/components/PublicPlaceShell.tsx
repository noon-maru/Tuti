"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppFrame } from "./AppFrame";

/** Public reading must not bootstrap accounts, analytics, location or consent. */
export function PublicPlaceShell({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <AppFrame><QueryClientProvider client={client}>{children}</QueryClientProvider></AppFrame>;
}
