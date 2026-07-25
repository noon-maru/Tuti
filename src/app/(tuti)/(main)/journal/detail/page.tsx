import { Suspense } from "react";
import { JournalDetailFlow } from "@/features/tuti/flows/JournalDetailFlow";

export default function JournalDetailPage() {
  return (
    <Suspense fallback={null}>
      <JournalDetailFlow />
    </Suspense>
  );
}
