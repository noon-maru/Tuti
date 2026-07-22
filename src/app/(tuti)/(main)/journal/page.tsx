"use client";

import { useRouter } from "next/navigation";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";

export default function JournalPage() {
  const router = useRouter();

  return <JournalScreen onBack={() => router.replace("/")} />;
}
