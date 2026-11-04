"use client";
import { sectionHeadingStyles, screenTitleStyles, bodyCopyStyles, captionStyles, inputControlStyles } from "@/shared/ui/typography";
import { confirmAction, showToast } from "@/lib/feedback";
import { DUPLICATE_HARUMADI_TITLE_NOTICE, shouldNotifyDuplicateTitle } from "@/shared/harumadi/titleHints";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "@emotion/styled";
import { ArrowLeft, Check, MessageCircle, PenLine, Settings2, Users } from "lucide-react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { HarumadiPdfPreview } from "@/features/tuti/components/HarumadiPdfPreview";
import { HarumadiPageViewer } from "@/features/tuti/components/HarumadiPageViewer";
import { HarumadiSettingsCover } from "@/features/tuti/components/HarumadiSettingsCover";
import { HarumadiDeleteSection } from "@/features/tuti/components/HarumadiDeleteSection";
import { HarumadiCloseTransition } from "@/features/tuti/components/HarumadiCloseTransition";
import { HarumadiOpenTransition } from "@/features/tuti/components/HarumadiOpenTransition";
import { HarumadiTogetherPanel } from "@/features/tuti/components/HarumadiTogetherPanel";
import { HarumadiComments } from "@/features/tuti/components/HarumadiComments";
import { HarumadiOrderEditor } from "@/features/tuti/components/HarumadiOrderEditor";
import { changeTogether } from "@/lib/harumadiTogether";
import { useLifecycleView } from "../hooks/useLifecycleView";
import { useNotificationPresence } from "../hooks/useNotificationPresence";
import { createHarumadi, deleteHarumadi, harumadiPath, updateHarumadi, reorderHarumadi } from "@/lib/harumadis";
import { orderByEntryIds } from "@/shared/harumadi/order";
import { authoritativeReadError, fetchHarumadiContent, type HarumadiRead } from "@/lib/harumadiContent";
import { canCacheHarumadi, harumadiReadCache } from "@/lib/harumadiReadCache";
import { fetchJournalEntries, fetchSensitiveJournalPolicy, createHarumadiPdf } from "@/lib/tutiApi";
import { exportHarumadiPdf } from "@/lib/harumadiPdfExport";
import { getSessionSnapshot } from "@/lib/auth/session";
import { HARUMADI_PDF_TITLE_LIMIT, type HarumadiPdfInput } from "@/shared/api/harumadiPdf";
import type { Harumadi, HarumadiSettings } from "@/shared/api/harumadi";
import type { HarumadiBookRect } from "@/shared/harumadi/transitionGeometry";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { HARUMADI_BACK_COVER_TEXT_LIMIT, LEGACY_HARUMADI_BACK_COVER_TEXT, isHarumadiBackCoverText, pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";

import { initialHarumadiMode, type HarumadiOpeningMode } from "../navigation/harumadiActions";
import { readerManagementActions } from "@/shared/harumadi/readerActions";
import { useCachedHarumadi } from "../hooks/useCachedHarumadi";

type ReaderOptions = { bookId?: string; initialMode?: HarumadiOpeningMode; openingOrigin?: HarumadiBookRect; onClose?: () => void };
export function HarumadiFlow({ bookId, initialMode, openingOrigin, onClose }: ReaderOptions = {}) {
  const session = useSession();
  const routeId = useSearchParams().get("harumadiId");
  const id = bookId ?? routeId;
  return session ? <HarumadiLoader key={`${session.userId}:${id ?? "new"}`} owner={session.userId} id={id} initialMode={initialMode} openingOrigin={openingOrigin} onClose={onClose} /> : <AppLoadingScreen />;
}
function HarumadiLoader({ owner, id, initialMode, openingOrigin, onClose }: { owner: string; id: string | null } & ReaderOptions) {
  const router = useRouter();
  const query = useQuery({ queryKey: ["harumadi-content", owner, id], queryFn: ({ signal }) => fetchHarumadiContent(owner, id!, signal),
    enabled: Boolean(id), retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.content.harumadi.shared ? 30_000 : false });
  useCachedHarumadi(owner, id);
  const current = Boolean(id && query.data && harumadiReadCache.current(owner, id, query.data.ticket));
  const verified = !id || Boolean((current || query.isFetching) && query.data && !query.data.cached && query.isFetchedAfterMount && !query.isPaused && !query.error);
  const readable = Boolean(query.data && current && !authoritativeReadError(query.error) && (canCacheHarumadi(query.data.content) || verified));
  if (id && !readable && (query.isPending || query.isFetching)) return <Frame>{onClose && <Header><Quiet onClick={onClose}><ArrowLeft size={18} />내 책장</Quiet></Header>}<AppLoadingScreen label="하루마디를 열고 있어요." /></Frame>;
  if (id && !readable) return <Frame><Header><Quiet onClick={onClose ?? (() => router.replace("/"))}><ArrowLeft size={18} />내 책장</Quiet></Header><Body $reading={false} role="alert"><h1>하루마디를 열지 못했어요.</h1><p>{query.error?.message ?? "연결을 확인하고 다시 열어주세요."}</p><PrimaryButton onClick={() => void query.refetch()}>다시 불러오기</PrimaryButton></Body></Frame>;
  return <HarumadiEditor key={id ?? "new"} owner={owner} initial={query.data?.content.harumadi} read={query.data}
    verified={verified} refreshing={query.isFetching} onRefresh={() => void query.refetch()} initialMode={initialMode} openingOrigin={openingOrigin} onClose={onClose} />;
}

function HarumadiEditor({ owner, initial, read, verified, refreshing, onRefresh, initialMode, openingOrigin, onClose }: {
  owner: string; initial?: Harumadi; read?: HarumadiRead; verified: boolean; refreshing: boolean; onRefresh: () => void;
} & ReaderOptions) {
  const router = useRouter(); const client = useQueryClient();
  const frame = useRef<HTMLElement>(null), contents = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [closeFromCover, setCloseFromCover] = useState(false);
  const [openingDone, setOpeningDone] = useState(false);
  const finishOpening = useCallback(() => setOpeningDone(true), []);
  const scroller = useRef<HTMLDivElement>(null);
  const [harumadi, setHarumadi] = useState(initial);
  const [settings, setSettings] = useState<HarumadiSettings>(initial ?? { title: "우리의 작은 하루", coverStyle: "white-plain" });
  const [mode, setMode] = useState<HarumadiOpeningMode | "selection" | "pdf" | "comments" | "order">(initial ? initialHarumadiMode(initial, initialMode) : "settings");
  const opening = Boolean(openingOrigin && !openingDone && mode === "pages");
  useLifecycleView("book_opened", "book", harumadi?.id, Boolean(harumadi && mode === "pages"));
  useNotificationPresence(harumadi?.id ?? null, false, Boolean(harumadi && verified));
  const [selected, setSelected] = useState(initial?.entryIds ?? []);
  const [orderedIds, setOrderedIds] = useState(initial?.entryIds ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; pageCount: number; approvalToken?: string } | null>(null);
  const readOnly = Boolean(harumadi && !verified);
  const addEntryId = useSearchParams().get("addEntryId");
  const handlePdf = useCallback((value: typeof pdf) => setPdf(value), []);
  const policyQuery = useQuery({ queryKey: ["journal-sensitive-policy"], queryFn: fetchSensitiveJournalPolicy, enabled: mode === "settings" || mode === "pdf" });
  const sensitivePolicy = policyQuery.data;
  const entries = useQuery({ queryKey: ["harumadi-entries", owner], queryFn: async () => {
    const values = await fetchJournalEntries();
    if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요.");
    return values;
  }, enabled: Boolean(harumadi) && (mode === "selection" || Boolean(addEntryId)), refetchOnWindowFocus: false });
  const isFirstMadi = read ? read.content.totalRecordCount === 0 : entries.isSuccess && entries.data.length === 0;
  const chosen = useMemo(() => orderByEntryIds((read?.content.entries ?? []).filter(entry => harumadi?.entryIds.includes(entry.id)), harumadi?.entryIds ?? []), [read, harumadi]);
  const finishClose = useCallback(() => { if (onClose) onClose(); else router.replace("/"); }, [onClose, router]);
  const closeToLibrary = useCallback(() => {
    if (busy || closingRef.current) return;
    closingRef.current = true;
    if (!harumadi) { finishClose(); return; }
    setCloseFromCover(mode === "pages" && frame.current?.querySelector("[data-harumadi-paged-reader]")?.getAttribute("data-current-page-kind") === "cover");
    setClosing(true);
  }, [busy, harumadi, mode, finishClose]);
  const titleNeedsConfirmation = Boolean(sensitivePolicy?.enabled && (!harumadi || settings.title.trim() !== harumadi.title ||
    (settings.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT).trim() !== (harumadi.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT)));
  const backCoverTextValid = settings.backCoverText === undefined || isHarumadiBackCoverText(settings.backCoverText);
  const refreshLibrary = useCallback(() => { void client.invalidateQueries({ queryKey: ["library-harumadis", owner] }); void client.invalidateQueries({ queryKey: ["harumadi-content", owner] }); client.removeQueries({ queryKey: ["library-cover", owner] }); }, [client, owner]);
  const savedEntry = useRef<string | null>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [mode]);
  useEffect(() => {
    if (!initial || !verified || mode !== "pages" || busy || closing || (initial.revision === harumadi?.revision && initial.updatedAt === harumadi?.updatedAt && initial.entryIds.join(",") === harumadi?.entryIds.join(","))) return;
    // 외부 조회 결과는 읽는 중에만 반영하며 작성 중인 설정·선택을 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHarumadi(initial); setSettings(initial);
  }, [initial, verified, mode, busy, closing, harumadi?.revision, harumadi?.updatedAt, harumadi?.entryIds]);

  async function saveSettings() {
    if (readOnly || busy || !settings.title.trim() || !backCoverTextValid || (titleNeedsConfirmation && !confirmed) || !sensitivePolicy) return;
    setBusy(true); setError("");
    try {
      const input = { ...settings, freeformNonSensitiveConfirmed: confirmed };
      const saved = harumadi ? await updateHarumadi(owner, harumadi.id, { ...input, revision: harumadi.revision, entryIds: harumadi.entryIds }) : await createHarumadi(owner, input);
      if (shouldNotifyDuplicateTitle(harumadi, saved)) showToast(DUPLICATE_HARUMADI_TITLE_NOTICE);
      refreshLibrary();
      if (!harumadi) { router.replace(harumadiPath(saved.id)); return; }
      if (onClose && initialMode === "settings") { onClose(); return; }
      setHarumadi(saved); setSettings(saved); setMode("pages");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "하루마디를 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  async function saveEntries() {
    if (!harumadi || readOnly || busy) return;
    setBusy(true); setError("");
    try {
      if (harumadi.shared) {
        const mine = chosen.filter(entry => entry.authorId === owner).map(entry => entry.id);
        for (const id of mine.filter(id => !selected.includes(id))) await changeTogether(owner, harumadi.id, "remove-entry", id);
        for (const id of selected.filter(id => !mine.includes(id))) await changeTogether(owner, harumadi.id, "add-entry", id, { sharingConfirmed: true });
        refreshLibrary(); setMode("pages"); return;
      }
      const saved = await updateHarumadi(owner, harumadi.id, { ...harumadi, revision: harumadi.revision, entryIds: selected });
      setHarumadi(saved); refreshLibrary(); setMode("pages");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "마디를 담지 못했어요."); }
    finally { setBusy(false); }
  }
  async function downloadPdf() {
    if (!pdf?.approvalToken || !harumadi || readOnly || busy) return;
    setBusy(true); setError("");
    try {
      await createHarumadiPdf(pdf.bytes, pdf.approvalToken);
      await exportHarumadiPdf(pdf.bytes, harumadi.title);
      void client.invalidateQueries({ queryKey: ["library-exports", owner] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "PDF를 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  async function saveOrder() {
    if (!harumadi || harumadi.role === "contributor" || readOnly || busy) return;
    setBusy(true); setError("");
    try {
      await client.cancelQueries({ queryKey: ["harumadi-content", owner, harumadi.id] });
      const saved = await reorderHarumadi(owner, harumadi.id, { revision: harumadi.revision, entryIds: orderedIds });
      setHarumadi(saved); setSettings(saved); setPdf(null); refreshLibrary(); setMode("pages");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "마디 순서를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!harumadi || readOnly || busy || !(await confirmAction("하루마디 틀을 삭제할까요? 이 작업은 되돌릴 수 없어요.\n담았던 원본 마디와 이미 저장한 PDF는 남아요.", {"title":"삭제 전 확인","confirmLabel":"삭제하기","tone":"danger"}))) return;
    setBusy(true); setError("");
    try { await deleteHarumadi(owner, harumadi.id); refreshLibrary(); if (onClose) onClose(); else router.replace("/"); }
    catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : "삭제하지 못했어요."); }
  }
  const pdfInput = useMemo<HarumadiPdfInput | null>(() => harumadi && chosen.length ? {
    title: harumadi.title, coverStyle: harumadi.coverStyle, backCoverText: harumadi.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT, letter: "", entryIds: chosen.map(entry => entry.id),
    ...(harumadi.shared ? { harumadiId: harumadi.id, harumadiRevision: harumadi.revision } : {}),
    coverEntryId: harumadi.coverStyle.endsWith("-image") ? chosen.find(entry => entry.image)?.id ?? null : null,
    freeformNonSensitiveConfirmed: confirmed,
  } : null, [harumadi, chosen, confirmed]);
  const selectRecords = () => { if (readOnly) return; setSelected(chosen.filter(entry => !harumadi?.shared || entry.authorId === owner).map(entry => entry.id)); setError(""); setMode("selection"); };
  const back = useCallback(() => { if (busy || closingRef.current) return; if (harumadi && mode !== "pages" && !(onClose && initialMode && initialMode !== "pages" && mode === initialMode)) { setMode("pages"); setSettings(harumadi); setError(""); } else closeToLibrary(); }, [busy, harumadi, mode, onClose, initialMode, closeToLibrary]);
  useEffect(() => {
    const handleBack = (event: Event) => { event.preventDefault(); back(); };
    window.addEventListener(ANDROID_BACK_EVENT, handleBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, handleBack);
  }, [back]);

  // 새로 쓴 기록은 별도 저장 단계에서 연결한다. 연결 실패를 기록 작성 실패로 바꾸지 않는다.
  const attachNewEntry = useCallback(async () => {
    if (!harumadi || readOnly || !addEntryId || savedEntry.current === addEntryId || !entries.data) return;
    if (!entries.data.some(entry => entry.id === addEntryId)) return;
    savedEntry.current = addEntryId;
    if (harumadi.entryIds.includes(addEntryId)) { router.replace(harumadiPath(harumadi.id)); return; }
    setBusy(true);
    try {
      if (harumadi.shared) {
        await changeTogether(owner, harumadi.id, "add-entry", addEntryId, { sharingConfirmed: true });
        refreshLibrary(); router.replace(harumadiPath(harumadi.id)); return;
      }
      const saved = await updateHarumadi(owner, harumadi.id, { ...harumadi, entryIds: [...harumadi.entryIds, addEntryId] });
      setHarumadi(saved); void client.invalidateQueries({ queryKey: ["library-harumadis", owner] }); void client.invalidateQueries({ queryKey: ["harumadi-content", owner] }); router.replace(harumadiPath(harumadi.id));
    } catch { setError("마디는 저장됐지만 하루마디에 담지 못했어요. ‘마디 골라 담기’로 다시 담아주세요."); }
    finally { setBusy(false); }
  }, [harumadi, readOnly, addEntryId, entries.data, owner, client, router, refreshLibrary]);
  // 사용자 저장 결과와 네트워크 조회 완료를 연결하는 외부 동기화다.
  useAttachNewEntry(attachNewEntry);

  return <Frame ref={frame} $openingSpread={opening && openingOrigin?.appearance === "spread"} data-harumadi-editor aria-busy={busy || closing}>
    <BookContents ref={contents} inert={closing || opening}>
    <Header $creating={!harumadi && mode === "settings"}><Quiet type="button" onClick={back} disabled={busy}><ArrowLeft size={18} />{mode === "pages" || !harumadi || (onClose && initialMode && initialMode !== "pages" && mode === initialMode) ? "내 책장" : "하루마디"}</Quiet>
      {harumadi && mode === "pages" && <HeaderTools>
        {harumadi.shared && <Quiet type="button" disabled={busy || readOnly} onClick={() => setMode("comments")}><MessageCircle size={17} aria-hidden="true" />댓글·답글</Quiet>}
        <ReaderMenu label="하루마디 관리" disabled={busy || readOnly} triggerContent={<><Settings2 size={17} aria-hidden="true" />관리</>}
          items={readerManagementActions(harumadi.role, chosen.length).map(({ action, label }) => ({ label, onSelect: () => {
            if (busy || readOnly) return;
            if (action === "selection") { selectRecords(); return; }
            setError(""); setConfirmed(false);
            if (action === "order") setOrderedIds(harumadi.entryIds);
            if (action === "pdf") setPdf(null);
            setMode(action);
          } }))} />
      </HeaderTools>}</Header>
    <Body ref={scroller} data-scroll-region={mode === "pages" ? undefined : ""} $reading={mode === "pages"} $creating={!harumadi && mode === "settings"}>
      {readOnly && <ReadNotice role="status">{refreshing ? "저장된 내용을 먼저 보여드리고 있어요." : "저장된 하루마디를 보고 있어요. 연결 후 최신 내용을 확인해주세요."}<Quiet type="button" disabled={refreshing} onClick={onRefresh}>최신 내용 확인</Quiet></ReadNotice>}
      {read?.cached && read.missingImages > 0 && <p className="hint">일부 사진은 연결 후 볼 수 있어요.</p>}
      {mode === "comments" && harumadi ? <HarumadiComments owner={owner} bookId={harumadi.id} onExit={finishClose} /> : mode === "together" && harumadi ? readOnly ? <p>연결 후 최신 내용을 확인하면 함께 채울 수 있어요.</p> : <HarumadiTogetherPanel owner={owner} bookId={harumadi.id} entries={chosen} onExit={finishClose} /> : mode === "settings" ? <SettingsPanel $creating={!harumadi}>
        <SettingsIntro $creating={!harumadi}>
        <h1>{harumadi ? "이름과 표지" : "어떤 하루를 담을까요?"}</h1>
        <p>{harumadi ? <>표지를 고르고,<br />기억하고 싶은 순간을 천천히 채워보세요.</> : "이름과 표지를 고르면 준비 끝이에요."}</p>
        </SettingsIntro>
        <CoverSetup $creating={!harumadi}>
          <CoverPreview title={settings.title} coverStyle={settings.coverStyle} entries={chosen} />
          <NameField $creating={!harumadi}>
            <Label htmlFor="harumadi-title">하루마디 이름</Label><TitleInput id="harumadi-title" value={settings.title} maxLength={HARUMADI_PDF_TITLE_LIMIT} onChange={event => { setSettings({ ...settings, title: event.target.value }); setConfirmed(false); }} />
            {!harumadi && <small>{settings.coverStyle.endsWith("-image") ? "마디를 담으면 첫 사진이 표지가 돼요." : "이름과 표지는 나중에도 바꿀 수 있어요."}</small>}
          </NameField>
        </CoverSetup>
        <Fieldset><legend>표지</legend><Choices>{(["white-plain", "green-plain", "white-image", "green-image"] as const).map((style, index) => <Choice key={style} type="button" aria-pressed={settings.coverStyle === style} $selected={settings.coverStyle === style} onClick={() => setSettings({ ...settings, coverStyle: style })}><Swatch $green={style.startsWith("green")} $photo={style.endsWith("image")} />{["흰색", "연두색", "흰색 · 사진", "연두색 · 사진"][index]}{settings.coverStyle === style && <Check size={12} />}</Choice>)}</Choices></Fieldset>
        {harumadi && <BackCoverField>
          <Label htmlFor="harumadi-back-cover">뒷표지 문구</Label>
          <BackCoverInput id="harumadi-back-cover" rows={3} maxLength={HARUMADI_BACK_COVER_TEXT_LIMIT}
            aria-invalid={!backCoverTextValid} aria-describedby="harumadi-back-cover-hint"
            value={settings.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT}
            onChange={event => { setSettings({ ...settings, backCoverText: event.target.value }); setConfirmed(false); }} />
          <BackCoverTools><small id="harumadi-back-cover-hint">120자·3줄까지, 비워두면 문구 없이 보여요.</small><Quiet type="button" disabled={busy || readOnly} onClick={() => { setSettings({ ...settings, backCoverText: pickHarumadiBackCoverText(settings.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT) }); setConfirmed(false); }}>다른 문구 보기</Quiet></BackCoverTools>
          {!backCoverTextValid && <ErrorMessage role="alert">뒷표지 문구는 120자·3줄 이내로 적어주세요.</ErrorMessage>}
        </BackCoverField>}
        {titleNeedsConfirmation && <Confirmation><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />이름과 뒷표지 문구에 건강·정치적 견해 등 민감정보가 없음을 확인해요.</Confirmation>}
        {harumadi && <HarumadiDeleteSection disabled={busy || readOnly} onDelete={() => void remove()} />}
      </SettingsPanel> : mode === "order" ? <HarumadiOrderEditor entries={chosen} ids={orderedIds} onChange={setOrderedIds} disabled={busy || readOnly} scrollRef={scroller} /> : mode === "selection" ? <>
        <h1>어떤 순간을 담을까요?</h1><p>원본 마디는 그대로 두고 이 하루마디에 담아요.</p>
        {entries.isPending ? <p role="status">마디를 불러오고 있어요.</p> : entries.isError ? <Quiet onClick={() => void entries.refetch()}>마디 다시 불러오기</Quiet> : !entries.data?.length ? <p>아직 남긴 마디가 없어요. 먼저 한 페이지를 써볼까요?</p> : <RecordList>{entries.data.map(entry => <RecordOption key={entry.id}><input type="checkbox" checked={selected.includes(entry.id)} disabled={busy || readOnly} onChange={() => setSelected(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id])} /><span><strong>{entry.title || entry.placeName || "남긴 하루"}</strong><small>{entry.visitedAt.slice(0, 10)} · {entry.content.slice(0, 45) || "사진으로 남긴 순간"}</small></span></RecordOption>)}</RecordList>}
      </> : mode === "pdf" ? <>
        <h1>PDF로 저장하기</h1><p>지금 담긴 마디로 PDF를 만들어요.<br />저장 후 하루마디를 바꿔도 이미 만든 PDF는 바뀌지 않아요.</p>
        {sensitivePolicy?.enabled && <Confirmation><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />이름과 뒷표지 문구에 민감정보가 없음을 확인해요.</Confirmation>}
        {pdfInput && !readOnly && sensitivePolicy && (!sensitivePolicy.enabled || confirmed) && <HarumadiPdfPreview key={`${harumadi!.revision}:${confirmed}`} ownerId={owner} input={pdfInput} onReady={handlePdf} />}
      </> : harumadi && <>
        <HarumadiPageViewer book={harumadi} entries={chosen} onClose={closeToLibrary} closing={closing} />
        <ReaderTools aria-label="하루마디 채우기">
          <WriteButton type="button" disabled={busy || readOnly} onClick={() => router.push(`/madi/new?from=library&harumadiId=${encodeURIComponent(harumadi.id)}`)}><PenLine size={17} aria-hidden="true" />{isFirstMadi ? "첫 마디 남기기" : "마디 남기기"}</WriteButton>
          {harumadi?.togetherEnabled && mode === "pages" && <TogetherEntry type="button" disabled={busy || readOnly} onClick={() => setMode("together")}><Users size={17} aria-hidden="true" />함께 채우기</TogetherEntry>}
        </ReaderTools>
      </>}
      {policyQuery.isError && <ErrorMessage role="alert">마디 보호 설정을 불러오지 못했어요.<Quiet onClick={() => void policyQuery.refetch()}>다시 불러오기</Quiet></ErrorMessage>}
      {error && <ErrorMessage role="alert">{error}<Quiet onClick={() => window.location.reload()}>다시 불러오기</Quiet></ErrorMessage>}
    </Body>
    {mode !== "pages" && mode !== "together" && mode !== "comments" && <Footer $creating={!harumadi && mode === "settings"}><PrimaryButton type="button" disabled={busy || readOnly || (mode === "settings" && (!settings.title.trim() || !backCoverTextValid || !sensitivePolicy || (titleNeedsConfirmation && !confirmed))) || (mode === "selection" && !entries.data) || (mode === "order" && orderedIds.join(",") === harumadi?.entryIds.join(",")) || (mode === "pdf" && (!pdf?.approvalToken || Boolean(sensitivePolicy?.enabled && !confirmed)))} onClick={() => void (mode === "settings" ? saveSettings() : mode === "selection" ? saveEntries() : mode === "order" ? saveOrder() : downloadPdf())}>{busy ? "저장하고 있어요." : mode === "settings" ? harumadi ? "설정 저장하기" : "빈 하루마디 만들기" : mode === "selection" ? `마디 ${selected.length}개 담기` : mode === "order" ? "이 순서로 저장하기" : "PDF 파일 저장하기"}</PrimaryButton></Footer>}
    </BookContents>
    {openingOrigin && !openingDone && mode === "pages" && !closing && harumadi && <HarumadiOpenTransition book={harumadi} entries={chosen} origin={openingOrigin} containerRef={frame} contentsRef={contents} onComplete={finishOpening} />}
    {closing && harumadi && <HarumadiCloseTransition book={harumadi} entries={chosen} containerRef={frame} contentsRef={contents} fadeOnly={closeFromCover} onComplete={finishClose} />}
  </Frame>;
}

function useAttachNewEntry(attach: () => Promise<void>) { useEffect(() => { void attach(); }, [attach]); }

const Frame = styled(ScreenFrame)<{ $openingSpread?: boolean }>`position: relative; inset: auto; height: 100%; padding: 0; background: ${({ $openingSpread }) => $openingSpread ? "transparent" : "var(--color-surface)"}; color: var(--color-text);`;
const BookContents = styled.div`height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--color-surface);`;
const HeaderTools = styled.div`display: flex; align-items: center; gap: 12px; min-width: 0; > span { flex: none; width: auto; }`;
const ReaderMenu = styled(ContextMenu)`> button { display: inline-flex; align-items: center; gap: 6px; min-height: var(--ui-control-height); padding: 8px 0 8px 8px; font-size: var(--ui-body-size); color: var(--color-text-muted); &:disabled { opacity: .5; } }`;
const TogetherEntry = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--ui-action-height); min-width: 0; padding: 10px 12px; border-radius: 999px; background: var(--color-secondary-200); color: var(--color-secondary-1000); font-size: var(--ui-body-size); font-weight: 600; &:disabled { opacity: .5; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }`;
const Header = styled.header<{ $creating?: boolean }>`flex: none; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: calc(12px + var(--app-safe-area-top, 0px)) var(--screen-padding-right) 0 var(--screen-padding-left); min-height: 50px;
  ${({ $creating }) => $creating && `@container app-viewport (max-height: 719px) { padding-top: calc(6px + var(--app-safe-area-top, 0px)); min-height: 44px; }`}
