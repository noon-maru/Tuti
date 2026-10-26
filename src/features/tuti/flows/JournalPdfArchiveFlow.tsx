"use client";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { ArrowLeft, FileText } from "lucide-react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { BaseButton } from "@/features/tuti/components/buttons";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { fetchLibraryBooks, libraryBookPath } from "@/lib/journalBookLibrary";

export function JournalPdfArchiveFlow() {
  const session = useSession();
  return session ? <Archive key={session.userId} owner={session.userId} /> : <AppLoadingScreen />;
}
function Archive({ owner }: { owner: string }) {
  const router = useRouter();
  const query = useInfiniteQuery({ queryKey: ["library-exports", owner], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchLibraryBooks(owner, pageParam), getNextPageParam: page => page.nextCursor ?? undefined, retry: false });
  const books = query.data?.pages.flatMap(page => page.books) ?? [];
  return <Frame><Back onClick={() => router.replace("/")}><ArrowLeft size={18} />내 책장</Back><h1>저장한 PDF</h1><p>저장한 시점의 기록집이에요.<br />책장의 기록집을 수정해도 이 파일은 바뀌지 않아요.</p>
    {query.isPending ? <p role="status">파일 목록을 불러오고 있어요.</p> : query.isError && !query.data ? <Back onClick={() => void query.refetch()}>다시 불러오기</Back> : !books.length ? <p>아직 저장한 PDF가 없어요.<br />기록집에 페이지를 채운 뒤 PDF로 저장할 수 있어요.</p> : books.map(book => <FileButton key={book.id} onClick={() => router.push(`${libraryBookPath(book.id)}&from=pdfs`)}><FileText size={19} /><span><strong>{book.title}</strong><small>{book.createdAt.slice(0, 10)} · {book.pageCount}쪽</small></span></FileButton>)}
    {query.hasNextPage && <Back disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오고 있어요." : "PDF 더 보기"}</Back>}
  </Frame>;
}
const Frame = styled.section`position: absolute; inset: 0; padding: calc(20px + var(--app-safe-area-top, 0px)) 24px calc(24px + var(--app-safe-area-bottom, 0px)); overflow: auto; background: #F8FAFC; h1 { font-size: 25px; margin: 24px 0 12px; } > p { font-size: 12px; line-height: 1.8; color: var(--color-text-muted); margin-bottom: 28px; }`;
const Back = styled(BaseButton)`min-height: 40px; display: flex; gap: 6px; align-items: center; background: transparent; color: var(--color-text-muted); font-size: 12px;`;
const FileButton = styled(BaseButton)`width: 100%; display: flex; gap: 14px; align-items: center; padding: 16px 0; text-align: left; background: transparent; border-bottom: 1px solid var(--color-border); color: inherit; span { min-width: 0; display: grid; gap: 6px; } strong { font-size: 13px; overflow-wrap: anywhere; font-weight: 500; } small { font-size: 10px; color: var(--color-text-muted); }`;
