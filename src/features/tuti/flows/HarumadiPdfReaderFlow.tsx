"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/features/tuti/hooks/useSession";
import { StoredHarumadiPdfViewer } from "./HarumadiPdfFlow";
import { fetchLibraryHarumadi } from "@/lib/harumadiPdfLibrary";
import { AppLoadingScreen, LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { BackButton, TextButton } from "@/features/tuti/components/buttons";
import styled from "@emotion/styled";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { bodyCopyStyles, screenTitleStyles } from "@/shared/ui/typography";

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
  if (!query.data) return <StatusFrame>
    <Header><BackButton aria-label={backPath === "/harumadi/pdfs" ? "저장한 PDF 목록으로 돌아가기" : "내 책장으로 돌아가기"} onClick={() => router.replace(backPath)} /><h1>저장한 PDF</h1></Header>
    <Status role={query.isError ? "alert" : undefined}>
      {id && query.isPending ? <LoadingIndicator label="PDF를 열고 있어요." /> : <>
        <p>{query.error instanceof Error ? query.error.message : "열 PDF를 선택해주세요."}</p>
        {id && <TextButton type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "불러오는 중…" : "다시 불러오기"}</TextButton>}
        <TextButton type="button" onClick={() => router.replace(backPath)}>{backPath === "/harumadi/pdfs" ? "저장한 PDF 목록으로" : "내 책장으로"}</TextButton>
      </>}
    </Status>
  </StatusFrame>;
  return <StoredHarumadiPdfViewer key={id} ownerId={ownerId} harumadiPdf={query.data} onBack={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); router.push(backPath); }}
    onDeleted={() => { void client.invalidateQueries({ queryKey: ["library-exports", ownerId] }); client.removeQueries({ queryKey: ["library-harumadiPdf", ownerId, id] }); client.removeQueries({ queryKey: ["library-cover", ownerId, id] }); router.replace(backPath); }} />;
}
const StatusFrame = styled(ScreenFrame)`background: var(--color-surface); gap: 20px;`;
const Header = styled.header`display: flex; align-items: center; gap: 8px; flex: none; h1 { ${screenTitleStyles} }`;
const Status = styled.div`${bodyCopyStyles} flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; text-align: center; p { margin: 0; }`;
