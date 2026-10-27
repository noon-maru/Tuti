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
import { readLibraryWelcomeSeen } from "@/lib/libraryPreferences";
import { loadHarumadiPdfDraft } from "@/lib/harumadiPdfDraft";
import { useTutiStore } from "@/store/tuti";
import { welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { setWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";

export function LibraryHomeFlow() {
  const session = useSession();
  return session ? <LibraryHome key={session.userId} ownerId={session.userId} /> : <AppLoadingScreen label="내 책장을 준비하고 있어요." />;
}
function LibraryHome({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const entryRecord = useTutiStore(state => state.entryRecord);
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const query = useInfiniteQuery({ queryKey: ["library-harumadis", ownerId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchHarumadis(ownerId, pageParam), getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 30_000, retry: false });
  const harumadiPdfs = query.data?.pages.flatMap(page => page.harumadis) ?? [];
  const recordCount = query.data?.pages[0].recordCount ?? 0;
  const isFirstMadi = query.isSuccess && recordCount === 0;
  useEffect(() => {
    let active = true;
    void Promise.all([readLibraryWelcomeSeen(ownerId), loadHarumadiPdfDraft(ownerId).catch(() => null)]).then(([seen, draft]) => {
      if (!active) return;
      setHasDraft(Boolean(draft && (draft.entryIds.length || draft.letter.trim() || draft.title !== "우리의 작은 외출")));
      setWelcomeSeen(seen);
    });
    return () => { active = false; };
  }, [ownerId]);
  const showWelcome = query.isSuccess && harumadiPdfs.length === 0 && recordCount === 0 && welcomeSeen === false && !entryRecord && !hasDraft;
  useEffect(() => { if (showWelcome) router.replace("/entry"); }, [router, showWelcome]);
  if (showWelcome || welcomeSeen === null) return <AppLoadingScreen label="내 책장을 준비하고 있어요." />;
  const openEditor = () => router.push("/harumadi");
  return <Frame aria-labelledby="library-title">
    <Header><IconButton type="button" onClick={() => router.push("/settings")} aria-label="설정"><Settings2 size={20} /></IconButton></Header>
    <Heading><h1 id="library-title">나의 작은 책장</h1><p>{isFirstMadi ? "기억하고 싶은 하루, 첫 마디부터 남겨보세요." : "한 권을 준비하고, 하루씩 채워보세요."}</p></Heading>
    <Toolbar><span>하루마디 <strong>{harumadiPdfs.length}{query.hasNextPage ? "+" : ""}</strong>권</span>
      <TextAction type="button" onClick={() => router.push("/journal")}>모아둔 마디<ChevronRight size={14} /></TextAction></Toolbar>
    {hasDraft && <DraftButton type="button" onClick={() => router.push("/harumadi/pdf/create")}><Download size={17} /><span>이전 PDF 작업 이어가기</span><ArrowUpRight size={16} /></DraftButton>}
    <ShelfScroll data-scroll-region aria-label="내 하루마디 가판대">
      {query.isPending ? <Status role="status"><LoadingIndicator /><p>책장에 하루마디를 놓고 있어요.</p></Status>
        : query.isError && !query.data ? <Status role="alert"><BookOpen size={28} /><h2>책장을 불러오지 못했어요.</h2><p>하루마디가 없어진 건 아니에요.<br />연결을 확인하고 다시 불러와주세요.</p><TextAction onClick={() => void query.refetch()}>다시 불러오기<ChevronRight size={14} /></TextAction></Status>
        : <>
          {harumadiPdfs.length === 0 ? <EmptyShelf>
            <EmptyMark aria-hidden="true"><PenLine size={28} strokeWidth={1.25} /></EmptyMark>
            <h2>{isFirstMadi ? "첫 마디를 채워넣어보세요" : "모아둔 마디를 한 권으로"}</h2>
            <p>{isFirstMadi ? <>사진 한 장이나 짧은 이야기로<br />오늘의 순간을 가볍게 남겨보세요.</> : <>소중한 마디들을 담을<br />표지와 속지를 준비해보세요.</>}</p>
            {isFirstMadi
              ? <TextAction type="button" onClick={openEditor}>하루마디부터 만들고 싶어요<ChevronRight size={14} /></TextAction>
              : <PrimaryButton type="button" onClick={openEditor}>새 하루마디 만들기<ArrowUpRight size={16} /></PrimaryButton>}
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
            <CreateHarumadi type="button" onClick={openEditor}><span><Plus size={18} /></span><div><strong>새 하루마디 만들기</strong><small>표지와 속지부터 준비해요.</small></div><ChevronRight size={16} /></CreateHarumadi>
          </>}
          <ArchiveButton type="button" onClick={() => router.push("/harumadi/pdfs")}><Download size={15} />저장한 PDF 보기<ChevronRight size={14} /></ArchiveButton>
        </>}
    </ShelfScroll>
    <Footer><PrimaryButton type="button" onClick={() => router.push("/journal/new?from=library")}><PenLine size={17} />{isFirstMadi ? "첫 마디 남기기" : "마디 남기기"}</PrimaryButton>
      <ExploreButton type="button" onClick={() => router.push("/explore")}><Compass size={19} /><span>둘러보기</span></ExploreButton></Footer>
  </Frame>;
}
const Frame = styled.section`height: 100%; min-height: 0; display: flex; flex-direction: column; background: #F8FAFC; color: var(--color-text);`;
const Header = styled.header`
  flex: none; display: flex; justify-content: flex-end; align-items: center; padding: calc(var(--app-safe-area-top, 0px) + 16px) 24px 0;
`;
const IconButton = styled(BaseButton)`width: 44px; height: 44px; display: grid; place-items: center; background: transparent; color: var(--color-text); border-radius: 50%; &:hover { background: var(--color-secondary-200); }`;
const Heading = styled.div`flex: none; padding: 12px 24px 8px; h1 { margin: 0 0 7px; font-size: 27px; font-weight: 600; letter-spacing: -0.045em; line-height: 1.35; } p { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.6; }`;
const Toolbar = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 10px 24px 4px; flex: none; > span { font-size: 11px; color: var(--color-text-muted); } strong { color: var(--color-text); font-weight: 600; }`;
const TextAction = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 36px; padding: 5px 0; background: transparent; font-size: 11px; color: var(--color-text-muted);`;
const DraftButton = styled(BaseButton)`flex: none; display: flex; align-items: center; gap: 10px; margin: 8px 24px; padding: 12px 14px; background: var(--color-secondary-200); border-radius: 12px; color: var(--color-text); font-size: 12px; text-align: left; > span { flex: 1; }`;
const ShelfScroll = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 20px 28px;`;
const ShelfRow = styled.div`margin-bottom: 22px; position: relative; > div:last-child { position: absolute; left: 0; right: 0; bottom: 49px; pointer-events: none; }`;
const HarumadiGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px; padding: 0 12px; align-items: end;`;
const HarumadiButton = styled(BaseButton)`display: grid; gap: 0; min-width: 0; text-align: left; background: transparent; color: inherit; overflow: visible;
  > span:first-of-type { transition: transform 180ms ease; } &:hover > span:first-of-type { transform: translateY(-5px); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 7px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { > span:first-of-type { transition: none; } &:hover > span:first-of-type { transform: none; } }
`;
const ShelfEdge = styled.div`height: 8px; border-radius: 2px; background: linear-gradient(#FDFEFC, #E3E8E0); border-top: 1px solid white; box-shadow: 0 5px 8px rgb(27 34 42 / 0.07);`;
const HarumadiLabel = styled.span`min-width: 0; height: 49px; padding: 11px 2px 5px; display: grid; align-content: start; gap: 3px; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 500; } small { color: var(--color-text-muted); font-size: 9px; }`;
const EmptyShelf = styled.div`display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px; padding: 24px 0; h2 { margin: 24px 0 10px; font-size: 18px; font-weight: 600; letter-spacing: -0.025em; text-align: center; } > p { margin: 0 0 20px; white-space: pre-line; text-align: center; font-size: 12px; color: var(--color-text-muted); line-height: 1.9; } > button { margin-bottom: 8px; }`;
const EmptyMark = styled.span`width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; background: var(--color-secondary-200); color: var(--color-text-muted);`;
const Status = styled.div`min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; h2 { margin: 0; font-size: 17px; } p { margin: 0; line-height: 1.8; font-size: 12px; color: var(--color-text-muted); }`;
const MoreButton = styled(BaseButton)`display: block; margin: 4px auto 20px; padding: 12px 20px; border-radius: 20px; background: white; color: var(--color-text-muted); font-size: 12px;`;
const ArchiveButton = styled(BaseButton)`display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; margin: 20px auto 0; background: transparent; color: var(--color-text-muted); font-size: 11px;`;
const InlineError = styled.p`font-size: 12px; text-align: center; color: var(--color-error);`;
const CreateHarumadi = styled(BaseButton)`display: flex; gap: 12px; align-items: center; text-align: left; width: calc(100% - 8px); margin: 0 auto; background: transparent; border: 1px dashed #b9c4af; padding: 15px 12px; border-radius: 12px; color: var(--color-text); > span { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--color-secondary-200); } > div { flex: 1; display: grid; gap: 4px; strong { font-size: 12px; font-weight: 500; } small { font-size: 10px; color: var(--color-text-muted); } }`;
const Footer = styled.footer`flex: none; display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 12px; align-items: center; padding: 12px 24px calc(16px + var(--app-safe-area-bottom, 0px)); border-top: 1px solid #e7ecdf; background: #F8FAFC; > button:first-of-type { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }`;
const ExploreButton = styled(BaseButton)`min-height: 48px; display: grid; justify-items: center; align-content: center; gap: 3px; padding: 0; background: transparent; color: var(--color-text-muted); font-size: 10px;`;
