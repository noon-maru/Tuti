import { Suspense } from "react";
import { JournalBookReaderFlow } from "@/features/tuti/flows/JournalBookReaderFlow";
export default function JournalBookReaderPage() { return <Suspense fallback={null}><JournalBookReaderFlow /></Suspense>; }
