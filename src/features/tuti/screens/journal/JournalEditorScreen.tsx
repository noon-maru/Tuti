"use client";

import styled from "@emotion/styled";
import { useMemo, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { journalImageMaxWidth } from "@/styles/tokens";

const CROWD_OPTIONS = ["한적함", "보통", "활기참"];
const DIFFICULTY_OPTIONS = ["가벼움", "적당함", "조금 힘듦"];

export type JournalEntryDraft = Pick<
  TutiJournalEntry,
  "content" | "crowd" | "difficulty" | "image" | "placeName" | "title"
>;

export function JournalEditorScreen({
  entry,
  onBack,
  onSubmit,
}: {
  entry?: TutiJournalEntry;
  onBack: () => void;
  onSubmit: (draft: JournalEntryDraft) => void | Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    entry?.image ?? null,
  );
  const [crowd, setCrowd] = useState(entry?.crowd ?? "");
  const [placeName, setPlaceName] = useState(entry?.placeName ?? "");
  const [difficulty, setDifficulty] = useState(entry?.difficulty ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.content ?? "");
  const { entries } = useTutiJournalEntries();
  const { places } = useTutiRecommendations();
  const placeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...places.map((place) => place.name),
          ...entries.map((journalEntry) => journalEntry.placeName),
        ]),
      )
        .filter(Boolean)
        .slice(0, 3),
    [entries, places],
  );
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

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageUrl(typeof reader.result === "string" ? reader.result : null);
    });
    reader.readAsDataURL(file);
  };

  const clearEditor = () => {
    setTitle("");
    setBody("");
    setImageUrl(null);
    setCrowd("");
    setPlaceName("");
    setDifficulty("");
  };

  const submitEditor = () => {
    if (!canSubmit) return;

    void onSubmit({
      title: title.trim(),
      content: body.trim(),
      image: imageUrl,
      crowd: crowd.trim() || "미정",
      placeName: placeName.trim() || "남긴 공간",
      difficulty: difficulty.trim() || "미정",
    });
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
        <ImagePicker $image={imageUrl ?? undefined}>
          <input type="file" accept="image/*" onChange={selectImage} />
          {!imageUrl && <span aria-hidden="true">+</span>}
          <span className="visually-hidden">
            {imageUrl ? "기록 이미지 변경하기" : "기록 이미지 추가하기"}
          </span>
        </ImagePicker>

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
            label="장소 선택"
            triggerContent={placeName || "장소"}
            triggerTone="neutral"
            items={withCurrentOption(
              placeOptions.length > 0 ? placeOptions : ["남긴 공간"],
              placeName,
            ).map((option) => ({
              label: option,
              selected: option === placeName,
              onSelect: () => setPlaceName(option),
            }))}
            textInput={{
              label: "장소 직접 입력",
              placeholder: "직접 입력",
              value: placeName,
              onSubmit: setPlaceName,
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

      <SubmitButton
        type="button"
        disabled={!canSubmit}
        onClick={submitEditor}
      >
        {entry ? "수정하기" : "작성하기"}
      </SubmitButton>
    </Frame>
  );
}

export function JournalEditorStatusScreen({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
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
      <Status role="status">{message}</Status>
    </Frame>
  );
}

function withCurrentOption(options: string[], currentOption: string) {
  return Array.from(
    new Set([currentOption, ...options].filter(Boolean)),
  );
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

const ImagePicker = styled.label<{ $image?: string }>`
  position: relative;
  width: min(100%, ${journalImageMaxWidth}px);
  flex: 0 0 auto;
  align-self: center;
  aspect-ratio: 4 / 3;
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

const Status = styled.div`
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;
