import type { Metadata } from "next";
import { TutiAppShell } from "@/features/tuti/components/TutiAppShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TutiLayout({ children }: { children: React.ReactNode }) {
  return <TutiAppShell>{children}</TutiAppShell>;
}
