"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InquiryScreen } from "@/features/tuti/screens/inquiry/InquiryScreen";

export default function InquiryPage() {
  return (
    <Suspense>
      <InquiryPageContent />
    </Suspense>
  );
}

function InquiryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <InquiryScreen
      initialView={searchParams.get("view") === "history" ? "history" : "write"}
      onBack={() => router.replace("/")}
    />
  );
}