`;
const Quiet = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--ui-control-height); padding: 6px 0; background: transparent; color: var(--color-text-muted); font-size: var(--ui-body-size); &:disabled { opacity: .5; } &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; }`;
const Body = styled.div<{ $reading: boolean; $creating?: boolean }>`flex: 1; min-height: 0; overflow-y: ${({ $reading }) => $reading ? "hidden" : "auto"}; padding: ${({ $reading, $creating }) => $reading ? "24px calc(var(--reader-outside-inset) + var(--app-safe-area-right, 0px)) calc(20px + var(--app-safe-area-bottom, 0px)) calc(var(--reader-outside-inset) + var(--app-safe-area-left, 0px))" : $creating ? "22px var(--screen-padding-right) 20px var(--screen-padding-left)" : "22px var(--screen-padding-right) 28px var(--screen-padding-left)"}; ${({ $reading }) => $reading && "display: flex; flex-direction: column;"} overscroll-behavior: contain; &:has([data-order-editor]) { overflow-anchor: none; } h1 { ${screenTitleStyles} margin: 8px 0 12px; } > p { ${bodyCopyStyles} color: var(--color-text-muted); white-space: pre-line; } .hint { ${captionStyles} }
  ${({ $reading }) => $reading && `
    --reader-outside-inset: 36px;
    @container app-viewport (max-width: 340px) { --reader-outside-inset: 28px; }
  `}
  ${({ $creating }) => $creating && `@container app-viewport (max-height: 719px) { padding: 10px var(--screen-padding-right) 12px var(--screen-padding-left); }`}
`;
const ReadNotice = styled.div`display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; padding: 10px 12px; border-radius: 10px; background: var(--color-brand-100); color: var(--color-text-muted); font-size: 13px; line-height: 1.7;`;
const CoverPreview = styled(HarumadiSettingsCover)`width: 126px; min-width: 0; margin: 24px auto 28px; border-radius: 2px 5px 5px 2px; box-shadow: 3px 3px 0 #dce3d6, 5px 12px 18px #1b222a12; > span { border-radius: inherit; overflow: hidden; }`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 600; margin-bottom: 9px;`;
const TitleInput = styled.input`${inputControlStyles}`;
const BackCoverField = styled.div`margin-top: 24px;`;
const BackCoverInput = styled.textarea`${inputControlStyles} resize: vertical; min-height: 96px;`;
const BackCoverTools = styled.div`display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; small { font-size: 12px; color: var(--color-text-muted); } button { font-size: 13px; }`;
const Fieldset = styled.fieldset`border: 0; padding: 0; margin: 24px 0; legend { font-size: 14px; font-weight: 600; margin-bottom: 12px; }`;
const Choices = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`;
const Choice = styled(BaseButton)<{ $selected: boolean }>`display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 10px; font-size: 13px; background: white; border-radius: 10px; border: 1px solid ${({ $selected }) => $selected ? "var(--color-brand-700)" : "var(--color-border)"}; color: inherit;`;
const Swatch = styled.span<{ $green: boolean; $photo: boolean }>`width: 16px; height: 22px; flex: none; border: 1px solid #d1d9c9; border-radius: 1px; background: ${({ $green }) => $green ? "#EBF5D5" : "#fff"}; ${({ $photo }) => $photo && "box-shadow: inset 0 -11px #d9e6ed;"}`;
const Confirmation = styled.label`display: flex; gap: 9px; align-items: flex-start; margin: 18px 0; font-size: 13px; line-height: 1.7; input { margin-top: 3px; flex: none; }`;
const SettingsPanel = styled.div<{ $creating: boolean }>`
  display: ${({ $creating }) => $creating ? "flex" : "contents"};
  > p { font-size: 14px; line-height: 1.8; color: var(--color-text-muted); white-space: pre-line; }
  ${({ $creating }) => $creating && `
    flex-direction: column; gap: 18px; min-height: 100%; justify-content: space-between;
    --create-cover-width: clamp(104px, calc(20cqh - 40px), 132px);
    > fieldset { margin: 0; min-width: 0; }
    > fieldset legend { margin-bottom: 8px; font-size: 14px; }
    > label { margin: 0; font-size: 13px; line-height: 1.7; }
    @container app-viewport (max-height: 719px) {
      min-height: 0; justify-content: flex-start; gap: 12px;
      --create-cover-width: clamp(76px, 14cqh, 112px);
      > label { font-size: 12px; }
    }
    @container app-viewport (max-height: 620px) { gap: 10px; }
    @container app-viewport (max-height: 719px) and (max-width: 340px) { --create-cover-width: 76px; }
  `}
`;
const SettingsIntro = styled.div<{ $creating: boolean }>`
  display: ${({ $creating }) => $creating ? "block" : "contents"};
  > p { font-size: 14px; line-height: 1.8; color: var(--color-text-muted); white-space: pre-line; }
  ${({ $creating }) => $creating && `
    > h1 { ${sectionHeadingStyles} }
    > p { margin: 8px 0 0; line-height: 1.6; }
    @container app-viewport (max-height: 719px) { > h1 { font-size: 22px; } > p { margin-top: 4px; } }
    @container app-viewport (max-height: 620px) { > h1 { font-size: 21px; } }
  `}
`;
const CoverSetup = styled.div<{ $creating: boolean }>`
  display: ${({ $creating }) => $creating ? "grid" : "contents"};
  ${({ $creating }) => $creating && `
    grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: center;
    > div:first-of-type { width: var(--create-cover-width); min-width: 0; margin: 0 auto; }
    @container app-viewport (max-height: 719px) {
      grid-template-columns: var(--create-cover-width) minmax(0, 1fr); gap: 20px;
      > div:first-of-type { margin: 0; }
    }
    @container app-viewport (max-height: 719px) and (max-width: 340px) { gap: 16px; }
  `}
`;
const NameField = styled.div<{ $creating: boolean }>`
  display: ${({ $creating }) => $creating ? "block" : "contents"};
  min-width: 0;
  > small { display: block; margin-top: 8px; font-size: 12px; line-height: 1.7; color: var(--color-text-muted); }
`;
const Footer = styled.footer<{ $creating?: boolean }>`flex: none; padding: 12px var(--screen-padding-right) calc(16px + var(--app-safe-area-bottom, 0px)) var(--screen-padding-left); border-top: 1px solid var(--color-border); background: var(--color-surface); > button { width: 100%; }
  ${({ $creating }) => $creating && `@container app-viewport (max-height: 719px) { padding: 8px var(--screen-padding-right) calc(12px + var(--app-safe-area-bottom, 0px)) var(--screen-padding-left); }`}
`;
const ReaderTools = styled.nav`display: flex; flex: none; flex-wrap: wrap; gap: 10px; padding-top: 12px; > button { flex: 1 1 auto; min-width: 0; } svg { flex: none; }`;
const WriteButton = styled(PrimaryButton)`display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding-inline: 12px;`;
const RecordList = styled.div`display: grid; gap: 10px; margin: 22px 0;`;
const RecordOption = styled.label`display: flex; gap: 12px; align-items: center; padding: 16px 12px; border: 1px solid var(--color-border); border-radius: 10px; background: white; > span { min-width: 0; display: grid; gap: 6px; } strong { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; } small { font-size: 12px; color: var(--color-text-muted); }`;
const ErrorMessage = styled.div`padding: 12px; font-size: 14px; line-height: 1.7; color: #b42318; background: white; border-radius: 8px; margin-top: 12px; > button { display: block; }`;
