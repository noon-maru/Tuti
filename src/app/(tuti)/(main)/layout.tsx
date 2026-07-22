"use client";

import { MainFlow } from "@/features/tuti/flows/MainFlow";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainFlow>{children}</MainFlow>;
}
