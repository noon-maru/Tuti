import { Suspense } from "react";
import { HarumadiExampleFlow } from "@/features/tuti/flows/HarumadiExampleFlow";

export default function HarumadiExamplePage() {
  return <Suspense fallback={null}><HarumadiExampleFlow /></Suspense>;
}
