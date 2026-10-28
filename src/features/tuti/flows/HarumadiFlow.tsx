"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "@emotion/styled";
import { ArrowLeft, Check, Download, PenLine, Plus, Settings2, Trash2 } from "lucide-react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { HarumadiPdfPreview } from "@/features/tuti/components/HarumadiPdfPreview";
import { HarumadiPageViewer } from "@/features/tuti/components/HarumadiPageViewer";
import { createHarumadi, deleteHarumadi, harumadiPath, updateHarumadi } from "@/lib/harumadis";
import { authoritativeReadError, fetchHarumadiContent, loadCachedHarumadi, type HarumadiRead } from "@/lib/harumadiContent";
import { canCacheHarumadi, harumadiReadCache } from "@/lib/harumadiReadCache";
import { fetchJournalEntries, fetchSensitiveJournalPolicy, createHarumadiPdf } from "@/lib/tutiApi";
import { exportHarumadiPdf } from "@/lib/harumadiPdfExport";
import { getSessionSnapshot } from "@/lib/auth/session";
import { HARUMADI_PDF_MAX_ENTRIES, HARUMADI_PDF_TITLE_LIMIT, type HarumadiPdfInput } from "@/shared/api/harumadiPdf";
import type { Harumadi, HarumadiSettings } from "@/shared/api/harumadi";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { HARUMADI_BACK_COVER_TEXT_LIMIT, LEGACY_HARUMADI_BACK_COVER_TEXT, isHarumadiBackCoverText, pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";

type ReaderOptions = { bookId?: string; initialMode?: "pages" | "settings"; onClose?: () => void };
export function HarumadiFlow({ bookId, initialMode, onClose }: ReaderOptions = {}) {
  const session = useSession();
  const routeId = useSearchParams().get("harumadiId");
  const id = bookId ?? routeId;
  return session ? <HarumadiLoader key={`${session.userId}:${id ?? "new"}`} owner={session.userId} id={id} initialMode={initialMode} onClose={onClose} /> : <AppLoadingScreen />;
}
function HarumadiLoader({ owner, id, initialMode, onClose }: { owner: string; id: string | null } & ReaderOptions) {
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["harumadi-content", owner, id], queryFn: ({ signal }) => fetchHarumadiContent(owner, id!, signal),
    enabled: Boolean(id), retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false });
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadCachedHarumadi(owner, id).then(cached => {
      const key = ["harumadi-content", owner, id];
      if (active && cached && !client.getQueryData(key) && !authoritativeReadError(client.getQueryState(key)?.error)) {
        client.setQueryData(key, cached, { updatedAt: cached.savedAt });
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [owner, id, client]);
  const current = Boolean(id && query.data && harumadiReadCache.current(owner, id, query.data.ticket));
  const verified = !id || Boolean(current && query.data && !query.data.cached && query.isFetchedAfterMount && !query.isFetching && !query.isPaused && !query.error);
  const readable = Boolean(query.data && current && !authoritativeReadError(query.error) && (canCacheHarumadi(query.data.content) || verified));
  if (id && !readable && (query.isPending || query.isFetching)) return <Frame>{onClose && <Header><Quiet onClick={onClose}><ArrowLeft size={18} />내 책장</Quiet></Header>}<AppLoadingScreen label="하루마디를 열고 있어요." /></Frame>;
  if (id && !readable) return <Frame><Header><Quiet onClick={onClose ?? (() => router.replace("/"))}><ArrowLeft size={18} />내 책장</Quiet></Header><Body $reading={false} role="alert"><h1>하루마디를 열지 못했어요.</h1><p>{query.error?.message ?? "연결을 확인하고 다시 열어주세요."}</p><PrimaryButton onClick={() => void query.refetch()}>다시 불러오기</PrimaryButton></Body></Frame>;
  return <HarumadiEditor key={id ?? "new"} owner={owner} initial={query.data?.content.harumadi} read={query.data}
    verified={verified} refreshing={query.isFetching} onRefresh={() => void query.refetch()} initialMode={initialMode} onClose={onClose} />;
}

function HarumadiEditor({ owner, initial, read, verified, refreshing, onRefresh, initialMode, onClose }: {
  owner: string; initial?: Harumadi; read?: HarumadiRead; verified: boolean; refreshing: boolean; onRefresh: () => void;
} & ReaderOptions) {
  const router = useRouter(); const client = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [harumadi, setHarumadi] = useState(initial);
  const [settings, setSettings] = useState<HarumadiSettings>(initial ?? { title: "우리의 작은 하루", coverStyle: "white-plain" });
  const [mode, setMode] = useState<"settings" | "pages" | "selection" | "pdf">(initial ? initialMode ?? "pages" : "settings");
  const [selected, setSelected] = useState(initial?.entryIds ?? []);
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
  const chosen = useMemo(() => (read?.content.entries ?? []).filter(entry => harumadi?.entryIds.includes(entry.id)).sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id)), [read, harumadi]);
  const titleNeedsConfirmation = Boolean(sensitivePolicy?.enabled && (!harumadi || settings.title.trim() !== harumadi.title ||
    (settings.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT).trim() !== (harumadi.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT)));
  const backCoverTextValid = settings.backCoverText === undefined || isHarumadiBackCoverText(settings.backCoverText);
  const refreshLibrary = () => { void client.invalidateQueries({ queryKey: ["library-harumadis", owner] }); void client.invalidateQueries({ queryKey: ["harumadi-content", owner] }); client.removeQueries({ queryKey: ["library-cover", owner] }); };
  const savedEntry = useRef<string | null>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [mode]);
  useEffect(() => {
    if (!initial || !verified || mode !== "pages" || busy || (initial.revision === harumadi?.revision && initial.updatedAt === harumadi?.updatedAt && initial.entryIds.join(",") === harumadi?.entryIds.join(","))) return;
    // 외부 조회 결과는 읽는 중에만 반영하며 작성 중인 설정·선택을 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHarumadi(initial); setSettings(initial);
  }, [initial, verified, mode, busy, harumadi?.revision, harumadi?.updatedAt, harumadi?.entryIds]);

  async function saveSettings() {
    if (readOnly || busy || !settings.title.trim() || !backCoverTextValid || (titleNeedsConfirmation && !confirmed) || !sensitivePolicy) return;
    setBusy(true); setError("");
    try {
      const input = { ...settings, freeformNonSensitiveConfirmed: confirmed };
      const saved = harumadi ? await updateHarumadi(owner, harumadi.id, { ...input, revision: harumadi.revision, entryIds: harumadi.entryIds }) : await createHarumadi(owner, input);
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
  async function remove() {
    if (!harumadi || readOnly || busy || !window.confirm("하루마디 틀을 삭제할까요? 담았던 원본 마디와 이미 저장한 PDF는 남아요.")) return;
    setBusy(true); setError("");
    try { await deleteHarumadi(owner, harumadi.id); refreshLibrary(); if (onClose) onClose(); else router.replace("/"); }
    catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : "삭제하지 못했어요."); }
  }
  const pdfInput = useMemo<HarumadiPdfInput | null>(() => harumadi && chosen.length ? {
    title: harumadi.title, coverStyle: harumadi.coverStyle, backCoverText: harumadi.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT, letter: "", entryIds: chosen.map(entry => entry.id),
    coverEntryId: harumadi.coverStyle.endsWith("-image") ? chosen.find(entry => entry.image)?.id ?? null : null,
    freeformNonSensitiveConfirmed: confirmed,
  } : null, [harumadi, chosen, confirmed]);
  const selectRecords = () => { if (readOnly) return; setSelected(chosen.map(entry => entry.id)); setError(""); setMode("selection"); };
  const back = useCallback(() => { if (busy) return; if (harumadi && mode !== "pages" && !(onClose && initialMode === "settings" && mode === "settings")) { setMode("pages"); setSettings(harumadi); setError(""); } else if (onClose) onClose(); else router.replace("/"); }, [busy, harumadi, mode, router, onClose, initialMode]);
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
      const saved = await updateHarumadi(owner, harumadi.id, { ...harumadi, entryIds: [...harumadi.entryIds, addEntryId] });
      setHarumadi(saved); void client.invalidateQueries({ queryKey: ["library-harumadis", owner] }); void client.invalidateQueries({ queryKey: ["harumadi-content", owner] }); router.replace(harumadiPath(harumadi.id));
    } catch { setError("마디는 저장됐지만 하루마디에 담지 못했어요. ‘마디 골라 담기’로 다시 담아주세요."); }
    finally { setBusy(false); }
  }, [harumadi, readOnly, addEntryId, entries.data, owner, client, router]);
  // 사용자 저장 결과와 네트워크 조회 완료를 연결하는 외부 동기화다.
  useAttachNewEntry(attachNewEntry);

  return <Frame data-harumadi-editor>
    <Header><Quiet type="button" onClick={back} disabled={busy}><ArrowLeft size={18} />{mode === "pages" || !harumadi || (onClose && initialMode === "settings" && mode === "settings") ? "내 책장" : "하루마디"}</Quiet>
      {harumadi && mode === "pages" && <Quiet type="button" disabled={readOnly} onClick={() => { setConfirmed(false); setMode("settings"); }}><Settings2 size={17} />설정</Quiet>}</Header>
    <Body ref={scroller} data-scroll-region={mode === "pages" ? undefined : ""} $reading={mode === "pages"}>
      {readOnly && <ReadNotice role="status">{refreshing ? "저장된 내용을 먼저 보여드리고 있어요." : "저장된 하루마디를 보고 있어요. 연결 후 최신 내용을 확인해주세요."}<Quiet type="button" disabled={refreshing} onClick={onRefresh}>최신 내용 확인</Quiet></ReadNotice>}
      {read?.cached && read.missingImages > 0 && <p className="hint">일부 사진은 연결 후 볼 수 있어요.</p>}
      {mode === "settings" ? <>
        <Eyebrow>{harumadi ? "하루마디 설정" : "새 하루마디"}</Eyebrow><h1>{harumadi ? "이름과 표지" : "어떤 하루를 담을까요?"}</h1>
        <p>표지를 고르고,<br />기억하고 싶은 순간을 천천히 채워보세요.</p>
        <CoverPreview $green={settings.coverStyle.startsWith("green")}><small>Tuti / 하루마디</small><strong>{settings.title || "하루마디 제목"}</strong>{settings.coverStyle.endsWith("-image") && <PhotoPlaceholder>마디를 담으면 첫 사진이 표지가 돼요.</PhotoPlaceholder>}<span>아직 쓰지 않은, 우리 이야기</span></CoverPreview>
        <Label htmlFor="harumadi-title">하루마디 이름</Label><TitleInput id="harumadi-title" value={settings.title} maxLength={HARUMADI_PDF_TITLE_LIMIT} onChange={event => { setSettings({ ...settings, title: event.target.value }); setConfirmed(false); }} />
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
        <p className="hint">마디가 없어도 만들 수 있어요. 이름과 표지는 나중에도 바꿀 수 있어요.</p>
        {titleNeedsConfirmation && <Confirmation><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />이름과 뒷표지 문구에 건강·정치적 견해 등 민감정보가 없음을 확인해요.</Confirmation>}
        {harumadi && <Quiet type="button" onClick={() => void remove()} disabled={busy || readOnly}><Trash2 size={15} />하루마디 틀 삭제</Quiet>}
      </> : mode === "selection" ? <>
        <Eyebrow>마디 채우기</Eyebrow><h1>어떤 순간을 담을까요?</h1><p>원본 마디는 그대로 두고 이 하루마디에 담아요.<br />한 권에 최대 {HARUMADI_PDF_MAX_ENTRIES}개까지 담을 수 있어요.</p>
        {entries.isPending ? <p role="status">마디를 불러오고 있어요.</p> : entries.isError ? <Quiet onClick={() => void entries.refetch()}>마디 다시 불러오기</Quiet> : !entries.data?.length ? <p>아직 남긴 마디가 없어요. 먼저 한 페이지를 써볼까요?</p> : <RecordList>{entries.data.map(entry => <RecordOption key={entry.id}><input type="checkbox" checked={selected.includes(entry.id)} disabled={busy || readOnly || (!selected.includes(entry.id) && selected.length >= HARUMADI_PDF_MAX_ENTRIES)} onChange={() => setSelected(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id])} /><span><strong>{entry.title || entry.placeName || "남긴 하루"}</strong><small>{entry.visitedAt.slice(0, 10)} · {entry.content.slice(0, 45) || "사진으로 남긴 순간"}</small></span></RecordOption>)}</RecordList>}
      </> : mode === "pdf" ? <>
        <Eyebrow>별도 파일로 소장하기</Eyebrow><h1>PDF로 저장하기</h1><p>지금 담긴 마디로 PDF를 만들어요.<br />저장 후 하루마디를 바꿔도 이미 만든 PDF는 바뀌지 않아요.</p>
        {sensitivePolicy?.enabled && <Confirmation><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />이름과 뒷표지 문구에 민감정보가 없음을 확인해요.</Confirmation>}
        {pdfInput && !readOnly && sensitivePolicy && (!sensitivePolicy.enabled || confirmed) && <HarumadiPdfPreview key={`${harumadi!.revision}:${confirmed}`} ownerId={owner} input={pdfInput} onReady={handlePdf} />}
      </> : harumadi && <>
        <HarumadiPageViewer book={harumadi} entries={chosen} />
        <ReaderTools aria-label="하루마디 채우기와 저장">
          <Quiet type="button" disabled={busy || readOnly || chosen.length >= HARUMADI_PDF_MAX_ENTRIES} onClick={() => router.push(`/madi/new?from=library&harumadiId=${encodeURIComponent(harumadi.id)}`)}><PenLine size={15} />{isFirstMadi ? "첫 마디 남기기" : "마디 남기기"}</Quiet>
          <Quiet type="button" onClick={selectRecords} disabled={busy || readOnly}><Plus size={15} />골라 담기</Quiet>
          <Quiet type="button" disabled={!chosen.length || readOnly || busy} onClick={() => { setConfirmed(false); setPdf(null); setMode("pdf"); }}><Download size={15} />PDF 저장</Quiet>
        </ReaderTools>
      </>}
      {policyQuery.isError && <ErrorMessage role="alert">마디 보호 설정을 불러오지 못했어요.<Quiet onClick={() => void policyQuery.refetch()}>다시 불러오기</Quiet></ErrorMessage>}
      {error && <ErrorMessage role="alert">{error}<Quiet onClick={() => window.location.reload()}>다시 불러오기</Quiet></ErrorMessage>}
    </Body>
    {mode !== "pages" && <Footer><PrimaryButton type="button" disabled={busy || readOnly || (mode === "settings" && (!settings.title.trim() || !backCoverTextValid || !sensitivePolicy || (titleNeedsConfirmation && !confirmed))) || (mode === "selection" && !entries.data) || (mode === "pdf" && (!pdf?.approvalToken || Boolean(sensitivePolicy?.enabled && !confirmed)))} onClick={() => void (mode === "settings" ? saveSettings() : mode === "selection" ? saveEntries() : downloadPdf())}>{busy ? "저장하고 있어요." : mode === "settings" ? harumadi ? "설정 저장하기" : "빈 하루마디 만들기" : mode === "selection" ? `마디 ${selected.length}개 담기` : "PDF 파일 저장하기"}</PrimaryButton></Footer>}
  </Frame>;
}

