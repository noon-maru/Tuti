import { EntryFlow } from "@/features/tuti/flows/EntryFlow";
import { Suspense } from "react";

export default function EntryPage() {
  return <Suspense fallback={null}><EntryFlow /></Suspense>;
}
