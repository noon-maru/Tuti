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
import { FIRST_JOURNAL_CONTENT_LIMIT, FIRST_JOURNAL_PLACE_LIMIT, FIRST_JOURNAL_TITLE_LIMIT, prepareFirstJournalDraft } from "@/shared/api/firstJournal";
import type { JournalEntryInput, TutiJournalEntry } from "@/shared/api/journal";
import { MadiHarumadiSelection } from "./MadiHarumadiSelection";

type Stage = "photo" | "write" | "preview";

export function MadiCreateScreen({ onBack, onSave, onCollection, onSaved, harumadiSelection, inHarumadi = false, firstMadi = false, initialPlace, collectionLabel = "작성 마치기", preview = false }: {
  inHarumadi?: boolean;
  firstMadi?: boolean;
  initialPlace?: { id: string; name: string };
  collectionLabel?: string;
  preview?: boolean;
  onBack: () => void;
  onSave?: (input: JournalEntryInput) => Promise<TutiJournalEntry>;
  onCollection: () => void;
  onSaved?: (entry: TutiJournalEntry) => void;
  harumadiSelection?: { ownerId: string; initialBookId?: string | null; onDone: () => void };
}) {
  const [stage, setStage] = useState<Stage>("photo");
  const [continued, setContinued] = useState(false);
  const [savedAsFirstMadi, setSavedAsFirstMadi] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getKoreanDateKey);
  const [place, setPlace] = useState(initialPlace?.name ?? "");
  const [saved, setSaved] = useState<TutiJournalEntry | null>(null);
  const madiLabel = (saved ? savedAsFirstMadi : firstMadi && !continued) ? "첫 마디" : "새로운 마디";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const dateEdited = useRef(false);
  const selection = useRef(0);
  const photoMetadata = useRef<ReturnType<typeof readImageMetadata> | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const today = getKoreanDateKey();
  const draft = prepareFirstJournalDraft({ image, title, content, date, place }, today);

  useEffect(() => () => { if (cropSource) URL.revokeObjectURL(cropSource); }, [cropSource]);
  useEffect(() => () => { selection.current += 1; }, []);
  useEffect(() => {
    if (preview) return;
    scroll.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [stage, saved, preview]);

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
    if (preview || (saved && !savedAsFirstMadi && harumadiSelection)) return;
    const onAndroidBack = (event: Event) => {
      event.preventDefault();
      back();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onAndroidBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onAndroidBack);
  }, [back, preview, saved, savedAsFirstMadi, harumadiSelection]);

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    selection.current += 1;
    setCropSource(URL.createObjectURL(file));
    // 새 마디 작성에서 GPS는 읽지 않는다. 촬영일만 선택적으로 가져온다.
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
    if (!draft || savingRef.current || preview || !onSave) return;
    savingRef.current = true;
    setSavedAsFirstMadi(firstMadi && !continued);
    setSaving(true); setError("");
    try {
      // 간편 작성은 일반 마디만 취급하며 별도 민감정보 동의를 추정하지 않는다.
      const entry = await onSave({ ...draft,
        placeId: initialPlace && place.trim() === initialPlace.name ? initialPlace.id : null,
        sensitiveContent: false });
      setSaved(entry);
      onSaved?.(entry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "마디를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const startAnother = () => {
    setContinued(true);
    selection.current += 1;
    setSaved(null); setImage(null); setTitle(""); setContent(""); setDate(getKoreanDateKey()); setPlace(""); setError("");
    dateEdited.current = false;
    setStage("photo");
  };

  if (saved && !savedAsFirstMadi && harumadiSelection) return <MadiHarumadiSelection key={saved.id}
    {...harumadiSelection} entryId={saved.id} onNext={startAnother} />;

  return <Frame aria-labelledby="madi-create-heading">
    <Header>
      <BackButton aria-label={saved ? inHarumadi ? "하루마디로" : collectionLabel : "이전으로"} onClick={back} disabled={saving} />
      <span>{inHarumadi ? "하루마디에 남길 마디" : madiLabel}</span>
      <StepCount>{saved ? <Check size={18} aria-label="저장 완료" /> : `${stage === "photo" ? 1 : stage === "write" ? 2 : 3} / 3`}</StepCount>
    </Header>
    <Content ref={scroll} data-scroll-region>
      <Intro>
        <h1 ref={heading} tabIndex={-1} id="madi-create-heading">{saved ? <>{madiLabel}를<br />남겼어요.</> : stage === "photo" ? <>어떤 순간을<br />오래 간직하고 싶나요?</> : stage === "write" ? <>그날의 이야기를<br />조금만 들려주세요.</> : <>{madiLabel}를<br />살펴볼까요?</>}</h1>
        <p>{saved ? "하루의 마디들이 모여, 한 권의 이야기가 돼요." : stage === "photo" ? "사진 한 장, 짧은 이야기면 충분해요." : stage === "write" ? "길게 쓰지 않아도 괜찮아요. 사진만 남겨도 좋아요." : "이 모습으로 마디를 남겨둘게요."}</p>
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
        {image && <SelectedPhoto><Image src={image} alt="마디에 담을 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <label><span>제목 <small>선택</small></span><input aria-label="마디 제목 (선택)" placeholder="이날을 기억할 짧은 제목" maxLength={FIRST_JOURNAL_TITLE_LIMIT} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label><span>기억하고 싶은 이야기 <small>{image ? "선택" : "필수"}</small></span><textarea aria-label="기억하고 싶은 이야기" placeholder="함께여서 좋았던 순간을 남겨보세요." maxLength={FIRST_JOURNAL_CONTENT_LIMIT} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <label>날짜<input aria-label="마디 날짜" type="date" max={today} value={date} onChange={(event) => { dateEdited.current = true; setDate(event.target.value); }} /></label>
        <label><span>어디에서 함께했나요? <small>선택</small></span><input aria-label="장소 (선택)" placeholder="동네 카페, 함께 걷던 길" maxLength={FIRST_JOURNAL_PLACE_LIMIT} value={place} onChange={(event) => setPlace(event.target.value)} /></label>
        <PrivacyHint>민감정보나 주민등록번호 등은 남기지 말아주세요.</PrivacyHint>
      </Fields>}
      {(saved || stage === "preview") && <MemoryPage
        title={saved ? saved.title : title.trim()}
        image={saved ? saved.image : image}
        content={saved ? saved.content : content.trim()}
        date={saved ? getKoreanDateKey(new Date(saved.visitedAt)) : date}
        place={saved ? (saved.placeName === "남긴 공간" ? "" : saved.placeName) : place.trim()}
      />}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </Content>
    <Footer>
      {saved ? <>
        <PrimaryButton type="button" onClick={onCollection}>{inHarumadi ? "하루마디에 담기" : collectionLabel} <ArrowRight size={16} aria-hidden="true" /></PrimaryButton>
        {!inHarumadi && <TextButton type="button" onClick={startAnother}>다음 마디 남기기</TextButton>}
      </> : stage === "photo" ? image && <PrimaryButton type="button" onClick={() => setStage("write")}>이 사진으로 계속하기</PrimaryButton>
        : stage === "write" ? <PrimaryButton type="button" disabled={!draft} onClick={() => { setError(""); setStage("preview"); }}>{madiLabel} 미리보기</PrimaryButton>
          : <><PrimaryButton type="button" disabled={!draft || saving} onClick={() => void save()}>{saving ? "마디를 저장하고 있어요…" : "이대로 마디 남기기"}</PrimaryButton><TextButton type="button" disabled={saving} onClick={() => setStage("write")}>조금 더 고치기</TextButton></>}
    </Footer>
    {cropSource && <ImageCropDialog source={cropSource} onCancel={cancelCrop} onConfirm={confirmCrop} />}
  </Frame>;
}