function useAttachNewEntry(attach: () => Promise<void>) { useEffect(() => { void attach(); }, [attach]); }

const Frame = styled.section`height: 100%; min-height: 0; display: flex; flex-direction: column; background: #F8FAFC; color: var(--color-text);`;
const Header = styled.header`flex: none; display: flex; justify-content: space-between; align-items: center; padding: calc(12px + var(--app-safe-area-top, 0px)) 22px 0; min-height: 50px;`;
const Quiet = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 6px 0; background: transparent; color: var(--color-text-muted); font-size: 14px; &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; }`;
const Body = styled.div<{ $reading: boolean }>`flex: 1; min-height: 0; overflow-y: ${({ $reading }) => $reading ? "hidden" : "auto"}; padding: ${({ $reading }) => $reading ? "16px 24px calc(12px + var(--app-safe-area-bottom, 0px))" : "22px 24px 28px"}; ${({ $reading }) => $reading && "display: flex; flex-direction: column;"} overscroll-behavior: contain; h1 { font-size: 25px; line-height: 1.4; font-weight: 600; letter-spacing: -0.04em; margin: 8px 0 12px; overflow-wrap: anywhere; } > p { font-size: 14px; line-height: 1.8; color: var(--color-text-muted); white-space: pre-line; } .hint { font-size: 13px; }`;
const Eyebrow = styled.span`font-size: 13px; color: var(--color-text-muted);`;
const ReadNotice = styled.div`display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; padding: 10px 12px; border-radius: 10px; background: var(--color-brand-100); color: var(--color-text-muted); font-size: 13px; line-height: 1.7;`;
const CoverPreview = styled.div<{ $green: boolean }>`width: 126px; aspect-ratio: 148 / 210; margin: 24px auto 28px; padding: 16px; border-radius: 2px 5px 5px 2px; background: ${({ $green }) => $green ? "#EBF5D5" : "#fff"}; box-shadow: 3px 3px 0 #dce3d6, 5px 12px 18px #1b222a12; display: flex; flex-direction: column; justify-content: space-between; border-left: 3px solid #1b222a0c; small { font-size: 9px; } strong { font-size: 15px; line-height: 1.6; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; } > span { font-size: 9px; }`;
const PhotoPlaceholder = styled.div`padding: 10px 5px; font-size: 9px; line-height: 1.7; background: #d9e6ed; text-align: center;`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 600; margin-bottom: 9px;`;
const TitleInput = styled.input`width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 10px; background: white; font: inherit; font-size: 16px; color: inherit;`;
const BackCoverField = styled.div`margin-top: 24px;`;
const BackCoverInput = styled.textarea`width: 100%; resize: vertical; min-height: 96px; padding: 12px; border: 1px solid var(--color-border); border-radius: 10px; background: white; font: inherit; font-size: 16px; line-height: 1.7; color: inherit; &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }`;
const BackCoverTools = styled.div`display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; small { font-size: 12px; color: var(--color-text-muted); } button { font-size: 13px; }`;
const Fieldset = styled.fieldset`border: 0; padding: 0; margin: 24px 0; legend { font-size: 14px; font-weight: 600; margin-bottom: 12px; }`;
const Choices = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`;
const Choice = styled(BaseButton)<{ $selected: boolean }>`display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 10px; font-size: 13px; background: white; border-radius: 10px; border: 1px solid ${({ $selected }) => $selected ? "var(--color-brand-700)" : "var(--color-border)"}; color: inherit;`;
const Swatch = styled.span<{ $green: boolean; $photo: boolean }>`width: 16px; height: 22px; flex: none; border: 1px solid #d1d9c9; border-radius: 1px; background: ${({ $green }) => $green ? "#EBF5D5" : "#fff"}; ${({ $photo }) => $photo && "box-shadow: inset 0 -11px #d9e6ed;"}`;
const Confirmation = styled.label`display: flex; gap: 9px; align-items: flex-start; margin: 18px 0; font-size: 13px; line-height: 1.7; input { margin-top: 3px; flex: none; }`;
const Footer = styled.footer`flex: none; padding: 12px 24px calc(16px + var(--app-safe-area-bottom, 0px)); border-top: 1px solid var(--color-border); background: #F8FAFC; > button { width: 100%; }`;
const ReaderTools = styled.nav`display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--color-border); padding-top: 6px; margin-top: 4px; > button { min-height: 44px; font-size: 13px; }`;
const RecordList = styled.div`display: grid; gap: 10px; margin: 22px 0;`;
const RecordOption = styled.label`display: flex; gap: 12px; align-items: center; padding: 16px 12px; border: 1px solid var(--color-border); border-radius: 10px; background: white; > span { min-width: 0; display: grid; gap: 6px; } strong { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; } small { font-size: 12px; color: var(--color-text-muted); }`;
const ErrorMessage = styled.div`padding: 12px; font-size: 14px; line-height: 1.7; color: #b42318; background: white; border-radius: 8px; margin-top: 12px; > button { display: block; }`;
