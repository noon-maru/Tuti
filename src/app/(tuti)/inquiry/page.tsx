"use client";

import { useRouter } from "next/navigation";
import { InquiryScreen } from "@/features/tuti/screens/inquiry/InquiryScreen";

export default function InquiryPage() {
  const router = useRouter();

  return <InquiryScreen onBack={() => router.replace("/")} />;
}
