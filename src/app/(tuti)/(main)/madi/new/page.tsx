import { Suspense } from "react";
import { JournalCreateFlow } from "@/features/tuti/flows/JournalCreateFlow";

export default function JournalCreatePage() {
  return (
    <Suspense fallback={null}>
      <JournalCreateFlow />
    </Suspense>
  );
}
