"use client";
import { screenTitleStyles, sectionHeadingStyles, bodyCopyStyles, captionStyles, inputControlStyles, nativeDateInputStyles } from "@/shared/ui/typography";
import { MadiFieldLabel } from "@/features/tuti/components/MadiFieldLabel";
import { MADI_COMPOSE_COPY, MADI_FIELD_COPY } from "@/shared/tuti/madiFields";

import styled from "@emotion/styled";
import Image from "next/image";
import { Camera, ImagePlus, Check, ArrowRight, PenLine, PawPrint, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton, Button, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ImageCropDialog } from "@/features/tuti/components/ImageCropDialog";
import { readImageMetadata } from "@/features/tuti/lib/readImageMetadata";
import { prepareMadiPhoto } from "@/features/tuti/lib/prepareMadiPhoto";
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
import { madiEditDraftSource, newMadiDraftContext } from "@/lib/madiDraft";
import { harumadiSharingNotice } from "@/shared/harumadi/sharingAudience";
import { PetProfiles } from "@/features/tuti/components/PetProfiles";
import { MadiPetTags } from "@/features/tuti/components/MadiPetTags";
import type { PetProfile } from "@/shared/pets/profile";
import { FIRST_MADI_HANDOFF_MS, FIRST_MADI_PLACEMENT_MS, FIRST_MADI_REDUCED_HANDOFF_MS, animateFirstMadiAssembly, animateFirstMadiGuidance, animateFirstMadiPlacement, firstMadiOrigins, firstMadiPageOrigin, type FirstMadiOrigins, type FirstMadiPageOrigin } from "@/features/tuti/lib/firstMadiPlacementMotion";
import { usePetProfiles } from "@/features/tuti/hooks/usePetProfiles";
import { cancelFirstMadiHandoff, startFirstMadiHandoff, type FirstMadiHandoffKind } from "@/features/tuti/lib/firstMadiHandoff";

type Stage = "photo" | "write" | "preview";

