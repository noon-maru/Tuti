"use client";

import styled from "@emotion/styled";
import Image from "next/image";
import { Camera, ImagePlus, Check, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton, Button, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ImageCropDialog } from "@/features/tuti/components/ImageCropDialog";
import { readImageMetadata } from "@/features/tuti/lib/readImageMetadata";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { getKoreanDateKey } from "@/lib/date/koreanDate";
import { FIRST_JOURNAL_CONTENT_LIMIT, FIRST_JOURNAL_PLACE_LIMIT, prepareFirstJournalDraft } from "@/shared/api/firstJournal";
import type { JournalEntryInput, TutiJournalEntry } from "@/shared/api/journal";
import { fetchSensitiveJournalPolicy } from "@/lib/tutiApi";
import { canStoreSensitiveJournal, canSubmitJournalClassification, sensitiveJournalConsentNotice, type SensitiveJournalPolicyResponse } from "@/shared/legal/sensitiveJournalPolicy";

type Stage = "photo" | "write" | "preview";

export function FirstMemoryScreen({ onBack, onSave, onCollection, onSaved }: {
  onBack: () => void;
  onSave: (input: JournalEntryInput) => Promise<TutiJournalEntry>;
  onCollection: () => void;
  onSaved: (entry: TutiJournalEntry) => void;
}) {
  const [stage, setStage] = useState<Stage>("photo");
  const [image, setImage] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [date, setDate] = useState(getKoreanDateKey);
  const [place, setPlace] = useState("");
  const [saved, setSaved] = useState<TutiJournalEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sensitivePolicy, setSensitivePolicy] = useState<SensitiveJournalPolicyResponse | null>(null);
  const [sensitiveContent, setSensitiveContent] = useState<boolean | null>(null);
  const [sensitiveAgreed, setSensitiveAgreed] = useState(false);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [policyFailed, setPolicyFailed] = useState(false);
  const savingRef = useRef(false);
  const dateEdited = useRef(false);
  const selection = useRef(0);
  const photoMetadata = useRef<ReturnType<typeof readImageMetadata> | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const today = getKoreanDateKey();
  const draft = prepareFirstJournalDraft({ image, content, date, place }, today);
  const sensitiveReady = canSubmitJournalClassification(sensitivePolicy, sensitiveContent, sensitiveAgreed);
  const privateStorageAvailable = sensitivePolicy && canStoreSensitiveJournal(sensitivePolicy);

  useEffect(() => {
    let active = true;
    void fetchSensitiveJournalPolicy().then(policy => {
      if (active) { setSensitivePolicy(policy); setPolicyFailed(false); }
    }).catch(() => { if (active) setPolicyFailed(true); });
    return () => { active = false; };
  }, [policyAttempt]);

  useEffect(() => () => { if (cropSource) URL.revokeObjectURL(cropSource); }, [cropSource]);
  useEffect(() => () => { selection.current += 1; }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [stage, saved]);

  const cancelCrop = useCallback(() => {
    selection.current += 1;
    photoMetadata.current = null;
    setCropSource(null);
  }, []);
  const back = useCallback(() => {
    if (cropSource) { cancelCrop(); return; }
    if (savingRef.current) return;
    if (saved) { onCollection(); return; }
    if (stage === "preview") setStage("write");
    else if (stage === "write") setStage("photo");
    else onBack();
  }, [cancelCrop, cropSource, onBack, onCollection, saved, stage]);
  useEffect(() => {
    const onAndroidBack = (event: Event) => {
      event.preventDefault();
      back();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onAndroidBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onAndroidBack);
  }, [back]);

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    selection.current += 1;
    setCropSource(URL.createObjectURL(file));
    // 첫 기록에서 GPS는 읽지 않는다. 촬영일만 선택적으로 가져온다.
    photoMetadata.current = readImageMetadata(file);
  };

  const confirmCrop = (photo: string) => {
    const id = selection.current;
    setImage(photo); setCropSource(null); setStage("write");
    // A canceled selection must never change the date of the retained photo.
    void photoMetadata.current?.then((metadata) => {
      if (id === selection.current && !dateEdited.current && metadata.captureDate && metadata.captureDate <= today) setDate(metadata.captureDate);
    }).catch(() => { /* Optional EXIF must not block writing. */ });
  };

  const save = async () => {
    if (!draft || !sensitiveReady || !sensitivePolicy || sensitiveContent === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError("");
    try {
      const entry = await onSave({ ...draft, sensitiveContent,
        ...(sensitiveContent && sensitiveAgreed ? { sensitiveConsentVersion: sensitivePolicy.version } : {}) });
      setSaved(entry);
      onSaved(entry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "첫 페이지를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const startAnother = () => {
    selection.current += 1;
    setSaved(null); setImage(null); setContent(""); setDate(getKoreanDateKey()); setPlace(""); setError("");
    dateEdited.current = false;
    setSensitiveContent(null); setSensitiveAgreed(false);
    setStage("photo");
  };

  return <Frame aria-labelledby="first-memory-heading">
    <Header>
      <BackButton aria-label={saved ? "내 기록 모음으로" : "이전으로"} onClick={back} disabled={saving} />
      <span>{saved ? "첫 페이지" : "우리의 첫 페이지"}</span>
      <StepCount>{saved ? <Check size={18} aria-label="저장 완료" /> : `${stage === "photo" ? 1 : stage === "write" ? 2 : 3} / 3`}</StepCount>
    </Header>
    <Content ref={scroll} data-scroll-region>
      <Intro>
        <h1 ref={heading} tabIndex={-1} id="first-memory-heading">{saved ? <>우리의 첫 페이지가<br />완성됐어요.</> : stage === "photo" ? <>어떤 순간을<br />오래 간직하고 싶나요?</> : stage === "write" ? <>그날의 이야기를<br />조금만 들려주세요.</> : <>우리의 첫 페이지를<br />살펴볼까요?</>}</h1>
        <p>{saved ? "소중한 순간들이 하나씩 모이면 우리만의 이야기가 됩니다." : stage === "photo" ? "함께한 사진 한 장, 짧은 글 하나면 충분해요." : stage === "write" ? "길게 쓰지 않아도 괜찮아요. 사진만 남겨도 좋아요." : "이 모습으로 기록에 남겨둘게요."}</p>
      </Intro>
      {!saved && stage === "photo" && <PhotoChoices>
        {image && <SelectedPhoto><Image src={image} alt="선택한 추억 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <Button type="button" $tone="secondary" onClick={() => photoInput.current?.click()}><ImagePlus size={18} aria-hidden="true" />{image ? "다른 사진 고르기" : "앨범에서 사진 고르기"}</Button>
        <Button type="button" onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />카메라로 남기기</Button>
        {!image && <TextButton type="button" onClick={() => setStage("write")}>사진 없이 글로 시작하기</TextButton>}
      </PhotoChoices>}
      <HiddenInput ref={photoInput} type="file" accept="image/*" aria-label="앨범 사진 선택" onChange={choosePhoto} />
      <HiddenInput ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="카메라 사진 촬영" onChange={choosePhoto} />
      {!saved && stage === "write" && <Fields>
        {image && <SelectedPhoto><Image src={image} alt="첫 페이지에 담을 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <label><span>기억하고 싶은 이야기 <small>{image ? "선택" : "필수"}</small></span><textarea aria-label="기억하고 싶은 이야기" placeholder="함께여서 좋았던 순간을 남겨보세요." maxLength={FIRST_JOURNAL_CONTENT_LIMIT} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <label>날짜<input aria-label="기록 날짜" type="date" max={today} value={date} onChange={(event) => { dateEdited.current = true; setDate(event.target.value); }} /></label>
        <label><span>어디에서 함께했나요? <small>선택</small></span><input aria-label="장소 (선택)" placeholder="동네 카페, 함께 걷던 길" maxLength={FIRST_JOURNAL_PLACE_LIMIT} value={place} onChange={(event) => setPlace(event.target.value)} /></label>
        {sensitivePolicy ? <SensitiveSection>
          <legend>사진이나 글에 본인의 민감정보가 있나요?</legend>
          <p>건강, 정치적 견해, 사상·신념, 성생활 등에 관한 정보를 뜻해요. 타인의 민감정보와 주민등록번호 등은 남기지 말아주세요.</p>
          <label><input type="radio" name="first-memory-sensitive" checked={sensitiveContent === false} onChange={() => { setSensitiveContent(false); setSensitiveAgreed(false); }} />없어요</label>
          <label><input type="radio" name="first-memory-sensitive" checked={sensitiveContent === true} onChange={() => { setSensitiveContent(true); setSensitiveAgreed(false); }} />본인의 민감정보가 있어요</label>
          {sensitiveContent && !privateStorageAvailable && <p role="status">민감정보 보관 기능을 이용할 수 없어요. 해당 내용을 빼고 ‘없어요’를 선택해주세요.</p>}
          {sensitiveContent && privateStorageAvailable && <>
            <p>민감정보가 있는 기록은 나만 볼 수 있고, 웹 링크로 공개할 수 없어요.</p>
            <dl><dt>처리 항목</dt><dd>{sensitiveJournalConsentNotice.items}</dd>
              <dt>처리 목적</dt><dd>{sensitiveJournalConsentNotice.purpose}</dd>
              <dt>보관기간</dt><dd>{sensitiveJournalConsentNotice.retention}</dd></dl>
            <p>{sensitiveJournalConsentNotice.refusal}</p><p>{sensitiveJournalConsentNotice.withdrawal}</p>
            <label><input type="checkbox" checked={sensitiveAgreed} onChange={event => setSensitiveAgreed(event.target.checked)} />[선택] 이 기록의 민감정보 처리에 별도로 동의해요.</label>
          </>}
        </SensitiveSection> : <div role="status">{policyFailed ? "기록 보관 기준을 확인하지 못했어요." : "기록 보관 기준을 확인하고 있어요."}
          {policyFailed && <TextButton type="button" onClick={() => setPolicyAttempt(value => value + 1)}>다시 확인하기</TextButton>}</div>}
      </Fields>}
      {(saved || stage === "preview") && <MemoryPage
        image={saved ? saved.image : image}
        content={saved ? saved.content : content.trim()}
        date={saved ? getKoreanDateKey(new Date(saved.visitedAt)) : date}
        place={saved ? (saved.placeName === "남긴 공간" ? "" : saved.placeName) : place.trim()}
      />}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </Content>
    <Footer>
      {saved ? <>
        <PrimaryButton type="button" onClick={onCollection}>내 기록 모음 보기 <ArrowRight size={16} aria-hidden="true" /></PrimaryButton>
        <TextButton type="button" onClick={startAnother}>새로운 추억 남기기</TextButton>
      </> : stage === "photo" ? image && <PrimaryButton type="button" onClick={() => setStage("write")}>이 사진으로 계속하기</PrimaryButton>
        : stage === "write" ? <PrimaryButton type="button" disabled={!draft || !sensitiveReady} onClick={() => { setError(""); setStage("preview"); }}>첫 페이지 미리보기</PrimaryButton>
          : <><PrimaryButton type="button" disabled={!draft || !sensitiveReady || saving} onClick={() => void save()}>{saving ? "첫 페이지를 저장하고 있어요…" : "이대로 기록 저장하기"}</PrimaryButton><TextButton type="button" disabled={saving} onClick={() => setStage("write")}>조금 더 고치기</TextButton></>}
    </Footer>
    {cropSource && <ImageCropDialog source={cropSource} onCancel={cancelCrop} onConfirm={confirmCrop} />}
  </Frame>;
}

function MemoryPage({ image, content, date, place }: { image: string | null; content: string; date: string; place: string }) {
  return <Page aria-label="나의 기록집 첫 페이지">
    <PageMeta><span>{date.replaceAll("-", ".")}</span>{place && <span>{place}</span>}</PageMeta>
    {image && <PageImage><Image src={image} alt="기록에 담은 사진" fill unoptimized sizes="350px" /></PageImage>}
    {content && <PageText>{content}</PageText>}
    <PageNumber aria-hidden="true">1</PageNumber>
  </Page>;
}

const Frame = styled(ScreenFrame)`background: #fff; gap: 20px; --screen-padding-top: calc(24px + var(--app-safe-area-top, 0px));`;
const Header = styled.header`flex: none; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; text-align: center; gap: 8px; > span { font-size: 14px; font-weight: 600; }`;
const StepCount = styled.div`font-size: 12px; color: var(--color-text-muted); display: flex; justify-content: center;`;
const Content = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 24px; display: flex; flex-direction: column; gap: 26px; > * { flex-shrink: 0; }`;
const Intro = styled.div`
  h1 { margin: 0 0 12px; font-size: 25px; font-weight: 600; line-height: 1.4; letter-spacing: -0.035em; &:focus { outline: none; } }
  p { color: var(--color-text-muted); font-size: 13px; line-height: 1.8; word-break: keep-all; }
`;
const PhotoChoices = styled.div`display: grid; gap: 12px; margin-top: 8px;`;
const SelectedPhoto = styled.div`position: relative; aspect-ratio: 4 / 3; border-radius: 5px; overflow: hidden; background: #f6f9fc; img { object-fit: contain; }`;
const HiddenInput = styled.input`display: none;`;
const SensitiveSection = styled.fieldset`
  display: grid; gap: 12px; margin: 0; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px;
  font-size: 12px; line-height: 1.7;
  legend { padding-inline: 4px; font-size: 13px; font-weight: 600; }
  p, dd { margin: 0; color: var(--color-text-muted); }
  dt { margin-top: 8px; font-weight: 600; }
  && label { display: flex; align-items: flex-start; gap: 8px; }
  && input { width: 18px; height: 18px; flex: none; margin-top: 2px; accent-color: var(--color-brand-800); }
`;
const Fields = styled.div`
  display: grid; gap: 24px;
  label { display: grid; gap: 10px; font-size: 13px; font-weight: 500; }
  small { display: inline; font-size: 11px; font-weight: 400; color: var(--color-text-muted); }
  input, textarea { min-width: 0; max-width: 100%; width: 100%; border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; color: var(--color-text); background: #fff; font: inherit; font-weight: 400; line-height: 1.7; }
  textarea { min-height: 130px; resize: vertical; }
`;
const Page = styled.article`position: relative; min-height: 420px; width: 100%; display: flex; flex-direction: column; gap: 32px; padding: 28px 24px; border: 1px solid #e6edf4; border-radius: 3px; background: #fff;`;
const PageMeta = styled.div`display: flex; justify-content: space-between; gap: 20px; font-size: 10px; line-height: 1.7; > span { min-width: 0; overflow-wrap: anywhere; }`;
const PageImage = styled.div`position: relative; width: 100%; aspect-ratio: 4 / 3; flex: none; img { object-fit: contain; }`;
const PageText = styled.p`white-space: pre-wrap; font-size: 12px; line-height: 1.95; overflow-wrap: anywhere; word-break: keep-all;`;
const PageNumber = styled.span`margin-top: auto; padding-top: 20px; align-self: flex-end; font-size: 10px; color: var(--color-text-muted);`;
const Footer = styled.div`flex: none; display: grid; gap: 6px; > button { white-space: normal; min-height: 48px; line-height: 1.6; } > button:first-of-type { color: #173b60; }`;
const ErrorMessage = styled.p`font-size: 13px; color: var(--color-danger, #b84242); line-height: 1.7;`;
