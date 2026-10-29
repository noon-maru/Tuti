"use client";

import styled from "@emotion/styled";
import { BookOpen, Check } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { fetchHarumadis } from "@/lib/harumadis";
import { addMadiToHarumadi } from "@/lib/addMadiToHarumadi";

export function MadiHarumadiSelection({ ownerId, entryId, initialBookId, onDone, onNext }: {
  ownerId: string; entryId: string; initialBookId?: string | null;
  onDone: () => void; onNext: () => void;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(initialBookId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useInfiniteQuery({ queryKey: ["library-harumadis", ownerId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchHarumadis(ownerId, pageParam), getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 0, retry: false });
  const books = query.data?.pages.flatMap(page => page.harumadis) ?? [];
  const selectedBook = books.find(book => book.id === selected);
  const canAdd = Boolean(selectedBook);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const back = (event: Event) => { event.preventDefault(); if (!saving.current) onDone(); };
    window.addEventListener(ANDROID_BACK_EVENT, back);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, back);
  }, [onDone]);

  const complete = async (next: boolean) => {
    if (saving.current || !selected || !canAdd) return;
    saving.current = true; setBusy(true); setError("");
    try {
      await addMadiToHarumadi(ownerId, selected, entryId);
      void client.invalidateQueries({ queryKey: ["library-harumadis", ownerId] });
      void client.invalidateQueries({ queryKey: ["harumadi-content", ownerId] });
      client.removeQueries({ queryKey: ["library-cover", ownerId] });
      if (next) onNext(); else onDone();
    } catch (cause) {
      setError(`마디는 저장되어 있어요. ${cause instanceof Error ? cause.message : "하루마디에 담지 못했어요. 다시 시도해주세요."}`);
    } finally { saving.current = false; setBusy(false); }
  };

  return <Frame aria-labelledby="madi-collection-heading" aria-busy={busy}>
    <Header><BackButton aria-label="담지 않고 마치기" disabled={busy} onClick={onDone} /><span><Check size={16} />마디 저장 완료</span></Header>
    <Content data-scroll-region>
      <Intro><h1 id="madi-collection-heading" ref={heading} tabIndex={-1}>어느 하루마디에<br />담아둘까요?</h1><p>지금 담지 않아도 괜찮아요.<br />남긴 마디는 ‘전체 마디 보기’에서 다시 볼 수 있어요.</p></Intro>
      {query.isPending ? <Notice role="status">하루마디를 불러오고 있어요.</Notice>
        : query.isError && !query.data ? <Notice role="alert">하루마디를 불러오지 못했어요.<TextButton onClick={() => void query.refetch()}>다시 불러오기</TextButton></Notice>
        : !books.length ? <Notice><BookOpen size={28} strokeWidth={1.3} /><p>아직 하루마디가 없어요.<br />내 책장에서 한 권을 만든 뒤 담을 수 있어요.</p></Notice>
        : <Choices aria-label="마디를 담을 하루마디">{books.map(book => {
          return <Choice key={book.id} $selected={selected === book.id}>
            <input type="radio" name="madi-harumadi" value={book.id} checked={selected === book.id} disabled={busy} onChange={() => { setSelected(book.id); setError(""); }} />
            <Spine aria-hidden="true" $green={book.coverStyle.startsWith("green")}><BookOpen size={18} strokeWidth={1.3} /></Spine>
            <span><strong>{book.title}</strong><small>마디 {book.entryIds.length}개{book.shared ? " · 함께 채우는 사람들에게 보여요" : ""}</small></span>
          </Choice>;
        })}</Choices>}
      {query.isError && query.data && <Notice role="alert">목록을 새로 불러오지 못했어요.<TextButton onClick={() => void query.refetch()}>다시 불러오기</TextButton></Notice>}
      {query.hasNextPage && <TextButton disabled={query.isFetchingNextPage || busy} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오고 있어요" : "하루마디 더 보기"}</TextButton>}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </Content>
    <Footer>
      <PrimaryButton disabled={busy || !canAdd} onClick={() => void complete(false)}>{busy ? "담고 있어요…" : "선택한 하루마디에 담고 마치기"}</PrimaryButton>
      <TextButton disabled={busy} onClick={onDone}>담지 않고 마치기</TextButton>
      <TextButton disabled={busy || Boolean(selected && !canAdd)} onClick={() => { if (selected) void complete(true); else onNext(); }}>{selected ? "담고 다음 마디 남기기" : "담지 않고 다음 마디 남기기"}</TextButton>
    </Footer>
  </Frame>;
}

const Frame = styled(ScreenFrame)`background: var(--color-surface); gap: 20px; --screen-padding-top: calc(24px + var(--app-safe-area-top, 0px));`;
const Header = styled.header`display: flex; align-items: center; justify-content: space-between; flex: none; > span { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-muted); }`;
const Content = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 20px;`;
const Intro = styled.div`margin-bottom: 24px; h1 { margin: 0 0 12px; font-size: 25px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.4; &:focus { outline: none; } } p { margin: 0; font-size: 13px; line-height: 1.8; color: var(--color-text-muted); word-break: keep-all; }`;
const Choices = styled.div`display: grid; gap: 10px;`;
const Choice = styled.label<{ $selected: boolean }>`display: flex; align-items: center; gap: 12px; min-height: 84px; padding: 12px; border: 1px solid ${({ $selected }) => $selected ? "var(--color-brand-700)" : "var(--color-border)"}; border-radius: 12px; background: ${({ $selected }) => $selected ? "var(--color-brand-100)" : "var(--color-surface)"}; cursor: pointer; input { flex: none; accent-color: var(--color-brand-800); width: 18px; height: 18px; margin: 0; } &:has(input:disabled) { opacity: .6; cursor: default; } &:has(input:focus-visible) { outline: 2px solid var(--color-brand-700); outline-offset: 3px; } > span:last-child { min-width: 0; display: grid; gap: 5px; } strong { font-size: 15px; font-weight: 500; overflow-wrap: anywhere; line-height: 1.5; } small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }`;
const Spine = styled.span<{ $green: boolean }>`width: 38px; height: 52px; flex: none; display: grid; place-items: center; border: 1px solid var(--color-border); border-left: 3px solid #dce3d6; border-radius: 1px 4px 4px 1px; background: ${({ $green }) => $green ? "#EBF5D5" : "#fff"}; color: var(--color-text-muted);`;
const Notice = styled.div`padding: 24px 0; display: grid; justify-items: center; gap: 12px; text-align: center; color: var(--color-text-muted); font-size: 14px; line-height: 1.8; p { margin: 0; }`;
const ErrorMessage = styled.p`font-size: 13px; line-height: 1.7; color: var(--color-danger, #b84242);`;
const Footer = styled.footer`flex: none; display: grid; gap: 4px; > button { min-height: 44px; white-space: normal; line-height: 1.6; } > button:last-child { font-size: 12px; color: var(--color-text-muted); }`;
