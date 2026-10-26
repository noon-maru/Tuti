import { Suspense } from "react";
import { ExploreFlow } from "@/features/tuti/flows/ExploreFlow";

export default function ExplorePage() {
  return <Suspense fallback={null}><ExploreFlow /></Suspense>;
}
