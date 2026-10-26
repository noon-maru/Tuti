"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/features/tuti/hooks/useSession";
import { StoredBookViewer } from "./JournalBookFlow";
import { fetchLibraryBook } from "@/lib/journalBookLibrary";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { Button } from "@/features/tuti/components/buttons";

export function JournalBookReaderFlow() {
  const session = useSession();
  return session ? <Reader key={session.userId} ownerId={session.userId} /> : <AppLoadingScreen label="기록집을 준비하고 있어요." />;
}
function Reader({ ownerId }: { ownerId: string }) {
  const params = useSearchParams();
  const id = params.get("bookId") ?? "";
  const backPath = params.get("from") === "pdfs" ? "/journal/pdfs" : "/";
  const router = useRouter(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["library-book", ownerId, id], queryFn: () => fetchLibraryBook(ownerId, id), enabled: Boolean(id), retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  if (id && query.isPending) return <AppLoadingScreen label="기록집을 열고 있어요." />;
  if (!query.data) return <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 16, padding: 24 }} role="alert">
    <p>{query.error instanceof Error ? query.error.message : "열 기록집을 선택해주세요."}</p>
    {id && <Button onClick={() => void query.refetch()}>다시 불러오기</Button>}
    <Button onClick={() => router.replace("/")}>내 책장으로</Button>
  </div>;
  return <StoredBookViewer key={id} ownerId={ownerId} book={query.data} onBack={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); router.push(backPath); }}
    onDeleted={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); client.removeQueries({ queryKey: ["library-book", ownerId, id] }); client.removeQueries({ queryKey: ["library-cover", ownerId, id] }); router.replace(backPath); }} />;
}
