"use client";
import { screenTitleStyles, sectionHeadingStyles, bodyCopyStyles, captionStyles, inputControlStyles, nativeDateInputStyles } from "@/shared/ui/typography";
import { MadiFieldLabel } from "@/features/tuti/components/MadiFieldLabel";
import { MADI_COMPOSE_COPY, MADI_FIELD_COPY } from "@/shared/tuti/madiFields";

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
import { FIRST_JOURNAL_CONTENT_LIMIT, FIRST_JOURNAL_TITLE_LIMIT, getMadiFieldErrors, prepareFirstJournalDraft, type MadiFieldErrors } from "@/shared/api/firstJournal";
import type { JournalEntryInput, TutiJournalEntry } from "@/shared/api/journal";
import { MadiHarumadiSelection } from "./MadiHarumadiSelection";
import { useMadiDraft } from "@/features/tuti/hooks/useMadiDraft";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import type { Harumadi } from "@/shared/api/harumadi";
import { JournalPlacePicker } from "@/features/tuti/components/JournalPlacePicker";
import { MadiFieldFeedback } from "@/features/tuti/components/MadiFieldFeedback";
import { newMadiDraftContext } from "@/lib/madiDraft";

type Stage = "photo" | "write" | "preview";

export function MadiCreateScreen({ onBack, onSave, onCollection, onSaved, harumadiSelection, draftOwnerId, inHarumadi = false, destination, destinationError = false, onRetryDestination, firstMadi = false, initialPlace, collectionLabel = "작성 마치기", preview = false }: {
  destination?: Pick<Harumadi, "id" | "title" | "shared">;
  destinationError?: boolean;
  onRetryDestination?: () => void;
  draftOwnerId?: string;
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
  const [placeId, setPlaceId] = useState<string | null>(initialPlace?.id ?? null);
  const [saved, setSaved] = useState<TutiJournalEntry | null>(null);
  const needsBookSelection = Boolean(saved && !saved.savedHarumadi && harumadiSelection && !inHarumadi);
  const madiLabel = (saved ? savedAsFirstMadi : firstMadi && !continued) ? "첫 마디" : "새로운 마디";
  const photoIntro = !inHarumadi && (!firstMadi || continued) ? MADI_COMPOSE_COPY.chooseAfterSave : "사진 한 장, 짧은 이야기면 충분해요.";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof MadiFieldErrors, boolean>>>({});
  const touch = (field: keyof MadiFieldErrors) => setTouched(current => ({ ...current, [field]: true }));
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
  const fieldErrors = getMadiFieldErrors({ image, title, content, date, place }, today);
  const draftContext = newMadiDraftContext(inHarumadi ? destination : null);
  const localDraft = useMadiDraft({ ownerId: draftOwnerId, ...draftContext, enabled: !preview && !saved && (!inHarumadi || Boolean(destination)),
    value: { image, title, content, date, place, placeId, originalImage: false, stage },
    restore: value => {
      setImage(value.image); setTitle(value.title); setContent(value.content); setDate(value.date); setPlace(value.place); setStage(value.stage ?? "write");
      setPlaceId(value.placeId);
      dateEdited.current = true;
    } });

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
    else void localDraft.leave(onBack);
  }, [cancelCrop, cropSource, onBack, onCollection, saved, stage, localDraft]);
  useEffect(() => {
    if (preview || needsBookSelection) return;
    const onAndroidBack = (event: Event) => {
      event.preventDefault();
      back();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onAndroidBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onAndroidBack);
  }, [back, preview, needsBookSelection]);

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
  const removePhoto = () => {
    selection.current += 1;
    photoMetadata.current = null;
    setImage(null);
    setCropSource(null);
    setError("");
  };

  const save = async () => {
    if (!draft || savingRef.current || preview || !onSave || (inHarumadi && !destination)) return;
    savingRef.current = true;
    setSavedAsFirstMadi(firstMadi && !continued);
    setSaving(true); setError("");
    try {
      // 간편 작성은 일반 마디만 취급하며 별도 민감정보 동의를 추정하지 않는다.
      const entry = await onSave({ ...draft,
        placeId,
        sensitiveContent: false });
      await localDraft.finish();
      setSaved(entry);
      onSaved?.(entry);
      // 이 화면에 들어오기 전에 담을 하루마디를 이미 정했다.
      // 저장된 ID를 전달한 뒤 바로 연결·복귀하며 완료 버튼을 다시 요구하지 않는다.
      if (inHarumadi) onCollection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "마디를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const startAnother = () => {
    setContinued(true);
    selection.current += 1;
    setSaved(null); setImage(null); setTitle(""); setContent(""); setDate(getKoreanDateKey()); setPlace(""); setError("");
    setPlaceId(null);
    setTouched({});
    dateEdited.current = false;
    setStage("photo");
  };

  if (!localDraft.ready && !preview) return <AppLoadingScreen label="작성 중이던 마디를 확인하고 있어요." />;
  if (saved && inHarumadi) return <AppLoadingScreen label="하루마디에 담고 있어요." />;
  if (saved && needsBookSelection && harumadiSelection) return <MadiHarumadiSelection key={saved.id}
    {...harumadiSelection} entryId={saved.id} onNext={startAnother} />;

  if (inHarumadi && !destination) return <Frame aria-labelledby="madi-destination-heading">
    <Header><BackButton aria-label="하루마디로 돌아가기" onClick={onBack} /><span>하루마디에 남길 마디</span><span /></Header>
    <Content data-scroll-region>
      <Intro><h1 id="madi-destination-heading">{destinationError ? "담을 하루마디를 확인하지 못했어요." : "담을 하루마디를 확인하고 있어요."}</h1>
        <p role={destinationError ? "alert" : "status"}>{destinationError ? "연결과 접근 권한을 확인한 뒤 다시 시도해주세요. 저장해 둔 초안은 그대로 남아 있어요." : "담을 곳과 공유 범위를 확인한 뒤 작성할 수 있어요."}</p></Intro>
      {destinationError && <TextButton onClick={onRetryDestination}>다시 확인하기</TextButton>}
    </Content>
  </Frame>;

  return <Frame aria-labelledby="madi-create-heading">
    <Header>
      <BackButton aria-label={saved ? inHarumadi ? "하루마디로" : collectionLabel : "이전으로"} onClick={back} disabled={saving} />
      <span>{inHarumadi ? "하루마디에 남길 마디" : madiLabel}</span>
      <StepCount>{saved ? <Check size={18} aria-label="저장 완료" /> : stage === "preview" ? "미리보기" : `${stage === "photo" ? 1 : 2} / 2`}</StepCount>
    </Header>
    <Content ref={scroll} data-scroll-region>
      {!saved && inHarumadi && <Destination role="status">
        {destination ? <><strong>{destination.title}</strong><span>{destination.shared ? "함께 채우는 사람들에게 보여요." : "나만 보는 하루마디에 담아요."}</span></>
          : <><span>{destinationError ? "담을 하루마디를 확인하지 못했어요." : "담을 하루마디를 확인하고 있어요."}</span>{destinationError && <TextButton onClick={onRetryDestination}>다시 확인하기</TextButton>}</>}
      </Destination>}
      <Intro>
        <h1 ref={heading} tabIndex={-1} id="madi-create-heading">{saved ? <>{madiLabel}를<br />남겼어요.</> : stage === "photo" ? <>어떤 순간을<br />오래 간직하고 싶나요?</> : stage === "write" ? <>그날의 이야기를<br />조금만 들려주세요.</> : <>{madiLabel}를<br />살펴볼까요?</>}</h1>
        <p>{saved ? saved.savedHarumadi ? `‘${saved.savedHarumadi.title}’에 담았어요.` : "남긴 마디는 전체 마디 보기에서 볼 수 있어요." : stage === "photo" ? photoIntro : stage === "write" ? "길게 쓰지 않아도 괜찮아요. 사진만 남겨도 좋아요." : "사진과 이야기를 확인해주세요."}</p>
      </Intro>
      {!saved && stage === "photo" && <PhotoChoices>
        {image && <SelectedPhoto><Image src={image} alt="선택한 추억 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <Button type="button" $tone="secondary" onClick={() => photoInput.current?.click()}><ImagePlus size={18} aria-hidden="true" />{image ? "다른 사진 고르기" : "앨범에서 사진 고르기"}</Button>
        <Button type="button" onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />카메라로 남기기</Button>
        {image && <TextButton type="button" onClick={() => { removePhoto(); setStage("write"); }}>사진 빼고 글로 남기기</TextButton>}
        {!image && <TextButton type="button" onClick={() => setStage("write")}>사진 없이 글로 시작하기</TextButton>}
      </PhotoChoices>}
      <HiddenInput ref={photoInput} type="file" accept="image/*" aria-label="앨범 사진 선택" onChange={choosePhoto} />
      <HiddenInput ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="카메라 사진 촬영" onChange={choosePhoto} />
      {!saved && stage === "write" && <Fields disabled={saving} aria-label="마디 내용" aria-busy={saving}>
        {image && <SelectedPhoto><Image src={image} alt="마디에 담을 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <PhotoActions><TextButton type="button" onClick={() => photoInput.current?.click()}>{image ? "사진 바꾸기" : "사진 추가하기"}</TextButton>{image && <TextButton type="button" onClick={removePhoto}>사진 빼기</TextButton>}</PhotoActions>
        <label><MadiFieldLabel>제목 <small>선택</small></MadiFieldLabel><input aria-label="마디 제목 (선택)" placeholder={MADI_FIELD_COPY.titlePlaceholder} maxLength={FIRST_JOURNAL_TITLE_LIMIT} value={title} onChange={event => setTitle(event.target.value)}
          onBlur={() => touch("title")} aria-invalid={Boolean(touched.title && fieldErrors.title)} aria-describedby={fieldErrors.title ? "madi-title-feedback" : undefined} />
          <MadiFieldFeedback id="madi-title-feedback" message={fieldErrors.title} touched={touched.title} /></label>
        <label><MadiFieldLabel>기억하고 싶은 이야기 <small>{image ? "선택" : "필수"}</small></MadiFieldLabel><textarea aria-label="기억하고 싶은 이야기" placeholder={MADI_FIELD_COPY.storyPlaceholder} maxLength={FIRST_JOURNAL_CONTENT_LIMIT} value={content} onChange={(event) => setContent(event.target.value)}
          aria-required={!image} onBlur={() => touch("content")} aria-invalid={Boolean(touched.content && fieldErrors.content)} aria-describedby={fieldErrors.content ? "madi-content-feedback" : undefined} />
          <MadiFieldFeedback id="madi-content-feedback" message={fieldErrors.content} touched={touched.content} /></label>
        <label><MadiFieldLabel>날짜</MadiFieldLabel><input aria-label="마디 날짜" type="date" max={today} value={date} onChange={(event) => { dateEdited.current = true; setDate(event.target.value); }}
          aria-required="true" onBlur={() => touch("date")} aria-invalid={Boolean(touched.date && fieldErrors.date)} aria-describedby={fieldErrors.date ? "madi-date-feedback" : undefined} />
          <MadiFieldFeedback id="madi-date-feedback" message={fieldErrors.date} touched={touched.date} /></label>
        <div><MadiFieldLabel>장소 <small>선택</small></MadiFieldLabel><JournalPlacePicker value={place} placeId={placeId}
          onBlur={() => touch("place")} invalid={Boolean(touched.place && fieldErrors.place)} describedBy={fieldErrors.place ? "madi-place-feedback" : undefined}
          onTextChange={value => { setPlace(value); setPlaceId(null); }}
          onChange={value => { setPlace(value.name); setPlaceId(value.id); }} />
          <MadiFieldFeedback id="madi-place-feedback" message={fieldErrors.place} touched={touched.place} /></div>
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
      {!saved && localDraft.notice && <PrivacyHint role="status">{localDraft.notice}</PrivacyHint>}
    </Content>
    <Footer>
      {saved ? <>
        <PrimaryButton type="button" onClick={onCollection}>{inHarumadi ? "하루마디에 담기" : collectionLabel} <ArrowRight size={16} aria-hidden="true" /></PrimaryButton>
        {!inHarumadi && <TextButton type="button" onClick={startAnother}>다음 마디 남기기</TextButton>}
      </> : stage === "photo" ? image && <PrimaryButton type="button" onClick={() => setStage("write")}>이 사진으로 계속하기</PrimaryButton>
        : stage === "write" ? <>
          {inHarumadi && destination && <PrivacyHint>{destination.title} · {destination.shared ? "함께 보는 마디" : "나만 보는 마디"}</PrivacyHint>}
          <PrimaryButton type="button" disabled={!draft || saving || (inHarumadi && !destination)} onClick={() => void save()}>{saving ? "마디를 저장하고 있어요…" : `${madiLabel} 남기기`}</PrimaryButton>
          <TextButton type="button" disabled={!draft || saving} onClick={() => { setError(""); setStage("preview"); }}>미리보기</TextButton>
        </>
          : <>{inHarumadi && destination && <PrivacyHint>{destination.title} · {destination.shared ? "함께 보는 마디" : "나만 보는 마디"}</PrivacyHint>}<PrimaryButton type="button" disabled={!draft || saving || (inHarumadi && !destination)} onClick={() => void save()}>{saving ? "마디를 저장하고 있어요…" : "이대로 마디 남기기"}</PrimaryButton><TextButton type="button" disabled={saving} onClick={() => setStage("write")}>조금 더 고치기</TextButton></>}
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

const Frame = styled(ScreenFrame)`background: var(--color-surface); gap: var(--space-5);`;
const PageTitle = styled.h2`margin: 0; font-size: 15px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere;`;
const Header = styled.header`flex: none; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; text-align: center; gap: 8px;
  > span { ${screenTitleStyles} word-break: keep-all; }
`;
const StepCount = styled.div`font-size: 12px; color: var(--color-text-muted); display: flex; justify-content: center;`;
const Content = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 24px; display: flex; flex-direction: column; gap: 26px; > * { flex-shrink: 0; }`;
const Intro = styled.div`
  h1 { ${sectionHeadingStyles} margin-bottom: var(--space-3); &:focus { outline: none; } }
  p { ${bodyCopyStyles} color: var(--color-text-muted); word-break: keep-all; }
`;
const PhotoChoices = styled.div`display: grid; gap: 12px; margin-top: 8px;`;
const PhotoActions = styled.div`display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: -12px;`;
const SelectedPhoto = styled.div`position: relative; aspect-ratio: 4 / 3; border-radius: 5px; overflow: hidden; background: #f6f9fc; img { object-fit: contain; }`;
const HiddenInput = styled.input`display: none;`;
const PrivacyHint = styled.p`${captionStyles} margin: 0; min-width: 0; word-break: keep-all; overflow-wrap: anywhere;`;
const Destination = styled.div`display: grid; gap: 4px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); strong { font-size: var(--ui-body-size); font-weight: 600; overflow-wrap: anywhere; } span { ${captionStyles} }`;
const Fields = styled.fieldset`
  margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-inline-size: 0; gap: 24px;
  label { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 10px; font-size: var(--ui-body-size); font-weight: 500; }
  small { ${captionStyles} display: inline; }
  input, textarea { ${inputControlStyles} }
  input[type="date"] { ${nativeDateInputStyles} }
  textarea { min-height: 130px; resize: vertical; }
`;
const Page = styled.article`position: relative; min-height: 420px; width: 100%; display: flex; flex-direction: column; gap: 32px; padding: 28px 24px; border: 1px solid #e6edf4; border-radius: 3px; background: #fff;`;
const PageMeta = styled.div`display: flex; justify-content: space-between; gap: 20px; font-size: 10px; line-height: 1.7; > span { min-width: 0; overflow-wrap: anywhere; }`;
const PageImage = styled.div`position: relative; width: 100%; aspect-ratio: 4 / 3; flex: none; img { object-fit: contain; }`;
const PageText = styled.p`white-space: pre-wrap; font-size: 12px; line-height: 1.95; overflow-wrap: anywhere; word-break: keep-all;`;
const PageNumber = styled.span`margin-top: auto; padding-top: 20px; align-self: flex-end; font-size: 10px; color: var(--color-text-muted);`;
const Footer = styled.footer`flex: none; display: grid; gap: 6px; > button { white-space: normal; min-height: 48px; line-height: 1.6; }`;
const ErrorMessage = styled.p`font-size: 13px; color: var(--color-danger, #b84242); line-height: 1.7;`;
