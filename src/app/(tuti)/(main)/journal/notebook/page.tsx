import { Suspense } from "react";
import { JournalNotebookFlow } from "@/features/tuti/flows/JournalNotebookFlow";
export default function NotebookPage() { return <Suspense fallback={null}><JournalNotebookFlow /></Suspense>; }
