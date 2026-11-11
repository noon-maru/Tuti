"use client";

import styled from "@emotion/styled";
import { BookOpen, ChevronRight, MoreHorizontal, Plus, PenLine, ArrowUpRight, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen, LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { HarumadiShelf } from "@/features/tuti/components/HarumadiShelf";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { LibraryViewSwitch } from "@/features/tuti/components/LibraryViewSwitch";
import { useLibraryView } from "@/features/tuti/hooks/useLibraryView";
import { harumadiLocalRect } from "@/shared/harumadi/transitionGeometry";
import { HarumadiBookReader } from "@/features/tuti/components/HarumadiBookReader";
import { useHarumadiHistory } from "@/features/tuti/hooks/useHarumadiHistory";
import { MainNavigation } from "@/features/tuti/components/MainNavigation";
import { LibraryLoadNotice } from "@/features/tuti/components/LibraryLoadNotice";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { useHarumadiLibrary } from "@/features/tuti/hooks/useHarumadiLibrary";
import { useHarumadiSearch } from "@/features/tuti/hooks/useHarumadiSearch";
import { MadiSearchField } from "@/features/tuti/components/MadiSearchField";
import type { Harumadi } from "@/shared/api/harumadi";
import { markLibraryEntryCompleted } from "@/lib/libraryPreferences";
import { loadHarumadiPdfDraft } from "@/lib/harumadiPdfDraft";
import { welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { setWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";
import { useLifecycleView } from "../hooks/useLifecycleView";
import type { HarumadiOpeningMode } from "../navigation/harumadiActions";
import { ScreenFrame } from "../components/ScreenFrame";
import { ContextMenu } from "../components/ContextMenu";
import { bodyCopyStyles } from "@/shared/ui/typography";

export function LibraryHomeFlow() {
  const session = useSession();
  return session ? <LibraryHome key={session.userId} ownerId={session.userId} /> : <AppLoadingScreen label="내 책장을 준비하고 있어요." />;
}
function LibraryHome({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [hasDraft, setHasDraft] = useState(false);
  const { view, chooseView } = useLibraryView(ownerId);
  const shelfScroll = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLElement>(null);
  const { opening, openBook: showBook, closeBook, registerCloseGuard } = useHarumadiHistory(ownerId);
  useLifecycleView("home_viewed", "home", undefined, !opening);
  const openBook = (book: Harumadi, control: HTMLElement, mode: HarumadiOpeningMode = "pages") => {
    const bounds = frame.current?.getBoundingClientRect();
    const card = control.closest("[data-harumadi-card]");
    const spread = card?.querySelector('[data-harumadi-spread-preview][data-spread-ready="true"]');
    const cover = (spread ?? card?.querySelector("[data-book-cover] > span"))?.getBoundingClientRect();
    if (!bounds || !cover) return;
    showBook({ book, mode, origin: { ...harumadiLocalRect(bounds, cover, frame.current!.offsetWidth, frame.current!.offsetHeight), ...(spread ? { appearance: "spread" as const } : {}) } });
  };
  const library = useHarumadiLibrary(ownerId);
  const query = library;
  const search = useHarumadiSearch(query.data?.pages.flatMap(page => page.harumadis) ?? []);
  const harumadiPdfs = search.books;
  const isFirstMadi = library.isFirstMadi;
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
  return <Frame ref={frame} aria-label="내 책장"><HomeSurface $hidePreview={opening?.mode === "pages" && opening.origin.appearance === "spread"} inert={Boolean(opening)} aria-hidden={opening ? true : undefined}>
    <Header><LibraryViewSwitch view={view} onChange={value => { chooseView(value); shelfScroll.current?.scrollTo({ top: 0 }); }} />
      <CreateHarumadi type="button" onClick={openEditor}><Plus size={17} aria-hidden="true" />새 하루마디</CreateHarumadi>
      <LibraryMenu label="책장 메뉴" triggerContent={<MoreHorizontal size={22} aria-hidden="true" />}
        items={[{ label: "전체 마디 보기", onSelect: () => router.push("/madi") }, { label: "저장한 PDF", onSelect: () => router.push("/harumadi/pdfs") }, { label: "설정", onSelect: () => router.push("/settings") }]} /></Header>
    {hasDraft && <DraftButton type="button" onClick={() => router.push("/harumadi/pdf/create")}><Download size={17} /><span>이전 PDF 작업 이어가기</span><ArrowUpRight size={16} /></DraftButton>}
    <SearchRow><MadiSearchField value={search.search} onChange={search.setSearch} label="하루마디 이름 검색" placeholder="하루마디 이름으로 찾기" /></SearchRow>
    <ShelfScroll ref={shelfScroll} data-scroll-region data-library-layout={search.searching ? "covers" : view} aria-label="내 하루마디">
      {query.isPending ? <Status role="status"><LoadingIndicator /><p>책장에 하루마디를 놓고 있어요.</p></Status>
        : query.isError && !query.data ? <Status role="alert"><BookOpen size={28} /><h2>책장을 불러오지 못했어요.</h2><p>하루마디가 없어진 건 아니에요.<br />연결을 확인하고 다시 불러와주세요.</p><TextAction onClick={() => void query.refetch()}>다시 불러오기<ChevronRight size={14} /></TextAction></Status>
        : <>
          {harumadiPdfs.length === 0 && search.searching ? <Status role="status"><p>이름이 일치하는 하루마디가 없어요.</p><TextAction onClick={() => search.setSearch("")}>전체 하루마디 보기</TextAction></Status> : harumadiPdfs.length === 0 ? <EmptyShelf data-empty-shelf>
            <EmptyMark aria-hidden="true"><PenLine size={25} strokeWidth={1.25} /><span /></EmptyMark>
            <h2>{isFirstMadi ? "첫 마디를 채워넣어보세요" : "모아둔 마디를 한 권으로"}</h2>
            <p>{isFirstMadi ? <>사진 한 장이나 짧은 이야기로<br />오늘의 순간을 가볍게 남겨보세요.</> : <>소중한 마디들을 담을<br />하루마디의 표지를 골라보세요.</>}</p>
            {!isFirstMadi && <PrimaryButton type="button" onClick={openEditor}>새 하루마디 만들기<ArrowUpRight size={16} /></PrimaryButton>}
            <TextAction onClick={() => { setWelcomeHarumadiOrigin(null); router.push(welcomeHarumadiPath(1, "library")); }}>하루마디 예시 펼쳐보기<ChevronRight size={14} /></TextAction>
          </EmptyShelf> : <>
            {view === "carousel" && !search.searching ? <HarumadiCarousel books={harumadiPdfs} ownerId={ownerId} onOpen={openBook}
              onCreateMadi={bookId => router.push(`/madi/new?from=library&harumadiId=${encodeURIComponent(bookId)}`)} /> : <HarumadiShelf books={harumadiPdfs} ownerId={ownerId} view={!search.searching && view === "spines" ? "spines" : "covers"} onOpen={openBook} />}
          </>}
          {query.isError && <LibraryLoadNotice nextPage={false} busy={query.isFetching} onRetry={() => void query.refetch()} />}
        </>}
    </ShelfScroll>
    <MainNavigation active="harumadi" />
    </HomeSurface>
    {opening && <HarumadiBookReader opening={opening} onClose={closeBook} registerCloseGuard={registerCloseGuard} />}
  </Frame>;
}
const Frame = styled(ScreenFrame)`position: relative; height: 100%; min-height: 0; padding: 0; background: var(--color-surface); color: var(--color-text); isolation: isolate;
  --screen-padding-top: calc(var(--app-header-top-space, 24px) + var(--app-safe-area-top, 0px));
  --harumadi-shelf-title-size: 16px; --harumadi-shelf-brand-size: 10px; --harumadi-shelf-date-size: 11px;
  --harumadi-shelf-title-lines: 3; --harumadi-shelf-title-leading: 1.5;
`;
const HomeSurface = styled.div<{ $hidePreview: boolean }>`height: 100%; min-height: 0; display: flex; flex-direction: column;
  ${({ $hidePreview }) => $hidePreview && `[data-carousel-active="true"] [data-book-cover] { visibility: hidden; }`}
`;
const Header = styled.header`
  flex: none; display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: var(--screen-padding-top) var(--screen-padding-right) 8px var(--screen-padding-left);
`;
const SearchRow = styled.div`flex: none; padding: 4px var(--screen-padding-right) 8px var(--screen-padding-left);`;
const TextAction = styled(BaseButton)`${bodyCopyStyles} display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 8px 0; background: transparent; color: var(--color-text-muted); &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; border-radius: 4px; }`;
const CreateHarumadi = styled(TextAction)`flex: none; margin-left: auto; min-height: 44px; padding-inline: 12px; border-radius: 999px; background: var(--color-brand-100); color: var(--color-brand-1000); font-size: .875rem; font-weight: 500; line-height: 1.5; white-space: nowrap;`;
const LibraryMenu = styled(ContextMenu)`width: 44px; height: 44px; flex: none; > button { display: grid; place-items: center; width: 44px; height: 44px; min-height: 44px; padding: 0; color: var(--color-text-muted); background: transparent; border-radius: 50%; &:hover { background: var(--color-brand-100); } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; } }`;
const DraftButton = styled(BaseButton)`flex: none; display: flex; align-items: center; gap: 10px; margin: 8px 24px; padding: 12px 14px; background: var(--color-secondary-200); border-radius: 12px; color: var(--color-text); font-size: 16px; text-align: left; > span { flex: 1; }`;
const ShelfScroll = styled.div`display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 20px; scrollbar-width: thin; > * { flex-shrink: 0; } &[data-library-layout="carousel"] { container-type: size; padding-top: 4px; padding-bottom: 8px; } @container app-viewport (max-height: 620px) { &:has([data-empty-shelf]) { padding-top: 16px; padding-bottom: 8px; } }`;
const EmptyShelf = styled.div`flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 290px; padding: 16px 0 28px; h2 { margin: 27px 0 10px; font-size: 22px; font-weight: 600; letter-spacing: -0.035em; text-align: center; } > p { margin: 0 0 14px; white-space: pre-line; text-align: center; font-size: 16px; color: var(--color-text-muted); line-height: 1.85; } > button { margin-bottom: 4px; } @container app-viewport (max-height: 620px) { min-height: 0; padding: 8px 0 12px; h2 { margin: 16px 0 8px; } > p { margin-bottom: 8px; line-height: 1.7; } }`;
const EmptyMark = styled.span`position: relative; flex: none; width: 96px; height: 124px; display: grid; place-content: center; justify-items: center; gap: 16px; border: 1px solid #dce3d6; border-radius: 2px 6px 6px 2px; background: #ffffff; box-shadow: 3px 3px 0 #e9ede5, 6px 8px 16px rgb(27 34 42 / 0.04); color: #7d8b70; &::before { content: ""; position: absolute; top: 0; bottom: 0; left: 6px; border-left: 1px solid #edf0e9; } > span { width: 26px; border-bottom: 1px solid #dce3d6; } @container app-viewport (max-height: 620px) { width: 64px; height: 82px; gap: 10px; }`;
const Status = styled.div`flex: 1 0 auto; min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; h2 { margin: 0; font-size: 17px; } p { margin: 0; line-height: 1.8; font-size: 16px; color: var(--color-text-muted); }`;
