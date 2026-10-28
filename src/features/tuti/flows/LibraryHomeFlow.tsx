"use client";

import styled from "@emotion/styled";
import { BookOpen, ChevronRight, Plus, Settings2, PenLine, ArrowUpRight, Download, MoreVertical } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen, LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { HarumadiCover } from "@/features/tuti/components/HarumadiCover";
import { HarumadiBookReader } from "@/features/tuti/components/HarumadiBookReader";
import { useHarumadiHistory } from "@/features/tuti/hooks/useHarumadiHistory";
import { MainNavigation } from "@/features/tuti/components/MainNavigation";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { fetchHarumadis } from "@/lib/harumadis";
import type { Harumadi } from "@/shared/api/harumadi";
import { markLibraryEntryCompleted } from "@/lib/libraryPreferences";
import { loadHarumadiPdfDraft } from "@/lib/harumadiPdfDraft";
import { welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { setWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";

export function LibraryHomeFlow() {
  const session = useSession();
  return session ? <LibraryHome key={session.userId} ownerId={session.userId} /> : <AppLoadingScreen label="내 책장을 준비하고 있어요." />;
}
function LibraryHome({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [hasDraft, setHasDraft] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const { opening, openBook: showBook, closeBook } = useHarumadiHistory(ownerId);
  const openBook = (book: Harumadi, control: HTMLElement, settings = false) => {
    const bounds = frame.current?.getBoundingClientRect();
    const cover = control.closest("[data-harumadi-card]")?.querySelector("[data-book-cover] > span")?.getBoundingClientRect();
    if (!bounds || !cover) return;
    showBook({ book, settings, origin: { x: cover.left - bounds.left, y: cover.top - bounds.top, width: cover.width, height: cover.height } });
  };
  const query = useInfiniteQuery({ queryKey: ["library-harumadis", ownerId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchHarumadis(ownerId, pageParam), getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 30_000, retry: false });
  const harumadiPdfs = query.data?.pages.flatMap(page => page.harumadis) ?? [];
  const recordCount = query.data?.pages[0].recordCount ?? 0;
  const isFirstMadi = query.isSuccess && recordCount === 0;
  useEffect(() => {
    let active = true;
    void markLibraryEntryCompleted(ownerId);
    void loadHarumadiPdfDraft(ownerId).catch(() => null).then(draft => {
      if (!active) return;
      setHasDraft(Boolean(draft && (draft.entryIds.length || draft.letter.trim() || draft.title !== "우리의 작은 외출")));
    });
    return () => { active = false; };
  }, [ownerId]);
  const openEditor = () => router.push("/harumadi");
  return <Frame ref={frame} aria-labelledby="library-title"><HomeSurface inert={Boolean(opening)} aria-hidden={opening ? true : undefined}>
    <Header><h1 id="library-title">나의 하루마디</h1><IconButton type="button" onClick={() => router.push("/settings")} aria-label="설정"><Settings2 size={24} /></IconButton></Header>
    <Toolbar><span>{query.isSuccess ? <>하루마디 <strong>{harumadiPdfs.length}{query.hasNextPage ? "+" : ""}</strong>권</> : "나의 책장"}</span>
      <TextAction type="button" onClick={openEditor}><Plus size={19} />새 하루마디</TextAction></Toolbar>
    {hasDraft && <DraftButton type="button" onClick={() => router.push("/harumadi/pdf/create")}><Download size={17} /><span>이전 PDF 작업 이어가기</span><ArrowUpRight size={16} /></DraftButton>}
    <ShelfScroll data-scroll-region aria-label="내 하루마디 가판대">
      {query.isPending ? <Status role="status"><LoadingIndicator /><p>책장에 하루마디를 놓고 있어요.</p></Status>
        : query.isError && !query.data ? <Status role="alert"><BookOpen size={28} /><h2>책장을 불러오지 못했어요.</h2><p>하루마디가 없어진 건 아니에요.<br />연결을 확인하고 다시 불러와주세요.</p><TextAction onClick={() => void query.refetch()}>다시 불러오기<ChevronRight size={14} /></TextAction></Status>
        : <>
          {harumadiPdfs.length === 0 ? <EmptyShelf data-empty-shelf>
            <EmptyMark aria-hidden="true"><PenLine size={25} strokeWidth={1.25} /><span /></EmptyMark>
            <h2>{isFirstMadi ? "첫 마디를 채워넣어보세요" : "모아둔 마디를 한 권으로"}</h2>
            <p>{isFirstMadi ? <>사진 한 장이나 짧은 이야기로<br />오늘의 순간을 가볍게 남겨보세요.</> : <>소중한 마디들을 담을<br />하루마디의 표지를 골라보세요.</>}</p>
            {!isFirstMadi && <PrimaryButton type="button" onClick={openEditor}>새 하루마디 만들기<ArrowUpRight size={16} /></PrimaryButton>}
            <TextAction onClick={() => { setWelcomeHarumadiOrigin(null); router.push(welcomeHarumadiPath(1, "library")); }}>하루마디 예시 펼쳐보기<ChevronRight size={14} /></TextAction>
          </EmptyShelf> : <>
            {Array.from({ length: Math.ceil(harumadiPdfs.length / 2) }, (_, row) => <ShelfRow key={harumadiPdfs[row * 2].id}>
              <HarumadiGrid>{harumadiPdfs.slice(row * 2, row * 2 + 2).map(harumadiPdf => <HarumadiCard key={harumadiPdf.id} data-harumadi-card>
                <HarumadiButton data-book-cover type="button" aria-label={`${harumadiPdf.title}, 마디 ${harumadiPdf.entryIds.length}개 열기`} onClick={event => openBook(harumadiPdf, event.currentTarget)}>
                <HarumadiCover harumadiPdf={{ ...harumadiPdf, entryCount: harumadiPdf.entryIds.length, pageCount: 0, hasCover: harumadiPdf.coverStyle.endsWith("-image") && harumadiPdf.entryIds.length > 0 }} ownerId={ownerId} kind="harumadi" />
                <HarumadiLabel><strong>{harumadiPdf.title}</strong><small>{harumadiPdf.entryIds.length ? `마디 ${harumadiPdf.entryIds.length}개` : "첫 마디를 기다려요"}</small></HarumadiLabel>
              </HarumadiButton><BookSettings type="button" aria-label={`${harumadiPdf.title} 설정`} title="하루마디 설정" onClick={event => openBook(harumadiPdf, event.currentTarget, true)}><MoreVertical size={22} /></BookSettings>
              </HarumadiCard>)}</HarumadiGrid><ShelfEdge aria-hidden="true" />
            </ShelfRow>)}
            {query.isError && <InlineError role="alert">다음 하루마디를 불러오지 못했어요.</InlineError>}
            {query.hasNextPage && <MoreButton disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오고 있어요" : "하루마디 더 보기"}</MoreButton>}
          </>}
        </>}
    </ShelfScroll>
    <LibraryLinks aria-label="마디와 PDF 보관함">
      <TextAction type="button" onClick={() => router.push("/madi")}>전체 마디 보기<ChevronRight size={13} /></TextAction>
      <TextAction type="button" onClick={() => router.push("/harumadi/pdfs")}><Download size={13} />저장한 PDF</TextAction>
    </LibraryLinks>
    <MainNavigation active="harumadi" firstMadi={isFirstMadi} />
    </HomeSurface>
    {opening && <HarumadiBookReader opening={opening} ownerId={ownerId} onClose={closeBook} />}
  </Frame>;
}
const Frame = styled.section`position: relative; height: 100%; min-height: 0; background: #F8FAFC; color: var(--color-text); isolation: isolate;
  --harumadi-shelf-title-size: 16px; --harumadi-shelf-brand-size: 10px; --harumadi-shelf-date-size: 11px;
  --harumadi-shelf-title-lines: 3; --harumadi-shelf-title-leading: 1.5;
  --harumadi-shelf-photo-height: min(38%, max(0px, calc(100% - 128px)));
  --main-navigation-label-size: 12px; --main-navigation-create-size: 14px;
  --main-navigation-item-height: 56px; --main-navigation-create-height: 52px;
  --main-navigation-icon-size: 24px;
`;
const HomeSurface = styled.div`height: 100%; min-height: 0; display: flex; flex-direction: column;`;
const Header = styled.header`
  flex: none; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: calc(var(--app-safe-area-top, 0px) + 22px) 24px 0;
  h1 { margin: 0; min-width: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.045em; line-height: 1.4; }
`;
const IconButton = styled(BaseButton)`width: 48px; height: 48px; flex: none; display: grid; place-items: center; background: transparent; color: var(--color-text-muted); border-radius: 50%; &:hover { background: var(--color-secondary-200); }`;
const Toolbar = styled.div`display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 24px 8px; flex: none; > span { font-size: 15px; color: var(--color-text-muted); } strong { color: var(--color-text); font-weight: 500; font-variant-numeric: tabular-nums; }`;
const TextAction = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 8px 0; background: transparent; font-size: 16px; color: var(--color-text-muted); &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; border-radius: 4px; }`;
const DraftButton = styled(BaseButton)`flex: none; display: flex; align-items: center; gap: 10px; margin: 8px 24px; padding: 12px 14px; background: var(--color-secondary-200); border-radius: 12px; color: var(--color-text); font-size: 16px; text-align: left; > span { flex: 1; }`;
const ShelfScroll = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 30px 20px 12px; scrollbar-width: thin; &:has(> div:only-child) { display: flex; flex-direction: column; } @container app-viewport (max-height: 620px) { &:has([data-empty-shelf]) { padding-top: 16px; padding-bottom: 8px; } }`;
const ShelfRow = styled.div`margin-bottom: 36px; position: relative; flex: none; > div:last-child { position: absolute; left: 0; right: 0; bottom: 108px; pointer-events: none; }`;
const HarumadiGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 0 8px; align-items: end;`;
const HarumadiCard = styled.div`position: relative; min-width: 0;`;
const BookSettings = styled(BaseButton)`position: absolute; right: -8px; bottom: 60px; width: 44px; height: 44px; display: grid; place-items: center; background: transparent; border-radius: 18px; color: var(--color-text-muted); &:hover { background: #e8ede4; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 1px; }`;
const HarumadiButton = styled(BaseButton)`display: grid; gap: 0; width: 100%; min-width: 0; padding: 0; text-align: left; background: transparent; color: inherit; overflow: visible;
  > span:first-of-type { transition: transform 180ms ease; } &:hover > span:first-of-type { transform: translateY(-5px); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 7px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { > span:first-of-type { transition: none; } &:hover > span:first-of-type { transform: none; } }
`;
const ShelfEdge = styled.div`height: 6px; border-radius: 1px 1px 3px 3px; background: linear-gradient(#ffffff, #e5e9e3); border-top: 1px solid white; box-shadow: 0 6px 10px rgb(27 34 42 / 0.06);`;
const HarumadiLabel = styled.span`min-width: 0; height: 108px; padding: 18px 0 12px 1px; display: grid; align-content: start; gap: 8px; strong { padding-right: 36px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-size: 16px; line-height: 1.4; font-weight: 500; } small { color: var(--color-text-muted); font-size: 13px; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`;
const EmptyShelf = styled.div`flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 290px; padding: 16px 0 28px; h2 { margin: 27px 0 10px; font-size: 22px; font-weight: 600; letter-spacing: -0.035em; text-align: center; } > p { margin: 0 0 14px; white-space: pre-line; text-align: center; font-size: 16px; color: var(--color-text-muted); line-height: 1.85; } > button { margin-bottom: 4px; } @container app-viewport (max-height: 620px) { min-height: 0; padding: 8px 0 12px; h2 { margin: 16px 0 8px; } > p { margin-bottom: 8px; line-height: 1.7; } }`;
const EmptyMark = styled.span`position: relative; flex: none; width: 96px; height: 124px; display: grid; place-content: center; justify-items: center; gap: 16px; border: 1px solid #dce3d6; border-radius: 2px 6px 6px 2px; background: #ffffff; box-shadow: 3px 3px 0 #e9ede5, 6px 8px 16px rgb(27 34 42 / 0.04); color: #7d8b70; &::before { content: ""; position: absolute; top: 0; bottom: 0; left: 6px; border-left: 1px solid #edf0e9; } > span { width: 26px; border-bottom: 1px solid #dce3d6; } @container app-viewport (max-height: 620px) { width: 64px; height: 82px; gap: 10px; }`;
const Status = styled.div`min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; h2 { margin: 0; font-size: 17px; } p { margin: 0; line-height: 1.8; font-size: 16px; color: var(--color-text-muted); }`;
const MoreButton = styled(BaseButton)`display: block; margin: 4px auto 20px; padding: 12px 20px; border-radius: 20px; background: white; color: var(--color-text-muted); font-size: 16px;`;
const LibraryLinks = styled.nav`flex: none; display: flex; justify-content: space-between; align-items: center; gap: 20px; margin: 0 24px; padding: 6px 0; border-top: 1px solid #e8ede4; > button { font-size: 15px; }`;
const InlineError = styled.p`font-size: 16px; text-align: center; color: var(--color-error);`;
