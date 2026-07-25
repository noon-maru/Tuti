import { Suspense } from "react";
import { JournalEditFlow } from "@/features/tuti/flows/JournalEditFlow";

export default function JournalEditPage() {
  return (
    <Suspense fallback={null}>
      <JournalEditFlow />
    </Suspense>
  );
}
