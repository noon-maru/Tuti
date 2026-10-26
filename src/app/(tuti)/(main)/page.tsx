import type { Metadata } from "next";
import { LibraryHomeFlow } from "@/features/tuti/flows/LibraryHomeFlow";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default function MainPage() {
  return <LibraryHomeFlow />;
}
