"use client";

import styled from "@emotion/styled";
import { BookOpen, ChevronRight, Compass, Plus, Settings2, PenLine, ArrowUpRight, Download } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen, LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { HarumadiCover } from "@/features/tuti/components/HarumadiCover";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { fetchHarumadis, harumadiPath } from "@/lib/harumadis";
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
  return <Frame aria-labelledby="library-title">
    <Header><h1 id="library-title">나의 하루마디</h1><IconButton type="button" onClick={() => router.push("/settings")} aria-label="설정"><Settings2 size={20} /></IconButton></Header>
    <Toolbar><span>{query.isSuccess ? <>하루마디 <strong>{harumadiPdfs.length}{query.hasNextPage ? "+" : ""}</strong>권</> : "나의 책장"}</span>
      <TextAction type="button" onClick={openEditor}><Plus size={15} />새 하루마디</TextAction></Toolbar>
    {hasDraft && <DraftButton type="button" onClick={() => router.push("/harumadi/pdf/create")}><Download size={17} /><span>이전 PDF 작업 이어가기</span><ArrowUpRight size={16} /></DraftButton>}
    <ShelfScroll data-scroll-region aria-label="내 하루마디 가판대">
      {query.isPending ? <Status role="status"><LoadingIndicator /><p>책장에 하루마디를 놓고 있어요.</p></Status>
        : query.isError && !query.data ? <Status role="alert"><BookOpen size={28} /><h2>책장을 불러오지 못했어요.</h2><p>하루마디가 없어진 건 아니에요.<br />연결을 확인하고 다시 불러와주세요.</p><TextAction onClick={() => void query.refetch()}>다시 불러오기<ChevronRight size={14} /></TextAction></Status>
        : <>
          {harumadiPdfs.length === 0 ? <EmptyShelf>
            <EmptyMark aria-hidden="true"><PenLine size={25} strokeWidth={1.25} /><span /></EmptyMark>
            <h2>{isFirstMadi ? "첫 마디를 채워넣어보세요" : "모아둔 마디를 한 권으로"}</h2>
            <p>{isFirstMadi ? <>사진 한 장이나 짧은 이야기로<br />오늘의 순간을 가볍게 남겨보세요.</> : <>소중한 마디들을 담을<br />표지와 속지를 준비해보세요.</>}</p>
            {!isFirstMadi && <PrimaryButton type="button" onClick={openEditor}>새 하루마디 만들기<ArrowUpRight size={16} /></PrimaryButton>}
            <TextAction onClick={() => { setWelcomeHarumadiOrigin(null); router.push(welcomeHarumadiPath(1, "library")); }}>하루마디 예시 펼쳐보기<ChevronRight size={14} /></TextAction>
          </EmptyShelf> : <>
            {Array.from({ length: Math.ceil(harumadiPdfs.length / 2) }, (_, row) => <ShelfRow key={harumadiPdfs[row * 2].id}>
              <HarumadiGrid>{harumadiPdfs.slice(row * 2, row * 2 + 2).map(harumadiPdf => <HarumadiButton type="button" key={harumadiPdf.id} aria-label={`${harumadiPdf.title}, 마디 ${harumadiPdf.entryIds.length}개 열기`} onClick={() => router.push(harumadiPath(harumadiPdf.id))}>
                <HarumadiCover harumadiPdf={{ ...harumadiPdf, entryCount: harumadiPdf.entryIds.length, pageCount: 0, hasCover: harumadiPdf.coverStyle.endsWith("-image") && harumadiPdf.entryIds.length > 0 }} ownerId={ownerId} kind="harumadi" />
                <HarumadiLabel><strong>{harumadiPdf.title}</strong><small>{harumadiPdf.entryIds.length ? `마디 ${harumadiPdf.entryIds.length}개` : "첫 마디를 기다려요"} · {harumadiPdf.innerStyle === "photo" ? "사진 속지" : "글 속지"}</small></HarumadiLabel>
              </HarumadiButton>)}</HarumadiGrid><ShelfEdge aria-hidden="true" />
            </ShelfRow>)}
            {query.isError && <InlineError role="alert">다음 하루마디를 불러오지 못했어요.</InlineError>}
            {query.hasNextPage && <MoreButton disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오고 있어요" : "하루마디 더 보기"}</MoreButton>}
          </>}
        </>}
    </ShelfScroll>
    <LibraryLinks aria-label="마디와 PDF 보관함">
      <TextAction type="button" onClick={() => router.push("/madi")}>모아둔 마디<ChevronRight size={13} /></TextAction>
      <TextAction type="button" onClick={() => router.push("/harumadi/pdfs")}><Download size={13} />저장한 PDF</TextAction>
    </LibraryLinks>
    <Footer><PrimaryButton type="button" onClick={() => router.push("/madi/new?from=library")}><PenLine size={17} />{isFirstMadi ? "첫 마디 남기기" : "마디 남기기"}</PrimaryButton>
      <ExploreButton type="button" onClick={() => router.push("/explore")}><Compass size={19} /><span>둘러보기</span></ExploreButton></Footer>
  </Frame>;
}
const Frame = styled.section`height: 100%; min-height: 0; display: flex; flex-direction: column; background: #F8FAFC; color: var(--color-text);`;
const Header = styled.header`
  flex: none; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: calc(var(--app-safe-area-top, 0px) + 18px) 20px 0 24px;
  h1 { margin: 0; font-size: 23px; font-weight: 600; letter-spacing: -0.045em; line-height: 1.4; }
`;
const IconButton = styled(BaseButton)`width: 44px; height: 44px; flex: none; display: grid; place-items: center; background: transparent; color: var(--color-text-muted); border-radius: 50%; &:hover { background: var(--color-secondary-200); }`;
const Toolbar = styled.div`display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 2px 24px 6px; flex: none; > span { font-size: 12px; color: var(--color-text-muted); } strong { color: var(--color-text); font-weight: 500; font-variant-numeric: tabular-nums; }`;
const TextAction = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 6px 0; background: transparent; font-size: 12px; color: var(--color-text-muted); &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; border-radius: 4px; }`;
const DraftButton = styled(BaseButton)`flex: none; display: flex; align-items: center; gap: 10px; margin: 8px 24px; padding: 12px 14px; background: var(--color-secondary-200); border-radius: 12px; color: var(--color-text); font-size: 12px; text-align: left; > span { flex: 1; }`;
const ShelfScroll = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px 20px 8px; scrollbar-width: thin; &:has(> div:only-child) { display: flex; flex-direction: column; }`;
const ShelfRow = styled.div`margin-bottom: 24px; position: relative; flex: none; > div:last-child { position: absolute; left: 0; right: 0; bottom: 59px; pointer-events: none; }`;
const HarumadiGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 0 8px; align-items: end;`;
const HarumadiButton = styled(BaseButton)`display: grid; gap: 0; min-width: 0; text-align: left; background: transparent; color: inherit; overflow: visible;
  > span:first-of-type { transition: transform 180ms ease; } &:hover > span:first-of-type { transform: translateY(-5px); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 7px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { > span:first-of-type { transition: none; } &:hover > span:first-of-type { transform: none; } }
`;
const ShelfEdge = styled.div`height: 6px; border-radius: 1px 1px 3px 3px; background: linear-gradient(#ffffff, #e5e9e3); border-top: 1px solid white; box-shadow: 0 6px 10px rgb(27 34 42 / 0.06);`;
const HarumadiLabel = styled.span`min-width: 0; height: 59px; padding: 15px 1px 5px; display: grid; align-content: start; gap: 5px; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; } small { color: var(--color-text-muted); font-size: 10px; line-height: 1.5; }`;
const EmptyShelf = styled.div`flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 290px; padding: 16px 0 28px; h2 { margin: 27px 0 10px; font-size: 19px; font-weight: 600; letter-spacing: -0.035em; text-align: center; } > p { margin: 0 0 14px; white-space: pre-line; text-align: center; font-size: 13px; color: var(--color-text-muted); line-height: 1.85; } > button { margin-bottom: 4px; }`;
const EmptyMark = styled.span`position: relative; width: 80px; height: 102px; display: grid; place-content: center; justify-items: center; gap: 14px; border: 1px solid #dce3d6; border-radius: 2px 6px 6px 2px; background: #ffffff; box-shadow: 3px 3px 0 #e9ede5, 6px 8px 16px rgb(27 34 42 / 0.04); color: #7d8b70; &::before { content: ""; position: absolute; top: 0; bottom: 0; left: 6px; border-left: 1px solid #edf0e9; } > span { width: 22px; border-bottom: 1px solid #dce3d6; }`;
const Status = styled.div`min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; h2 { margin: 0; font-size: 17px; } p { margin: 0; line-height: 1.8; font-size: 12px; color: var(--color-text-muted); }`;
const MoreButton = styled(BaseButton)`display: block; margin: 4px auto 20px; padding: 12px 20px; border-radius: 20px; background: white; color: var(--color-text-muted); font-size: 12px;`;
const LibraryLinks = styled.nav`flex: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 0 24px; border-top: 1px solid #e8ede4; > button { font-size: 11px; }`;
const InlineError = styled.p`font-size: 12px; text-align: center; color: var(--color-error);`;
const Footer = styled.footer`flex: none; display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 12px; align-items: center; padding: 8px 24px calc(16px + var(--app-safe-area-bottom, 0px)); background: #F8FAFC; > button:first-of-type { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }`;
const ExploreButton = styled(BaseButton)`min-height: 48px; display: grid; justify-items: center; align-content: center; gap: 3px; padding: 0; background: transparent; color: var(--color-text-muted); font-size: 10px;`;
