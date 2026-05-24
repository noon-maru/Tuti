"use client";

import { TutiAppShell } from "@/features/tuti/components/TutiAppShell";

export default function TutiLayout({ children }: { children: React.ReactNode }) {
  return <TutiAppShell>{children}</TutiAppShell>;
}
