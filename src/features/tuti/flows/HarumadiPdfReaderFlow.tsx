"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/features/tuti/hooks/useSession";
import { StoredHarumadiPdfViewer } from "./HarumadiPdfFlow";
import { fetchLibraryHarumadi } from "@/lib/harumadiPdfLibrary";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { Button } from "@/features/tuti/components/buttons";

export function HarumadiPdfReaderFlow() {
  const session = useSession();
  return session ? <Reader key={session.userId} ownerId={session.userId} /> : <AppLoadingScreen label="하루마디를 준비하고 있어요." />;
}
function Reader({ ownerId }: { ownerId: string }) {
  const params = useSearchParams();
  const id = params.get("harumadiPdfId") ?? "";
  const backPath = params.get("from") === "pdfs" ? "/harumadi/pdfs" : "/";
  const router = useRouter(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["library-harumadiPdf", ownerId, id], queryFn: () => fetchLibraryHarumadi(ownerId, id), enabled: Boolean(id), retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  if (id && query.isPending) return <AppLoadingScreen label="하루마디를 열고 있어요." />;
  if (!query.data) return <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 16, padding: 24 }} role="alert">
    <p>{query.error instanceof Error ? query.error.message : "열 하루마디를 선택해주세요."}</p>
    {id && <Button onClick={() => void query.refetch()}>다시 불러오기</Button>}
    <Button onClick={() => router.replace("/")}>내 책장으로</Button>
  </div>;
  return <StoredHarumadiPdfViewer key={id} ownerId={ownerId} harumadiPdf={query.data} onBack={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); router.push(backPath); }}
    onDeleted={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); client.removeQueries({ queryKey: ["library-harumadiPdf", ownerId, id] }); client.removeQueries({ queryKey: ["library-cover", ownerId, id] }); router.replace(backPath); }} />;
}
