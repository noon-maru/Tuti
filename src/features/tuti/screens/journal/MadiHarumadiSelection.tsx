"use client";

import styled from "@emotion/styled";
import { BookOpen, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { fetchRecentHarumadis } from "@/lib/harumadis";
import { addMadiToHarumadi } from "@/lib/addMadiToHarumadi";
import { HarumadiTitleHint } from "@/features/tuti/components/HarumadiTitleHint";
import { groupHarumadiChoices } from "@/shared/harumadi/recentChoices";
import type { Harumadi } from "@/shared/api/harumadi";
import { useHarumadiSearch } from "@/features/tuti/hooks/useHarumadiSearch";
import { useHarumadiLibrary } from "@/features/tuti/hooks/useHarumadiLibrary";
import { MadiSearchField } from "@/features/tuti/components/MadiSearchField";
import { harumadiSharingNotice } from "@/shared/harumadi/sharingAudience";

export function MadiHarumadiSelection({ ownerId, entryId, initialBookId, onDone, onNext }: {
  ownerId: string; entryId: string; initialBookId?: string | null;
  onDone: () => void; onNext: (bookId?: string) => void;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(initialBookId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completion, setCompletion] = useState<{ id: string; title: string } | null>();
  const finished = completion !== undefined;
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useHarumadiLibrary(ownerId);
  const search = useHarumadiSearch(query.data?.pages.flatMap(page => page.harumadis) ?? []);
  const recentQuery = useQuery({ queryKey: ["recent-harumadis", ownerId], queryFn: ({ signal }) => fetchRecentHarumadis(ownerId, signal),
    staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  // Only rank books still present in the complete, permission-filtered library.
  const recent = (recentQuery.data?.harumadis ?? []).flatMap(item => { const book = search.books.find(book => book.id === item.id); return book ? [book] : []; });
  const groups = groupHarumadiChoices(search.searching ? [] : recent, search.books);
  const books = [...groups.recent, ...groups.other];
  const selectedBook = books.find(book => book.id === selected);
  const canAdd = Boolean(selectedBook);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [finished]);
  useEffect(() => {
    const back = (event: Event) => { event.preventDefault(); if (!saving.current) onDone(); };
    window.addEventListener(ANDROID_BACK_EVENT, back);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, back);
  }, [onDone]);

  const complete = async () => {
    if (saving.current || finished || !selected || !selectedBook) return;
    saving.current = true; setBusy(true); setError("");
    try {
      await addMadiToHarumadi(ownerId, selected, entryId, Boolean(selectedBook?.shared));
      void client.invalidateQueries({ queryKey: ["library-harumadis", ownerId] });
      void client.invalidateQueries({ queryKey: ["harumadi-content", ownerId] });
      client.removeQueries({ queryKey: ["recent-harumadis", ownerId] });
      client.removeQueries({ queryKey: ["library-cover", ownerId] });
      setCompletion({ id: selectedBook.id, title: selectedBook.title });
    } catch (cause) {
      setError(`마디는 저장되어 있어요. ${cause instanceof Error ? cause.message : "하루마디에 담지 못했어요. 다시 시도해주세요."}`);
    } finally { saving.current = false; setBusy(false); }
  };
  const renderChoice = (book: Harumadi) => <Choice key={book.id} $selected={selected === book.id}>
    <input type="radio" name="madi-harumadi" value={book.id} checked={selected === book.id} disabled={busy} onChange={() => { setSelected(book.id); setError(""); }} />
    <Spine aria-hidden="true" $green={book.coverStyle.startsWith("green")}><BookOpen size={18} strokeWidth={1.3} /></Spine>
    <span><strong>{book.title}</strong><small>마디 {book.entryIds.length}개{book.shared ? ` · ${harumadiSharingNotice(book)}` : ""}</small><HarumadiTitleHint book={book} />{book.role === "contributor" && <small>{book.ownerName}님의 하루마디</small>}</span>
  </Choice>;

  if (finished) return <Frame aria-labelledby="madi-collection-heading">
    <Header><BackButton aria-label="작성 마치기" onClick={onDone} /></Header>
    <Completion role="status"><Check size={30} aria-hidden="true" />
      <h1 id="madi-collection-heading" ref={heading} tabIndex={-1}>마디를 남겼어요.</h1>
      <p>{completion ? `‘${completion.title}’에 담았어요.` : "전체 마디 보기에서 언제든 다시 볼 수 있어요."}</p>
    </Completion>
    <Footer><PrimaryButton onClick={onDone}>작성 마치기</PrimaryButton>
      <TextButton onClick={() => onNext(completion?.id)}>{completion ? "같은 하루마디에 다음 마디 남기기" : "다음 마디 남기기"}</TextButton>
    </Footer>
  </Frame>;

  return <Frame aria-labelledby="madi-collection-heading" aria-busy={busy}>
    <Header><BackButton aria-label="담지 않고 마치기" disabled={busy} onClick={onDone} /><span><Check size={16} />마디 저장 완료</span></Header>
    <Content data-scroll-region>
      <Intro><h1 id="madi-collection-heading" ref={heading} tabIndex={-1}>어느 하루마디에<br />담아둘까요?</h1><p>지금 담지 않아도 괜찮아요.<br />남긴 마디는 ‘전체 마디 보기’에서 다시 볼 수 있어요.</p></Intro>
      <MadiSearchField value={search.search} onChange={value => { setSelected(null); search.setSearch(value); }} label="하루마디 이름 검색" placeholder="하루마디 이름으로 찾기" />
      {query.isPending || (!search.searching && recentQuery.isPending) ? <Notice role="status">하루마디를 불러오고 있어요.</Notice>
        : query.isError && !query.data ? <Notice role="alert">하루마디를 불러오지 못했어요.<TextButton onClick={() => void query.refetch()}>다시 불러오기</TextButton></Notice>
        : !books.length ? <Notice><BookOpen size={28} strokeWidth={1.3} /><p>{search.searching ? "이름이 일치하는 하루마디가 없어요." : "이 마디를 담을 새 하루마디를 만들어보세요."}</p>{search.searching && <TextButton onClick={() => search.setSearch("")}>전체 하루마디 보기</TextButton>}</Notice>
        : <Choices aria-label="마디를 담을 하루마디">
          {groups.recent.length > 0 && <ChoiceGroup aria-label="최근 담은 하루마디"><h2>최근 담은 하루마디</h2>{groups.recent.map(renderChoice)}</ChoiceGroup>}
          {groups.other.length > 0 && <ChoiceGroup aria-label="내 하루마디">{groups.recent.length > 0 && <h2>내 하루마디</h2>}{groups.other.map(renderChoice)}</ChoiceGroup>}
        </Choices>}
      {query.isError && query.data && <Notice role="alert">목록을 새로 불러오지 못했어요.<TextButton onClick={() => void query.refetch()}>다시 불러오기</TextButton></Notice>}
      {error && <ErrorMessage role="alert">{error}<TextButton disabled={busy} onClick={() => { setSelected(null); void query.refetch(); void recentQuery.refetch(); }}>목록 다시 확인하기</TextButton></ErrorMessage>}
    </Content>
    <Footer>
      {!search.searching && query.isSuccess && !books.length ? <CreateLink href={`/harumadi?addEntryId=${encodeURIComponent(entryId)}`}>새 하루마디 만들어 담기</CreateLink> : <PrimaryButton disabled={busy || !canAdd} onClick={() => void complete()}>{busy ? "담고 있어요…" : "이 하루마디에 담기"}</PrimaryButton>}
      <TextButton disabled={busy} onClick={() => setCompletion(null)}>지금은 담지 않기</TextButton>
    </Footer>
  </Frame>;
}

const Frame = styled(ScreenFrame)`background: var(--color-surface); gap: 20px; --screen-padding-top: calc(24px + var(--app-safe-area-top, 0px));`;
const CreateLink = PrimaryButton.withComponent(Link);
const Header = styled.header`display: flex; align-items: center; justify-content: space-between; flex: none; > span { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-muted); }`;
const Content = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 20px;`;
const Intro = styled.div`margin-bottom: 24px; h1 { margin: 0 0 12px; font-size: 25px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.4; &:focus { outline: none; } } p { margin: 0; font-size: 13px; line-height: 1.8; color: var(--color-text-muted); word-break: keep-all; }`;
const Choices = styled.div`display: grid; gap: 10px;`;
const ChoiceGroup = styled.section`display: grid; gap: 10px; min-width: 0; & + & { margin-top: 14px; } h2 { margin: 0; font-size: 14px; font-weight: 500; color: var(--color-text-muted); line-height: 1.6; }`;
const Choice = styled.label<{ $selected: boolean }>`display: flex; align-items: center; gap: 12px; min-height: 84px; padding: 12px; border: 1px solid ${({ $selected }) => $selected ? "var(--color-brand-700)" : "var(--color-border)"}; border-radius: 12px; background: ${({ $selected }) => $selected ? "var(--color-brand-100)" : "var(--color-surface)"}; cursor: pointer; input { flex: none; accent-color: var(--color-brand-800); width: 18px; height: 18px; margin: 0; } &:has(input:disabled) { opacity: .6; cursor: default; } &:has(input:focus-visible) { outline: 2px solid var(--color-brand-700); outline-offset: 3px; } > span:last-child { min-width: 0; display: grid; gap: 5px; } strong { font-size: 15px; font-weight: 500; overflow-wrap: anywhere; line-height: 1.5; } small { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }`;
const Spine = styled.span<{ $green: boolean }>`width: 38px; height: 52px; flex: none; display: grid; place-items: center; border: 1px solid var(--color-border); border-left: 3px solid #dce3d6; border-radius: 1px 4px 4px 1px; background: ${({ $green }) => $green ? "#EBF5D5" : "#fff"}; color: var(--color-text-muted);`;
const Notice = styled.div`padding: 24px 0; display: grid; justify-items: center; gap: 12px; text-align: center; color: var(--color-text-muted); font-size: 14px; line-height: 1.8; p { margin: 0; }`;
const ErrorMessage = styled.p`font-size: 13px; line-height: 1.7; color: var(--color-danger, #b84242);`;
const Completion = styled.div`flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; text-align: center; padding: 24px 0; > svg { flex: none; color: var(--color-brand-800); } h1 { margin: 0; font-size: 25px; font-weight: 600; line-height: 1.4; &:focus { outline: none; } } p { margin: 0; color: var(--color-text-muted); font-size: 15px; line-height: 1.8; overflow-wrap: anywhere; }`;
const Footer = styled.footer`flex: none; display: grid; gap: 4px; > button, > a { min-height: 44px; white-space: normal; line-height: 1.6; } > button:last-child { font-size: 14px; color: var(--color-text-muted); }`;