function MemoryPage({ title, image, content, date, place }: { title: string; image: string | null; content: string; date: string; place: string }) {
  return <Page aria-label="하루마디에 담을 마디 미리보기">
    <PageMeta><span>{date.replaceAll("-", ".")}</span>{place && <span>{place}</span>}</PageMeta>
    {image && <PageImage><Image src={image} alt="마디에 담은 사진" fill unoptimized sizes="350px" /></PageImage>}
    {title && <PageTitle>{title}</PageTitle>}
    {content && <PageText>{content}</PageText>}
    <PageNumber aria-hidden="true">1</PageNumber>
  </Page>;
}

const Frame = styled(ScreenFrame)`background: #fff; gap: 20px; --screen-padding-top: calc(24px + var(--app-safe-area-top, 0px));`;
const PageTitle = styled.h2`margin: 0; font-size: 15px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere;`;
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
const PrivacyHint = styled.p`margin: 0; font-size: 11px; font-weight: 400; line-height: 1.7; color: var(--color-text-muted); word-break: keep-all;`;
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
const Footer = styled.footer`flex: none; display: grid; gap: 6px; > button { white-space: normal; min-height: 48px; line-height: 1.6; } > button:first-of-type { color: #173b60; }`;
const ErrorMessage = styled.p`font-size: 13px; color: var(--color-danger, #b84242); line-height: 1.7;`;
