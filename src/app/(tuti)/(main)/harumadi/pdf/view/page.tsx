import { Suspense } from "react";
import { HarumadiPdfReaderFlow } from "@/features/tuti/flows/HarumadiPdfReaderFlow";
export default function HarumadiPdfReaderPage() { return <Suspense fallback={null}><HarumadiPdfReaderFlow /></Suspense>; }
