"use client";

import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { ImageCropDialog } from "@/features/tuti/components/ImageCropDialog";
import { JournalPlacePicker } from "@/features/tuti/components/JournalPlacePicker";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { readImageMetadata } from "@/features/tuti/lib/readImageMetadata";
import { fetchNearbyPlaces } from "@/lib/tutiApi";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";
import { journalImageMaxWidth } from "@/styles/tokens";

const CROWD_OPTIONS = ["한적함", "보통", "활기참"];
const THEME_OPTIONS = [
  "걷기 좋은",
  "조용한",
  "초록이 많은",
  "사진 남기기 좋은",
  "바람 쐬기 좋은",
  "머물기 좋은",
];
const DIFFICULTY_OPTIONS = ["가벼움", "적당함", "조금 힘듦"];

type PhotoPlaceHint = {
  status: "loading" | "success" | "notice";
  message: string;
};

export type JournalEntryDraft = JournalEntryInput;

export function JournalEditorScreen({
  entry,
  initialPlace,
  onBack,
  onSubmit,
}: {
  entry?: TutiJournalEntry;
  initialPlace?: { id: string; name: string };
  onBack: () => void;
  onSubmit: (
    draft: JournalEntryDraft,
    sourceElement: HTMLElement,
  ) => void | Promise<void>;
}) {
  const imagePickerRef = useRef<HTMLLabelElement>(null);
  const hasEditedVisitDateRef = useRef(Boolean(entry));
  const hasEditedPlaceRef = useRef(
    Boolean(entry?.placeId ?? initialPlace?.id),
  );
  const imageSelectionIdRef = useRef(0);
  const [imageUrl, setImageUrl] = useState<string | null>(
    entry?.image ?? null,
  );
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crowd, setCrowd] = useState(entry?.crowd ?? "");
  const [placeId, setPlaceId] = useState<string | null>(
    entry?.placeId ?? initialPlace?.id ?? null,
  );
  const [placeName, setPlaceName] = useState(
    entry?.placeName ?? initialPlace?.name ?? "",
  );
  const [photoPlaceHint, setPhotoPlaceHint] =
    useState<PhotoPlaceHint | null>(null);
  const [theme, setTheme] = useState(entry?.theme ?? "");
  const [difficulty, setDifficulty] = useState(entry?.difficulty ?? "");
  const [visitDate, setVisitDate] = useState(() =>
    toDateInputValue(entry?.visitedAt ?? new Date()),
  );
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.content ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canSubmit = Boolean(
    title.trim() ||
      body.trim() ||
      imageUrl ||
      crowd.trim() ||
      placeName.trim() ||
      difficulty.trim(),
  );

  const selectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const selectionId = ++imageSelectionIdRef.current;

    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    event.target.value = "";

    setPhotoPlaceHint(null);

    if (
      (!entry && !hasEditedVisitDateRef.current) ||
      !hasEditedPlaceRef.current
    ) {
      void readImageMetadata(file).then(async (metadata) => {
        if (selectionId !== imageSelectionIdRef.current) return;

        if (
          metadata.captureDate &&
          !entry &&
          !hasEditedVisitDateRef.current
        ) {
          setVisitDate(metadata.captureDate);
        }

        if (!metadata.location || hasEditedPlaceRef.current) return;

        setPhotoPlaceHint({
          status: "loading",
          message: "사진 위치에서 가까운 장소를 찾고 있어요.",
        });

        try {
          const nearbyPlaces = await fetchNearbyPlaces(metadata.location);

          if (
            selectionId !== imageSelectionIdRef.current ||
            hasEditedPlaceRef.current
          ) {
            return;
          }

          const nearestPlace = nearbyPlaces[0];
          if (!nearestPlace) {
            setPhotoPlaceHint({
              status: "notice",
              message: "사진 주변에 등록된 장소가 없어 직접 선택해주세요.",
            });
            return;
          }

          setPlaceId(nearestPlace.id);
          setPlaceName(nearestPlace.name);
          setPhotoPlaceHint({
            status: "success",
            message: `사진 위치에서 약 ${formatDistance(nearestPlace.distanceMeters)} 떨어진 장소예요.`,
          });
        } catch {
          if (
            selectionId !== imageSelectionIdRef.current ||
            hasEditedPlaceRef.current
          ) {
            return;
          }
          setPhotoPlaceHint({
            status: "notice",
            message: "사진 위치로 장소를 찾지 못해 직접 선택해주세요.",
          });
        }
      });
    }
  };

  useEffect(
    () => () => {
      if (cropSource) URL.revokeObjectURL(cropSource);
    },
    [cropSource],
  );

  const closeCropper = () => {
    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const clearEditor = () => {
    imageSelectionIdRef.current += 1;
    hasEditedPlaceRef.current = false;
    setTitle("");
    setBody("");
    setImageUrl(null);
    setCrowd("");
    setPlaceId(null);
    setPlaceName("");
    setPhotoPlaceHint(null);
    setTheme("");
    setDifficulty("");
    setSubmitError(null);
  };

  const submitEditor = async () => {
    if (!canSubmit || isSubmitting || !imagePickerRef.current) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(
        {
          title: title.trim(),
          content: body.trim(),
          image: imageUrl,
          crowd: crowd.trim() || "미정",
          placeId,
          placeName: placeName.trim() || "남긴 공간",
          theme: theme.trim() || "미정",
          difficulty: difficulty.trim() || "미정",
          visitedAt: toVisitedAt(visitDate),
        },
        imagePickerRef.current,
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "기록을 저장하지 못했어요.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Frame>
      <EditorHeader>
        <BackButton
          type="button"
          aria-label="지난 공간으로 돌아가기"
          onClick={onBack}
        >
          ‹
        </BackButton>
        <h1>{entry ? "고치는 공간" : "남기는 공간"}</h1>
        <ContextMenu
          label={entry ? "기록 수정 메뉴" : "기록 작성 메뉴"}
          items={[
            {
              label: entry ? "수정 내용 비우기" : "작성 내용 비우기",
              onSelect: clearEditor,
            },
            {
              label: entry ? "수정 취소" : "작성 취소",
              onSelect: onBack,
            },
          ]}
        />
      </EditorHeader>

      <Editor data-scroll-region>
        <ImageArea>
          <ImagePicker
            ref={imagePickerRef}
            $image={imageUrl ?? undefined}
          >
            <input type="file" accept="image/*" onChange={selectImage} />
            {!imageUrl && <span aria-hidden="true">+</span>}
            <span className="visually-hidden">
              {imageUrl ? "기록 이미지 변경하기" : "기록 이미지 추가하기"}
            </span>
          </ImagePicker>
          <VisitDateInput
            type="date"
            aria-label="방문한 날짜"
            max={toDateInputValue(new Date())}
            value={visitDate}
            onChange={(event) => {
              hasEditedVisitDateRef.current = true;
              setVisitDate(event.target.value);
            }}
          />
        </ImageArea>

        <JournalPlacePicker
          placeId={placeId}
          value={placeName}
          helperText={
            photoPlaceHint?.message ??
            (!placeId
              ? "사진에 위치 정보가 있으면 가까운 장소를 자동으로 찾아요."
              : undefined)
          }
          helperStatus={photoPlaceHint?.status ?? "notice"}
          onChange={(place) => {
            hasEditedPlaceRef.current = true;
            setPlaceId(place.id);
            setPlaceName(place.name);
            setPhotoPlaceHint(null);
          }}
        />

        <Tags aria-label="기록 정보">
          <ContextMenu
            label="혼잡도 선택"
            triggerContent={crowd || "혼잡도"}
            triggerTone="brand"
            items={withCurrentOption(CROWD_OPTIONS, crowd).map(
              (option) => ({
                label: option,
                selected: option === crowd,
                onSelect: () => setCrowd(option),
              }),
            )}
          />
          <ContextMenu
            label="테마 선택"
            triggerContent={theme || "테마"}
            triggerTone="neutral"
            items={withCurrentOption(THEME_OPTIONS, theme).map((option) => ({
              label: option,
              selected: option === theme,
              onSelect: () => setTheme(option),
            }))}
            textInput={{
              label: "테마 직접 입력",
              placeholder: "나만의 테마",
              value: theme,
              onSubmit: setTheme,
            }}
          />
          <ContextMenu
            label="난이도 선택"
            triggerContent={difficulty || "난이도"}
            triggerTone="secondary"
            items={withCurrentOption(
              DIFFICULTY_OPTIONS,
              difficulty,
            ).map((option) => ({
              label: option,
              selected: option === difficulty,
              onSelect: () => setDifficulty(option),
            }))}
          />
        </Tags>

        <EditorCopy>
          <TitleInput
            aria-label="기록 제목"
            placeholder="제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <BodyInput
            aria-label="기록 내용"
            placeholder="내용"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </EditorCopy>
      </Editor>

      <EditorFooter>
        {submitError && <EditorError role="alert">{submitError}</EditorError>}
        <SubmitButton
          type="button"
          disabled={!canSubmit || isSubmitting}
          onClick={() => void submitEditor()}
        >
          {isSubmitting
            ? "저장 중..."
            : entry
              ? "수정하기"
              : "작성하기"}
        </SubmitButton>
      </EditorFooter>
      {cropSource && (
        <ImageCropDialog
          source={cropSource}
          onCancel={closeCropper}
          onConfirm={(croppedImage) => {
            setImageUrl(croppedImage);
            closeCropper();
          }}
        />
      )}
    </Frame>
  );
}

export function JournalEditorStatusScreen({
  message,
  onBack,
  loading = false,
}: {
  message: string;
  onBack: () => void;
  loading?: boolean;
}) {
  return (
    <Frame>
      <EditorHeader>
        <BackButton
          type="button"
          aria-label="지난 공간으로 돌아가기"
          onClick={onBack}
        >
          ‹
        </BackButton>
        <h1>고치는 공간</h1>
        <HeaderSpacer />
      </EditorHeader>
      <Status role={loading ? undefined : "status"}>
        {loading ? <LoadingIndicator label={message} /> : message}
      </Status>
    </Frame>
  );
}

function withCurrentOption(options: string[], currentOption: string) {
  return Array.from(
    new Set([currentOption, ...options].filter(Boolean)),
  );
}

function toDateInputValue(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toVisitedAt(value: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1_000
    ? `${Math.max(1, Math.round(distanceMeters))}m`
    : `${(distanceMeters / 1_000).toFixed(1)}km`;
}

const Frame = styled(ScreenFrame)`
  z-index: 1;
  gap: var(--space-7);
  background: var(--color-surface);
`;

const EditorHeader = styled.header`
  min-height: var(--space-9);
  display: grid;
  grid-template-columns: var(--space-11) 1fr var(--space-11);
  align-items: center;
  gap: var(--space-2);

  h1 {
    font-size: var(--font-size-500);
    font-weight: 700;
    text-align: center;
  }
`;

const BackButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: calc(var(--font-size-700) + var(--space-2));
  font-weight: 400;
  line-height: 0;
  transition: color 160ms ease, transform 160ms ease;

  &:hover {
    color: var(--color-text);
  }

  &:active {
    transform: translateX(-2px);
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-11);
  height: var(--space-11);
`;

const Editor = styled.div`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow-y: auto;
  padding: var(--space-2) 0;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
`;

const ImageArea = styled.div`
  position: relative;
  width: min(100%, ${journalImageMaxWidth}px);
  flex: 0 0 auto;
  align-self: center;
  aspect-ratio: 4 / 3;
`;

const ImagePicker = styled.label<{ $image?: string }>`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 28px;
  background-color: var(--color-secondary-500);
  background-image: ${({ $image }) => ($image ? `url(${$image})` : "none")};
  background-position: center;
  background-size: cover;
  color: var(--color-white);
  cursor: pointer;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  > span:not(.visually-hidden) {
    font-size: var(--font-size-700);
    font-weight: 700;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }
`;

const VisitDateInput = styled.input`
  position: absolute;
  bottom: var(--space-3);
  left: var(--space-3);
  z-index: 1;
  width: 132px;
  min-height: var(--space-8);
  padding: var(--space-1) var(--space-2);
  border: 1px solid rgb(var(--color-black-rgb) / 0.08);
  border-radius: 999px;
  outline: 0;
  background: rgb(var(--color-white-rgb) / 0.9);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-100);
  font-weight: 500;
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  box-shadow: 0 4px 12px rgb(var(--color-black-rgb) / 0.12);
  color-scheme: light;

  &:focus-visible {
    box-shadow: 0 0 0 2px var(--color-info),
      0 4px 12px rgb(var(--color-black-rgb) / 0.12);
  }

  &::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.64;
  }
`;

const Tags = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
`;

const EditorCopy = styled.div`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const TitleInput = styled.input`
  width: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-500);
  font-weight: 700;
  line-height: var(--line-height-heading);
  letter-spacing: var(--letter-spacing-heading);

  &::placeholder {
    color: var(--color-text);
    opacity: 1;
  }
`;

const BodyInput = styled.textarea`
  width: 100%;
  min-height: 160px;
  flex: 1;
  resize: none;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);

  &::placeholder {
    color: var(--color-text-muted);
    opacity: 1;
  }
`;

const SubmitButton = styled(PrimaryButton)`
  width: 100%;
  flex: 0 0 auto;
  font-size: var(--font-size-200);
`;

const EditorFooter = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const EditorError = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
  text-align: center;
`;

const Status = styled.div`
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;
