import type { Metadata } from "next";
import { Suspense } from "react";
import { TutiAppShell } from "@/features/tuti/components/TutiAppShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TutiLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><TutiAppShell>{children}</TutiAppShell></Suspense>;
}
