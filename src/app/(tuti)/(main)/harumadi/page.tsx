import { Suspense } from "react";
import { HarumadiFlow } from "@/features/tuti/flows/HarumadiFlow";
export default function HarumadiPage() { return <Suspense fallback={null}><HarumadiFlow /></Suspense>; }