export function MadiCreateScreen({ onBack, onSave, onCollection, onSaved, onOpenSaved, onRenameFirstHarumadi, renamedHarumadi, suspended = false, onSelectHarumadi, onStartAnother, onContinueInHarumadi, continueInHarumadi = false, harumadiSelection, draftOwnerId, inHarumadi = false, destination, draftDestination, destinationVerified = Boolean(destination), destinationScopeChanged = false, destinationError = false, onRetryDestination, firstMadi = false, initialPlace, collectionLabel = "작성 마치기", preview = false }: {
  destination?: Pick<Harumadi, "id" | "title" | "shared" | "sharingAudience">;
  draftDestination?: Pick<Harumadi, "id" | "title" | "shared" | "sharingAudience">;
  destinationVerified?: boolean;
  destinationScopeChanged?: boolean;
  destinationError?: boolean;
  onRetryDestination?: () => void;
  draftOwnerId?: string;
  inHarumadi?: boolean;
  firstMadi?: boolean;
  initialPlace?: { id: string; name: string };
  collectionLabel?: string;
  preview?: boolean;
  onBack: () => void;
  onSave?: (input: JournalEntryInput, existing?: TutiJournalEntry) => Promise<TutiJournalEntry>;
  onCollection: () => void;
  onSaved?: (entry: TutiJournalEntry, savedAsFirst: boolean) => void;
  onOpenSaved?: (entry: TutiJournalEntry) => void;
  onRenameFirstHarumadi?: (book: Pick<Harumadi, "id" | "title">) => void;
  renamedHarumadi?: Pick<Harumadi, "id" | "title">;
  suspended?: boolean;
  onSelectHarumadi?: (entry: TutiJournalEntry) => void;
  onStartAnother?: () => void;
  onContinueInHarumadi?: (bookId: string) => void;
  continueInHarumadi?: boolean;
  harumadiSelection?: { ownerId: string; initialBookId?: string | null; onDone: () => void };
}) {
  const [stage, setStage] = useState<Stage>("photo");
  const [continued, setContinued] = useState(false);
  const [savedAsFirstMadi, setSavedAsFirstMadi] = useState(false);
  const [placementOrigins, setPlacementOrigins] = useState<FirstMadiOrigins | null>(null);
  const [bookStep, setBookStep] = useState<{ origin: FirstMadiPageOrigin | null; settled: boolean } | null>(null);
  const [placedPets, setPlacedPets] = useState<PetProfile[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getKoreanDateKey);
  const [place, setPlace] = useState(initialPlace?.name ?? "");
  const [placeId, setPlaceId] = useState<string | null>(initialPlace?.id ?? null);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [petsOpened, setPetsOpened] = useState(false);
  const [petProfileBusy, setPetProfileBusy] = useState(false);
  const petProfileBusyRef = useRef(false);
  const onPetProfileBusyChange = useCallback((busy: boolean) => { petProfileBusyRef.current = busy; setPetProfileBusy(busy); }, []);
  const [storyOpen, setStoryOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [saved, setSaved] = useState<TutiJournalEntry | null>(null);
  const [editingSaved, setEditingSaved] = useState<TutiJournalEntry | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [editingPetIds, setEditingPetIds] = useState<string[]>([]);
  const petProfiles = usePetProfiles(draftOwnerId ?? "", !preview && !saved && petIds.length > 0);
  const selectedPets = (petProfiles.data?.pets ?? []).filter(pet => petIds.includes(pet.id));
  const selectedPetNames = selectedPets.map(pet => pet.name).join(", ");
  const petSummary = petIds.length === 0 ? "선택" : selectedPets.length === petIds.length ? selectedPetNames : `${petIds.length}마리 선택`;
  const needsBookSelection = Boolean(saved && !savedAsFirstMadi && !saved.savedHarumadi && harumadiSelection && !inHarumadi);
  const showFirstSavedAction = Boolean(savedAsFirstMadi && !inHarumadi && onOpenSaved);
  const firstBook = savedAsFirstMadi && !inHarumadi ? saved?.savedHarumadi : undefined;
  const firstPlacement = firstBook && renamedHarumadi?.id === firstBook.id ? renamedHarumadi : firstBook;
  const assemblingFirstMadi = Boolean(firstPlacement && placementOrigins && !bookStep);
  const placingFirstMadi = Boolean(bookStep && !bookStep.settled);
  const showingPlacementGuidance = assemblingFirstMadi || placingFirstMadi;
  const placementGuidance = useRef<HTMLParagraphElement>(null);
  const madiLabel = (saved || editingSaved ? savedAsFirstMadi : firstMadi && !continued) ? "첫 마디" : "새로운 마디";
  const photoIntro = !inHarumadi && (!firstMadi || continued) ? MADI_COMPOSE_COPY.chooseAfterSave : "사진 한 장, 짧은 이야기면 충분해요.";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof MadiFieldErrors, boolean>>>({});
  const touch = (field: keyof MadiFieldErrors) => setTouched(current => ({ ...current, [field]: true }));
  const savingRef = useRef(false);
  const preparingPhotoRef = useRef(false);
  const dateEdited = useRef(false);
  const selection = useRef(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const placementScene = useRef<HTMLDivElement>(null);
  const today = getKoreanDateKey();
  const draft = prepareFirstJournalDraft({ image, title, content, date, place }, today);
  const fieldErrors = getMadiFieldErrors({ image, title, content, date, place }, today);
  const originalSavedImage = Boolean(editingSaved && image === editingPhoto);
  const draftContext = editingSaved ? { scope: editingSaved.id, source: madiEditDraftSource(editingSaved, editingPetIds) }
    : newMadiDraftContext(inHarumadi ? draftDestination ?? destination : null, initialPlace?.id);
  const localDraft = useMadiDraft({ ownerId: draftOwnerId, ...draftContext, enabled: !preview && !saved && (!inHarumadi || Boolean(draftDestination ?? destination)),
    value: { image: originalSavedImage ? null : image, title, content, date, place, placeId, petIds, originalImage: originalSavedImage, stage },
    restore: value => {
      setImage(value.originalImage && editingSaved ? editingPhoto : value.image); setTitle(value.title); setContent(value.content); setDate(value.date); setPlace(value.place); setStage(value.stage ?? "write");
      setPlaceId(value.placeId);
      setPetIds(value.petIds ?? []);
      setStoryOpen(Boolean(value.title || value.content)); setPlaceOpen(Boolean(value.place));
      dateEdited.current = true;
    } });
  const restoringDraft = !localDraft.ready && !preview;
  const saveBlocked = restoringDraft || preparingPhoto || Boolean(inHarumadi && (!destination || !destinationVerified || destinationScopeChanged));

  useEffect(() => () => { if (cropSource) URL.revokeObjectURL(cropSource); }, [cropSource]);
  useEffect(() => () => { selection.current += 1; }, []);
  useLayoutEffect(() => {
    const viewport = scroll.current, scene = placementScene.current;
    if (!scene || !viewport || !placementOrigins || bookStep) return;
    viewport.scrollTop = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const cancelMotion = animateFirstMadiAssembly(scene, viewport, placementOrigins);
    const cancelGuidance = assemblingFirstMadi ? animateFirstMadiGuidance(placementGuidance.current) : undefined;
    const cancel = () => { cancelMotion?.(); cancelGuidance?.(); };
    reduced.addEventListener?.("change", cancel);
    window.addEventListener("resize", cancel);
    return () => {
      reduced.removeEventListener?.("change", cancel);
      window.removeEventListener("resize", cancel);
      cancel();
    };
  }, [placementOrigins, bookStep, assemblingFirstMadi]);
  useLayoutEffect(() => {
    if (!bookStep || bookStep.settled) return;
    const scene = placementScene.current, viewport = scroll.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => setBookStep(current => current === bookStep ? { ...bookStep, settled: true } : current);
    if (reduced.matches) { settle(); return; }
    const motion = scene && viewport ? animateFirstMadiPlacement(scene, viewport, bookStep.origin, placementGuidance.current) : undefined;
    if (motion) motion.placement.onfinish = settle;
    const fallback = window.setTimeout(settle, FIRST_MADI_PLACEMENT_MS + (motion ? 160 : 0));
    const width = viewport?.clientWidth;
    const onResize = () => { if (viewport?.clientWidth !== width) settle(); };
    if (motion) {
      reduced.addEventListener?.("change", settle);
      window.addEventListener("resize", onResize);
    }
    return () => {
      window.clearTimeout(fallback);
      if (!motion) return;
      reduced.removeEventListener?.("change", settle);
      window.removeEventListener("resize", onResize);
      motion.placement.onfinish = null;
      motion.cancel();
    };
  }, [bookStep]);
  useLayoutEffect(() => {
    if (!assemblingFirstMadi) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setBookStep({ origin: firstMadiPageOrigin(placementScene.current, scroll.current), settled: reduced });
      setPlacementOrigins(null);
    }, reduced ? FIRST_MADI_REDUCED_HANDOFF_MS : FIRST_MADI_HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [assemblingFirstMadi, placementOrigins]);
  useEffect(() => {
    if (preview) return;
    scroll.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [stage, saved, preview]);

  const cancelCrop = useCallback(() => {
    selection.current += 1;
    setCropSource(null);
  }, []);
  const back = useCallback(() => {
    if (cancelFirstMadiHandoff(placementScene.current)) return;
    if (cropSource) { cancelCrop(); return; }
    if (savingRef.current || petProfileBusyRef.current) return;
    selection.current += 1;
    preparingPhotoRef.current = false;
    setPreparingPhoto(false);
    if (saved) {
      if (bookStep) { setBookStep(null); return; }
      // Restore the actual previous stage with its inputs, but retain the saved
      // identity so another save updates this madi rather than creating one.
      if (savedAsFirstMadi && !inHarumadi) {
        setPlacementOrigins(null);
        setEditingPhoto(image); setEditingPetIds([...petIds]);
        setEditingSaved(saved); setSaved(null); setError("");
      }
      else onCollection();
      return;
    }
    if (stage === "preview") setStage("write");
    else if (stage === "write") setStage("photo");
    else void localDraft.leave(onBack);
  }, [cancelCrop, cropSource, onBack, onCollection, saved, savedAsFirstMadi, inHarumadi, image, petIds, stage, localDraft, bookStep]);
  useEffect(() => {
    if (preview || needsBookSelection || suspended) return;
    const onAndroidBack = (event: Event) => {
      event.preventDefault();
      back();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onAndroidBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onAndroidBack);
  }, [back, preview, needsBookSelection, suspended]);

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || savingRef.current) return;
    setError("");
    const id = ++selection.current;
    preparingPhotoRef.current = true;
    setPreparingPhoto(true);
    // 새 마디 작성에서 GPS는 읽지 않는다. 촬영일만 선택적으로 가져온다.
    const metadata = readImageMetadata(file);
    try {
      const photo = await prepareMadiPhoto(file);
      if (id !== selection.current) return;
      setImage(photo); setStage("write");
      if (title || content) setStoryOpen(true);
      void metadata.then(value => {
        if (id === selection.current && !dateEdited.current && !savingRef.current && value.captureDate && value.captureDate <= today) setDate(value.captureDate);
      }).catch(() => {});
    } catch {
      if (id === selection.current) setError("사진을 불러오지 못했어요. 다른 사진을 선택하거나 글로 남겨주세요.");
    } finally {
      if (id === selection.current) { preparingPhotoRef.current = false; setPreparingPhoto(false); }
    }
  };

  const confirmCrop = (photo: string) => {
    setImage(photo); setCropSource(null); setStage("write");
  };
  const removePhoto = () => {
    selection.current += 1;
    preparingPhotoRef.current = false;
    setPreparingPhoto(false);
    setImage(null);
    setCropSource(null);
    setError("");
  };

  const save = async () => {
    if (preparingPhotoRef.current || petProfileBusyRef.current) return;
    if (!draft || savingRef.current || preview || !onSave || saveBlocked) return;
    savingRef.current = true;
    selection.current += 1;
    if (!editingSaved) setSavedAsFirstMadi(firstMadi && !continued);
    const origins = !inHarumadi && (editingSaved ? savedAsFirstMadi : firstMadi && !continued) ? firstMadiOrigins(scroll.current) : null;
    setSaving(true); setError("");
    try {
      // 간편 작성은 일반 마디만 취급하며 별도 민감정보 동의를 추정하지 않는다.
      const result = await onSave({ ...draft,
        ...(editingSaved || petIds.length ? { petIds } : {}),
        ...(editingSaved?.version ? { expectedVersion: editingSaved.version } : {}),
        ...(originalSavedImage ? { image: editingSaved!.image } : {}),
        placeId,
        sensitiveContent: false }, editingSaved ?? undefined);
      const entry = editingSaved ? { ...result, savedHarumadi: editingSaved.savedHarumadi } : result;
      await localDraft.finish();
      setBookStep(null);
      setPlacementOrigins(entry.savedHarumadi ? origins : null);
      setPlacedPets(entry.pets ?? selectedPets);
      setSaved(entry);
      if (!editingSaved) onSaved?.(entry, firstMadi && !continued);
      setEditingSaved(null);
      // 이 화면에 들어오기 전에 담을 하루마디를 이미 정했다.
      // 저장된 ID를 전달한 뒤 바로 연결·복귀하며 완료 버튼을 다시 요구하지 않는다.
      if (inHarumadi && !continueInHarumadi) onCollection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "마디를 저장하지 못했어요. 다시 시도해주세요.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const startAnother = () => {
    setBookStep(null); setPlacementOrigins(null);
    setEditingSaved(null); setEditingPhoto(null); setEditingPetIds([]);
    setPetIds([]); setPetsOpened(false);
    onStartAnother?.();
    setContinued(true);
    selection.current += 1;
    setSaved(null); setImage(null); setTitle(""); setContent(""); setDate(getKoreanDateKey()); setPlace(""); setError("");
    setPlaceId(null);
    setStoryOpen(false); setPlaceOpen(false);
    setTouched({});
    dateEdited.current = false;
    setStage("photo");
  };
  const nextMadi = (bookId?: string) => {
    if (bookId && onContinueInHarumadi) onContinueInHarumadi(bookId);
    else startAnother();
  };
  const leaveCompletedBook = (kind: FirstMadiHandoffKind, navigate: () => void) => {
    const scene = placementScene.current;
    if (bookStep?.settled && draftOwnerId && firstPlacement && saved && scene) {
      startFirstMadiHandoff({ kind, ownerId: draftOwnerId, bookId: firstPlacement.id, entryId: saved.id, scene, navigate });
    } else navigate();
  };
  const finishCollection = () => {
    if (collectionLabel === "내 책장으로 돌아가기") leaveCompletedBook("shelf", onCollection);
    else onCollection();
  };

  if (saved && inHarumadi && !continueInHarumadi) return <AppLoadingScreen label="하루마디에 담고 있어요." />;
  if (saved && needsBookSelection && harumadiSelection) return <MadiHarumadiSelection key={saved.id}
    {...harumadiSelection} entryId={saved.id} onNext={nextMadi} />;

  return <Frame aria-labelledby="madi-create-heading" data-first-madi-write-target={!preview && inHarumadi && !saved ? (draftDestination ?? destination)?.id : undefined}>
    <Header>
      <BackButton aria-label={bookStep ? "첫 마디로 돌아가기" : saved ? savedAsFirstMadi && !inHarumadi ? "이전으로" : inHarumadi ? "하루마디로" : collectionLabel : "이전으로"} onClick={back} disabled={saving || petProfileBusy} />
      <HeaderTitle $book={inHarumadi}>{inHarumadi ? destination?.title ? `${destination.title}에 남길 마디` : "하루마디에 남길 마디" : madiLabel}</HeaderTitle>
      <StepCount>{saved ? <Check size={18} aria-label="저장 완료" /> : stage === "preview" ? "미리보기" : `${stage === "photo" ? 1 : 2} / 2`}</StepCount>
    </Header>
    <Content ref={scroll} data-scroll-region data-first-madi-scene={firstPlacement ? "" : undefined} $choosing={!saved && stage === "photo" && !image}>
      {!saved && inHarumadi && <Destination role="status">
        {destinationScopeChanged ? <><span>공유 범위가 바뀌었어요. 초안은 보관돼요. 하루마디에서 다시 열어주세요.</span><TextButton onClick={() => void localDraft.leave(onBack)}>하루마디로 돌아가기</TextButton></>
          : destinationError ? <><span>담을 곳을 확인하지 못했어요. 작성은 계속할 수 있어요.</span><TextButton onClick={onRetryDestination}>다시 확인하기</TextButton></>
            : !destinationVerified ? <span>작성하는 동안 담을 곳을 확인할게요.</span>
              : <span>{harumadiSharingNotice(destination ?? {})}</span>}
      </Destination>}
      <Intro $compact={stage === "write" && !saved}>
        <h1 ref={heading} tabIndex={-1} id="madi-create-heading" aria-live={firstPlacement ? "polite" : undefined}>{bookStep?.settled ? "첫 마디가 담겼어요." : firstPlacement ? "첫 마디를 남겼어요." : saved ? <>{madiLabel}를<br />남겼어요.</> : stage === "photo" ? <>어떤 순간을<br />오래 간직하고 싶나요?</> : stage === "write" ? image ? "이 순간을 남겨볼까요?" : <>그날의 이야기를<br />조금만 들려주세요.</> : <>{madiLabel}를<br />살펴볼까요?</>}</h1>
        <p data-first-madi-reveal={bookStep?.settled ? "" : undefined} data-reserved={firstPlacement && !bookStep?.settled ? "" : undefined}>{saved ? saved.savedHarumadi ? `‘${firstPlacement?.title ?? saved.savedHarumadi.title}’에 담았어요.` : "남긴 마디는 전체 마디 보기에서 볼 수 있어요." : stage === "photo" ? photoIntro : stage === "write" ? "길게 쓰지 않아도 괜찮아요. 사진만 남겨도 좋아요." : "사진과 이야기를 확인해주세요."}</p>
      </Intro>
      {!saved && stage === "photo" && <PhotoChoices>
        {image && <SelectedPhoto><Image src={image} alt="선택한 추억 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <Button type="button" disabled={restoringDraft || preparingPhoto} $tone="secondary" onClick={() => photoInput.current?.click()}><ImagePlus size={18} aria-hidden="true" />{image ? "다른 사진 고르기" : "앨범에서 사진 고르기"}</Button>
        <Button type="button" disabled={restoringDraft || preparingPhoto} onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />카메라로 남기기</Button>
        {image && <TextButton type="button" disabled={restoringDraft} onClick={() => { removePhoto(); setStage("write"); }}>사진 빼고 글로 남기기</TextButton>}
        {!image && <WriteStart type="button" $tone="neutral" disabled={restoringDraft || preparingPhoto} onClick={() => setStage("write")}><PenLine size={18} aria-hidden="true" />사진 없이 글로 시작하기</WriteStart>}
      </PhotoChoices>}
      <HiddenInput ref={photoInput} type="file" accept="image/*" aria-label="앨범 사진 선택" onChange={choosePhoto} />
      <HiddenInput ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="카메라 사진 촬영" onChange={choosePhoto} />
      {!saved && stage === "write" && <Fields $photo={Boolean(image)} disabled={saving || restoringDraft || preparingPhoto} aria-label="마디 내용" aria-busy={saving || restoringDraft || preparingPhoto}>
        <PetDisclosure onToggle={event => { if (event.currentTarget.open) setPetsOpened(true); }}>
          <PetSummary data-madi-source="pets">
            <PawPrint size={16} aria-hidden="true" />
            <span>함께한 반려동물</span>
            <span className="pet-selection">{petSummary}</span>
            <ChevronDown className="pet-chevron" size={16} aria-hidden="true" />
          </PetSummary>
          {petsOpened && <div className="pet-options"><PetProfiles selected={petIds} onChange={setPetIds} disabled={saving} attachOnRegister onBusyChange={onPetProfileBusyChange} /></div>}
        </PetDisclosure>
        {image && <SelectedPhoto data-madi-source="photo"><Image src={image} alt="마디에 담을 사진" fill unoptimized sizes="350px" /></SelectedPhoto>}
        <PhotoActions><TextButton type="button" onClick={() => photoInput.current?.click()}>{image ? "사진 바꾸기" : "사진 추가하기"}</TextButton>{image && <><TextButton type="button" onClick={() => setCropSource(image)}>사진 맞추기</TextButton><TextButton type="button" onClick={removePhoto}>사진 빼기</TextButton></>}</PhotoActions>
        {image && <OptionalAction type="button" aria-expanded={storyOpen} aria-controls="madi-story-fields" onClick={() => setStoryOpen(value => !value)}><PenLine size={16} aria-hidden="true" />{storyOpen ? "이야기 접기" : title || content ? "이야기 수정하기" : "이야기 덧붙이기"}<small>선택</small></OptionalAction>}
        <StoryFields id="madi-story-fields" hidden={Boolean(image && !storyOpen)}>
        <label><MadiFieldLabel>제목 <small>선택</small></MadiFieldLabel><input data-madi-source="title" aria-label="마디 제목 (선택)" placeholder={MADI_FIELD_COPY.titlePlaceholder} maxLength={FIRST_JOURNAL_TITLE_LIMIT} value={title} onChange={event => setTitle(event.target.value)}
          onBlur={() => touch("title")} aria-invalid={Boolean(touched.title && fieldErrors.title)} aria-describedby={fieldErrors.title ? "madi-title-feedback" : undefined} />
          <MadiFieldFeedback id="madi-title-feedback" message={fieldErrors.title} touched={touched.title} /></label>
        <label><MadiFieldLabel>기억하고 싶은 이야기 <small>{image ? "선택" : "필수"}</small></MadiFieldLabel><textarea data-madi-source="content" aria-label="기억하고 싶은 이야기" placeholder={MADI_FIELD_COPY.storyPlaceholder} maxLength={FIRST_JOURNAL_CONTENT_LIMIT} value={content} onChange={(event) => setContent(event.target.value)}
          aria-required={!image} onBlur={() => touch("content")} aria-invalid={Boolean(touched.content && fieldErrors.content)} aria-describedby={fieldErrors.content ? "madi-content-feedback" : undefined} />
          <MadiFieldFeedback id="madi-content-feedback" message={fieldErrors.content} touched={touched.content} /></label>
        </StoryFields>
        <DateField $compact={Boolean(image)}><MadiFieldLabel>날짜</MadiFieldLabel><input data-madi-source="date" aria-label="마디 날짜" type="date" max={today} value={date} onChange={(event) => { dateEdited.current = true; setDate(event.target.value); }}
          aria-required="true" onBlur={() => touch("date")} aria-invalid={Boolean(touched.date && fieldErrors.date)} aria-describedby={fieldErrors.date ? "madi-date-feedback" : undefined} />
          <MadiFieldFeedback id="madi-date-feedback" message={fieldErrors.date} touched={touched.date} /></DateField>
        <div data-madi-source="place">{placeOpen || place ? <><MadiFieldLabel>장소 <small>선택</small></MadiFieldLabel><JournalPlacePicker value={place} placeId={placeId}
          onBlur={() => touch("place")} invalid={Boolean(touched.place && fieldErrors.place)} describedBy={fieldErrors.place ? "madi-place-feedback" : undefined}
          onTextChange={value => { setPlace(value); setPlaceId(null); }}
          onChange={value => { setPlace(value.name); setPlaceId(value.id); }} />
          <MadiFieldFeedback id="madi-place-feedback" message={fieldErrors.place} touched={touched.place} /></> : <OptionalAction type="button" onClick={() => setPlaceOpen(true)}>장소 추가<small>선택</small></OptionalAction>}</div>
        <PrivacyHint>민감정보나 주민등록번호 등은 남기지 말아주세요.</PrivacyHint>
      </Fields>}
      {saved && firstPlacement ? <FirstMadiPlacement $book={Boolean(bookStep)} ref={placementScene} data-first-madi-placement data-placement-motion={bookStep ? "book" : placementOrigins ? "assemble" : undefined}>
        {bookStep && <BookBinding data-placement-binding aria-hidden="true">
          <BookLeaf data-placement-book>
            <InsideCover><span>하루마디</span><strong>{firstPlacement.title}</strong></InsideCover>
            <OutsideCover><strong>{firstPlacement.title}</strong><span>하루마디</span></OutsideCover>
          </BookLeaf>
          <RightLeaf data-placement-under-page><span>1</span></RightLeaf>
        </BookBinding>}
        <PlacedMemory $book={Boolean(bookStep)} data-placement-page><MemoryPage firstSaved compact={Boolean(bookStep)} title={saved.title} image={saved.image ? image ?? saved.image : null} content={saved.content}
          date={getKoreanDateKey(new Date(saved.visitedAt))} place={saved.placeName === "남긴 공간" ? "" : saved.placeName}
          ownerId={draftOwnerId} pets={placedPets} /></PlacedMemory>
      </FirstMadiPlacement> : (saved || stage === "preview") && <MemoryPage
        title={saved ? saved.title : title.trim()}
        image={saved ? saved.image : image}
        content={saved ? saved.content : content.trim()}
        date={saved ? getKoreanDateKey(new Date(saved.visitedAt)) : date}
        place={saved ? (saved.placeName === "남긴 공간" ? "" : saved.placeName) : place.trim()}
        ownerId={draftOwnerId}
        pets={saved ? placedPets : selectedPets}
      />}
      {bookStep?.settled && firstPlacement && onRenameFirstHarumadi && <BookNamePrompt data-placement-rename data-first-madi-reveal>
        <p>하루마디의 이름을 바꿔볼까요?</p>
        <TextButton type="button" onClick={() => onRenameFirstHarumadi(firstPlacement)}>이름 바꾸기</TextButton>
      </BookNamePrompt>}
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
      {preparingPhoto && <PrivacyHint role="status">사진을 준비하고 있어요.</PrivacyHint>}
      {!saved && localDraft.notice && <PrivacyHint role="status">{localDraft.notice}</PrivacyHint>}
    </Content>
    <Footer data-reserve-collection={showFirstSavedAction && showingPlacementGuidance ? "" : undefined}>
      {saved ? <>
        {showingPlacementGuidance ? <PlacementGuidance ref={placementGuidance} data-placement-guidance>기록을 한데 모아 볼 수 있도록 도와드릴게요.</PlacementGuidance>
          : showFirstSavedAction ? <PrimaryButton data-first-madi-action={bookStep?.settled ? "read" : undefined} data-first-madi-reveal={bookStep?.settled ? "" : undefined} type="button" onClick={() => leaveCompletedBook("read", () => onOpenSaved?.(saved))}>{saved.savedHarumadi ? "방금 남긴 쪽 보기" : "방금 남긴 마디 보기"} <ArrowRight size={16} aria-hidden="true" /></PrimaryButton>
          : <PrimaryButton data-first-madi-reveal={bookStep?.settled ? "" : undefined} type="button" onClick={finishCollection}>{inHarumadi ? "하루마디로 돌아가기" : collectionLabel} <ArrowRight size={16} aria-hidden="true" /></PrimaryButton>}
        {showFirstSavedAction && !saved.savedHarumadi && onSelectHarumadi && <TextButton type="button" onClick={() => onSelectHarumadi(saved)}>하루마디에 담기</TextButton>}
        {inHarumadi ? <TextButton type="button" onClick={startAnother}>이 하루마디에 다음 마디 남기기</TextButton>
          : saved.savedHarumadi && onContinueInHarumadi && (!firstPlacement || bookStep?.settled) ? <TextButton data-first-madi-action={bookStep?.settled ? "continue" : undefined} data-first-madi-reveal={bookStep?.settled ? "" : undefined} type="button" onClick={() => leaveCompletedBook("continue", () => onContinueInHarumadi(saved.savedHarumadi!.id))}>같은 하루마디에 다음 마디 남기기</TextButton>
            : !showFirstSavedAction && !showingPlacementGuidance && <TextButton type="button" onClick={startAnother}>다음 마디 남기기</TextButton>}
        {showFirstSavedAction && !showingPlacementGuidance && <TextButton data-first-madi-action={bookStep?.settled && collectionLabel === "내 책장으로 돌아가기" ? "shelf" : undefined} data-first-madi-reveal={bookStep?.settled ? "" : undefined} type="button" onClick={finishCollection}>{collectionLabel}</TextButton>}
      </> : stage === "photo" ? image && <PrimaryButton type="button" disabled={restoringDraft} onClick={() => setStage("write")}>이 사진으로 계속하기</PrimaryButton>
        : stage === "write" ? <>
          {inHarumadi && destinationVerified && destination && <PrivacyHint>{destination.title} · {harumadiSharingNotice(destination)}</PrivacyHint>}
          <PrimaryButton type="button" disabled={!draft || saving || saveBlocked || petProfileBusy} onClick={() => void save()}>{saving ? "마디를 저장하고 있어요…" : editingSaved ? "변경사항 저장" : image && !title.trim() && !content.trim() ? "사진으로 마디 남기기" : `${madiLabel} 남기기`}</PrimaryButton>
          <TextButton type="button" disabled={!draft || saving || restoringDraft || petProfileBusy} onClick={() => { if (!petProfileBusyRef.current) { setError(""); setStage("preview"); } }}>미리보기</TextButton>
        </>
          : <>{inHarumadi && destinationVerified && destination && <PrivacyHint>{destination.title} · {harumadiSharingNotice(destination)}</PrivacyHint>}<PrimaryButton type="button" disabled={!draft || saving || saveBlocked} onClick={() => void save()}>{saving ? "마디를 저장하고 있어요…" : editingSaved ? "이대로 수정 저장" : "이대로 마디 남기기"}</PrimaryButton><TextButton type="button" disabled={saving} onClick={() => setStage("write")}>조금 더 고치기</TextButton></>}
    </Footer>
    {cropSource && <ImageCropDialog source={cropSource} onCancel={cancelCrop} onConfirm={confirmCrop} />}
  </Frame>;
}

function MemoryPage({ title, image, content, date, place, ownerId, pets, compact = false, firstSaved = false }: { title: string; image: string | null; content: string; date: string; place: string; ownerId?: string; pets?: readonly PetProfile[]; compact?: boolean; firstSaved?: boolean }) {
  return <Page aria-label={compact ? "하루마디에 담긴 첫 마디" : firstSaved ? "방금 남긴 첫 마디" : "하루마디에 담을 마디 미리보기"}>
    {firstSaved && <PlacementLabel data-placement-label aria-hidden="true">첫 마디</PlacementLabel>}
    <PageMeta data-page-meta><span data-memory-part="date">{date.replaceAll("-", ".")}</span>{place && <span data-memory-part="place">{place}</span>}</PageMeta>
    {image && <PageImage data-page-image data-memory-part="photo"><Image src={image} alt="마디에 담은 사진" fill unoptimized sizes={compact ? "160px" : "350px"} /></PageImage>}
    {title && <PageTitle data-memory-part="title">{title}</PageTitle>}
    {content && <PageText data-memory-part="content">{content}</PageText>}
    {ownerId && pets?.length ? <div data-memory-part="pets"><MadiPetTags owner={ownerId} pets={pets} compact={firstSaved} /></div> : null}
    <PageNumber data-page-folio aria-hidden="true">1</PageNumber>
  </Page>;
}

const Frame = styled(ScreenFrame)`
  background: var(--color-surface); gap: var(--space-5);
  @keyframes first-madi-completion { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) {
    [data-first-madi-reveal] { animation: first-madi-completion 240ms ease-out; }
  }
`;
const PageTitle = styled.h2`margin: 0; font-size: 15px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere;`;
const Header = styled.header`flex: none; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; text-align: center; gap: 8px;
`;
const HeaderTitle = styled.span<{ $book?: boolean }>`${screenTitleStyles} min-width: 0; word-break: keep-all; overflow-wrap: anywhere;
  ${({ $book }) => $book && `font-size: 16px; font-weight: 600; line-height: 1.5;`}
`;
const StepCount = styled.div`font-size: 12px; color: var(--color-text-muted); display: flex; justify-content: center;`;
const Content = styled.div<{ $choosing: boolean }>`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 2px 24px; display: flex; flex-direction: column; gap: 20px; > * { flex-shrink: 0; }
  &[data-first-madi-scene] { overflow-anchor: none; }
  ${({ $choosing }) => $choosing && `padding-top: clamp(24px, 7cqh, 64px);`}
  @container app-viewport (max-height: 620px) { padding-top: 2px; gap: 16px; }
`;
const Intro = styled.div<{ $compact?: boolean }>`
  h1 { ${sectionHeadingStyles} font-family: var(--font-emotional); margin-bottom: var(--space-3); &:focus { outline: none; } }
  p { ${bodyCopyStyles} margin: 0; color: var(--color-text-muted); word-break: keep-all; }
  [data-reserved] { visibility: hidden; }
  ${({ $compact }) => $compact && `h1 { font-size: 20px; line-height: 1.5; margin-bottom: 8px; }`}
`;
const PhotoChoices = styled.div`display: grid; gap: 12px; > button { min-height: 52px; }`;
const WriteStart = styled(Button)`min-height: 52px; margin-top: 8px; border: 1px solid var(--color-border); background: var(--color-brand-100); color: var(--color-brand-1000); &:hover:not(:disabled) { background: var(--color-brand-200); }`;
const PhotoActions = styled.div`display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: -12px;`;
const OptionalAction = styled(TextButton)`min-height: 44px; display: flex; align-items: center; justify-content: flex-start; gap: 8px; width: fit-content; padding: 8px 0; color: var(--color-brand-1000); small { ${captionStyles} }`;
const StoryFields = styled.div`display: grid; gap: 20px; min-width: 0; &[hidden] { display: none; }`;
const DateField = styled.label<{ $compact: boolean }>`
  ${({ $compact }) => $compact && `&& { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; } && input { width: min(190px, 100%); min-height: 44px; padding: 8px 12px; }`}
`;
const SelectedPhoto = styled.div`position: relative; aspect-ratio: 4 / 3; border-radius: 5px; overflow: hidden; background: #f6f9fc; img { object-fit: contain; }`;
const HiddenInput = styled.input`display: none;`;
const PrivacyHint = styled.p`${captionStyles} margin: 0; min-width: 0; word-break: keep-all; overflow-wrap: anywhere;`;
const Destination = styled.div`display: grid; gap: 4px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); strong { font-size: var(--ui-body-size); font-weight: 600; overflow-wrap: anywhere; } span { ${captionStyles} }`;
const Fields = styled.fieldset<{ $photo?: boolean }>`
  margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-inline-size: 0; gap: 20px;
  label { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 8px; font-size: var(--ui-body-size); font-weight: 500; }
  small { ${captionStyles} display: inline; }
  input, textarea { ${inputControlStyles} }
  input[type="date"] { ${nativeDateInputStyles} }
  textarea { min-height: 130px; resize: vertical; }
  ${({ $photo }) => $photo && `gap: 12px;`}
`;
const PetSummary = styled.summary`
  display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 8px;
  min-height: 44px; padding: 8px 12px; border-radius: 12px; list-style: none; cursor: pointer;
  background: var(--color-secondary-100); color: var(--color-secondary-1000);
  font-size: var(--ui-body-size); font-weight: 600;
  &::-webkit-details-marker { display: none; }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
  .pet-selection { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: end; font-size: 13px; font-weight: 400; }
`;
const PetDisclosure = styled.details`
  min-width: 0;
  &[open] .pet-chevron { transform: rotate(180deg); }
  .pet-options { padding: 12px 4px 0; }
`;
const Page = styled.article`position: relative; min-height: 420px; width: 100%; display: flex; flex-direction: column; gap: 32px; padding: 28px 24px; border: 1px solid #e6edf4; border-radius: 3px; background: #fff;`;
const PageMeta = styled.div`display: flex; justify-content: space-between; gap: 20px; font-size: 10px; line-height: 1.7; > span { min-width: 0; overflow-wrap: anywhere; }`;
const PageImage = styled.div`position: relative; width: 100%; aspect-ratio: 4 / 3; flex: none; img { object-fit: contain; }`;
const PageText = styled.p`white-space: pre-wrap; font-size: 12px; line-height: 1.95; overflow-wrap: anywhere; word-break: keep-all;`;
const PageNumber = styled.span`margin-top: auto; padding-top: 20px; align-self: flex-end; font-size: 10px; color: var(--color-text-muted);`;
const PlacementLabel = styled.span`font-size: 11px; font-weight: 600; color: var(--color-brand-1000);`;
const BookBinding = styled.div`
  position: absolute; inset: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  pointer-events: none; perspective: 720px;
`;
const BookLeaf = styled.div`
  grid-column: 1; grid-row: 1; position: relative; z-index: 1; min-width: 0;
  transform-origin: right center; transform-style: preserve-3d;
`;
const CoverFace = styled.div`
  position: absolute; inset: 0; display: grid; align-content: center; gap: 7px; padding: 14px;
  border: 1px solid var(--color-border); backface-visibility: hidden;
  span { font-size: 11px; }
  strong { font-family: var(--font-emotional); font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; word-break: keep-all;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
`;
const InsideCover = styled(CoverFace)`
  border-right: 0; border-radius: 4px 0 0 4px;
  background: linear-gradient(to right, var(--color-surface) 90%, var(--color-neutral-200));
  span { color: var(--color-text-muted); }
`;
const OutsideCover = styled(CoverFace)`
  transform: rotateY(180deg); border-radius: 0 4px 4px 0;
  background: var(--color-secondary-300); color: var(--color-secondary-1000);
  strong { font-size: 17px; }
`;
const RightLeaf = styled.div`
  grid-row: 1; grid-column: 2; position: relative;
  border: 1px solid var(--color-border); border-radius: 0 4px 4px 0;
  background: linear-gradient(to right, var(--color-neutral-200), var(--color-surface) 13%);
  span { position: absolute; right: 10px; bottom: 10px; font-size: 9px; color: var(--color-text-muted); }
`;
const PlacedMemory = styled.div<{ $book: boolean }>`
  grid-column: ${({ $book }) => $book ? 2 : 1};
  position: relative; z-index: 1; min-width: 0; aspect-ratio: 148 / 210;
  container-type: inline-size; transform-origin: left top;
  > article { height: 100%; min-height: 0; padding: 7cqw; gap: 4.5cqw; border-radius: 0 4px 4px 0; }
  [data-memory-part] { transform-origin: left top; }
  [data-page-meta] { gap: 3cqw; font-size: 3.25cqw; line-height: 1.45; [data-memory-part="place"] { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
  h2, p { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }
  h2 { font-size: 4.75cqw; line-height: 1.45; -webkit-line-clamp: 2; }
  p { font-size: 4cqw; line-height: 1.65; -webkit-line-clamp: 4; }
  h2 + p { margin-top: -1cqw; }
  [data-memory-part="pets"], [data-placement-label] { font-size: 3.5cqw; line-height: 1.5; }
  [data-page-image] { max-height: 38%; img { object-fit: cover; } }
  [data-page-image] ~ p { -webkit-line-clamp: 2; }
  [data-page-folio] { padding-top: 0; font-size: 3.25cqw; }
`;
const FirstMadiPlacement = styled.div<{ $book: boolean }>`
  position: relative; width: min(100%, ${({ $book }) => $book ? 320 : 350}px); margin: 8px auto;
  display: grid; grid-template-columns: ${({ $book }) => $book ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};
`;
const BookNamePrompt = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 10px;
  p { ${bodyCopyStyles} margin: 0; }
`;
const PlacementGuidance = styled.p`
  ${sectionHeadingStyles}
  position: relative; box-sizing: border-box; inline-size: min(100%, 264px); margin: 0 auto;
  padding: 12px 22px; border: 1px solid var(--color-secondary-300);
  border-radius: 4px 0 4px 4px;
  background: var(--color-secondary-100); color: var(--color-secondary-1000);
  font-family: var(--font-emotional); font-size: 16px; font-weight: 600; line-height: 1.55;
  text-align: left; text-wrap: balance; word-break: keep-all;
  &::after {
    content: ""; position: absolute; inset-block-start: -1px; inset-inline-end: -1px;
    inline-size: 12px; block-size: 12px; pointer-events: none;
    background: linear-gradient(to bottom left, var(--color-surface) 46%, var(--color-secondary-300) 49% 55%, var(--color-secondary-200) 58%);
  }
`;
const Footer = styled.footer`
  flex: none; display: grid; gap: 6px;
  > button { white-space: normal; min-height: 48px; line-height: 1.6; }
  &[data-reserve-collection]::after { content: ""; min-height: 48px; }
`;
const ErrorMessage = styled.p`font-size: 13px; color: var(--color-danger, #b84242); line-height: 1.7;`;
