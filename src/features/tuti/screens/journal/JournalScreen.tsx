"use client";

import styled from "@emotion/styled";
import { useRef, useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import type { TutiJournalEntry } from "@/shared/api/journal";

export function JournalScreen({ onBack }: { onBack: () => void }) {
  const [isComposing, setIsComposing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [localEntries, setLocalEntries] = useState<TutiJournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<TutiJournalEntry | null>(
    null,
  );
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [stackDragY, setStackDragY] = useState(0);
  const stackPointerStart = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const suppressCardClick = useRef(false);
  const { entries: seededEntries, isPending } = useTutiJournalEntries();
  const entries = [...localEntries, ...seededEntries];
  const selectedEntryIndex = entries.length
    ? activeEntryIndex % entries.length
    : 0;
  const swipeBack = useVerticalSwipeBack({ direction: "up", onBack });

  const selectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageUrl(typeof reader.result === "string" ? reader.result : null);
    });
    reader.readAsDataURL(file);
  };

  const openComposer = () => {
    setTitle("");
    setBody("");
    setImageUrl(null);
    setIsComposing(true);
  };

  const finishComposing = () => {
    const nextTitle = title.trim();
    const nextBody = body.trim();

    if (nextTitle || nextBody || imageUrl) {
      const now = new Date();
      setLocalEntries((currentEntries) => [
        {
          id: `${now.getTime()}`,
          title: nextTitle,
          content: nextBody,
          image: imageUrl,
          crowd: "미정",
          placeName: "남긴 공간",
          difficulty: "미정",
          visitedAt: now.toISOString(),
        },
        ...currentEntries,
      ]);
    }

    setIsComposing(false);
  };

  const moveStack = (direction: number) => {
    if (!entries.length) return;

    setActiveEntryIndex(
      (currentIndex) =>
        (currentIndex + direction + entries.length) % entries.length,
    );
  };

  const scrollStack = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (wheelLocked.current || Math.abs(event.deltaY) < 8) return;

    wheelLocked.current = true;
    moveStack(event.deltaY < 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLocked.current = false;
    }, 180);
  };

  const startStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;

    stackPointerStart.current = event.clientY;
    suppressCardClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stackPointerStart.current === null) return;

    const distance = event.clientY - stackPointerStart.current;
    setStackDragY(Math.max(-72, Math.min(distance, 72)));

    if (Math.abs(distance) > 8) {
      suppressCardClick.current = true;
    }
  };

  const finishStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stackPointerStart.current === null) return;

    const distance = event.clientY - stackPointerStart.current;

    if (Math.abs(distance) >= 28) {
      moveStack(distance > 0 ? 1 : -1);
      suppressCardClick.current = true;
    }

    stackPointerStart.current = null;
    setStackDragY(0);

    window.setTimeout(() => {
      suppressCardClick.current = false;
    }, 0);
  };

  const cancelStackDrag = () => {
    stackPointerStart.current = null;
    setStackDragY(0);
    suppressCardClick.current = false;
  };

  if (selectedEntry) {
    return (
      <Frame>
        <DetailHeader>
          <IconButton
            type="button"
            aria-label="지난 공간으로 돌아가기"
            onClick={() => setSelectedEntry(null)}
          >
            ‹
          </IconButton>
          <h1>{formatJournalDateLong(selectedEntry.visitedAt)}</h1>
          <MoreMenu aria-hidden="true">
            <i />
            <i />
            <i />
          </MoreMenu>
        </DetailHeader>

        <JournalDetail data-scroll-region>
          <DetailImage
            role="img"
            $image={selectedEntry.image ?? undefined}
            aria-label={`${selectedEntry.placeName} 기록 이미지`}
          />

          <Tags aria-label="기록 정보">
            <Tag $tone="brand">{selectedEntry.crowd}</Tag>
            <Tag $tone="neutral">{selectedEntry.placeName}</Tag>
            <Tag $tone="secondary">{selectedEntry.difficulty}</Tag>
          </Tags>

          <DetailCopy>
            <h2>{selectedEntry.title}</h2>
            <p>{selectedEntry.content}</p>
          </DetailCopy>
        </JournalDetail>
      </Frame>
    );
  }

  if (isComposing) {
    return (
      <Frame>
        <ComposerHeader>
          <IconButton
            type="button"
            aria-label="지난 공간으로 돌아가기"
            onClick={finishComposing}
          >
            ‹
          </IconButton>
          <h1>남기는 공간</h1>
          <MoreMenu aria-hidden="true">
            <i />
            <i />
            <i />
          </MoreMenu>
        </ComposerHeader>

        <Composer data-scroll-region>
          <ImagePicker $image={imageUrl ?? undefined}>
            <input type="file" accept="image/*" onChange={selectImage} />
            {!imageUrl && <span aria-hidden="true">+</span>}
            <span className="visually-hidden">
              {imageUrl ? "기록 이미지 변경하기" : "기록 이미지 추가하기"}
            </span>
          </ImagePicker>

          <Tags aria-label="기록 정보">
            <Tag $tone="brand">혼잡도</Tag>
            <Tag $tone="neutral">장소</Tag>
            <Tag $tone="secondary">난이도</Tag>
          </Tags>

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
        </Composer>
      </Frame>
    );
  }

  return (
    <Frame
      {...swipeBack.gestureProps}
      $dragY={swipeBack.dragY}
      $progress={swipeBack.dragProgress}
      $isDragging={swipeBack.isDragging}
    >
      <ListHeader>
        <h1>지나간 공간</h1>
        <AddButton
          type="button"
          aria-label="새로운 공간 남기기"
          onClick={openComposer}
        >
          +
        </AddButton>
      </ListHeader>

      {entries.length > 0 ? (
        <MemoryStack
          aria-label="남긴 공간"
          onWheel={scrollStack}
          onPointerDown={startStackDrag}
          onPointerMove={updateStackDrag}
          onPointerUp={finishStackDrag}
          onPointerCancel={cancelStackDrag}
        >
          {entries.map((entry, index) => {
            const relativePosition = getCircularOffset(
              index,
              selectedEntryIndex,
              entries.length,
            );

            if (Math.abs(relativePosition) > 2) return null;

            return (
              <MemoryCard
                key={entry.id}
                type="button"
                $relativePosition={relativePosition}
                $dragY={stackDragY}
                $active={index === selectedEntryIndex}
                $tone={[0, 1, 2, 1, 0][index] ?? 0}
                aria-label={
                  entry.title || `${formatJournalDate(entry.visitedAt)} 기록`
                }
                aria-pressed={index === selectedEntryIndex}
                onClick={() => {
                  if (!suppressCardClick.current) {
                    if (index === selectedEntryIndex) {
                      setSelectedEntry(entry);
                    } else {
                      setActiveEntryIndex(index);
                    }
                  }
                }}
              >
                {index === selectedEntryIndex && (
                  <CardHeader>
                    <strong>{formatJournalDate(entry.visitedAt)}</strong>
                    <CardMenu aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </CardMenu>
                  </CardHeader>
                )}
              </MemoryCard>
            );
          })}
        </MemoryStack>
      ) : isPending ? (
        <EmptyState>
          <p>지난 공간을 불러오고 있어요.</p>
        </EmptyState>
      ) : (
        <EmptyState>
          <p>여행에 대한 공기를 남겨보세요 :)</p>
        </EmptyState>
      )}
    </Frame>
  );
}

function formatJournalDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatJournalDateLong(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join(".");
}

function getCircularOffset(index: number, activeIndex: number, length: number) {
  if (length <= 1) return 0;

  let offset = index - activeIndex;
  const half = Math.floor(length / 2);

  if (offset > half) offset -= length;
  if (offset < -half) offset += length;

  return offset;
}

const Frame = styled(ScreenFrame)<{
  $dragY?: number;
  $progress?: number;
  $isDragging?: boolean;
}>`
  z-index: 1;
  gap: var(--space-7);
  background: var(--color-surface);
  opacity: ${({ $progress = 0 }) => 1 - $progress * 0.32};
  transform: translateY(${({ $dragY = 0 }) => $dragY}px)
    scale(${({ $progress = 0 }) => 1 - $progress * 0.025});
  transition: ${({ $isDragging = false }) =>
    $isDragging ? "none" : "opacity 160ms ease, transform 180ms ease"};
  overflow: hidden;
  touch-action: none;
`;

const ListHeader = styled.header`
  min-height: var(--space-9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  h1 {
    font-size: var(--font-size-400);
    font-weight: 700;
  }
`;

const AddButton = styled(BaseButton)`
  width: var(--space-9);
  height: var(--space-9);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-700);
  font-weight: 500;
  line-height: 1;
  transition: color 160ms ease, transform 160ms ease;

  &:hover {
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.9);
  }
`;

const EmptyState = styled.div`
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding-bottom: 15%;
  text-align: center;

  p {
    color: var(--color-text);
    font-size: var(--font-size-200);
  }
`;

const MemoryStack = styled.div`
  position: relative;
  min-height: 0;
  flex: 1;
  width: 100%;
`;

const MemoryCard = styled(BaseButton)<{
  $relativePosition: number;
  $dragY: number;
  $active: boolean;
  $tone: number;
}>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(calc(100% - var(--space-2)), 344px);
  aspect-ratio: 4 / 3;
  overflow: hidden;
  padding: var(--space-5);
  border: 0;
  border-radius: 28px;
  background-color: ${({ $tone }) =>
    $tone === 0
      ? "var(--color-secondary-500)"
      : $tone === 1
        ? "var(--color-brand-500)"
        : "var(--color-secondary-200)"};
  color: var(--color-white);
  text-align: left;
  box-shadow: ${({ $active }) =>
    $active
      ? "0 18px 42px rgb(var(--color-black-rgb) / 0.24)"
      : "0 8px 20px rgb(var(--color-black-rgb) / 0.16)"};
  opacity: ${({ $relativePosition }) =>
    1 - Math.min(Math.abs($relativePosition) * 0.1, 0.32)};
  transform: translate(-50%, -50%)
    translateY(
      ${({ $relativePosition, $dragY }) =>
        $relativePosition * -40 + $dragY * 0.28}px
    )
    scale(
      ${({ $relativePosition }) =>
        1 - Math.min(Math.abs($relativePosition) * 0.025, 0.08)}
    )
    rotate(
      ${({ $relativePosition }) =>
        Math.max(-2.4, Math.min($relativePosition * 1.2, 2.4))}deg
    );
  z-index: ${({ $relativePosition }) => 20 - Math.abs($relativePosition)};
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 240ms ease, box-shadow 240ms ease;
  touch-action: none;
  will-change: transform;
`;

const CardHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;

  strong {
    font-size: var(--font-size-300);
    font-weight: 600;
  }
`;

const CardMenu = styled.span`
  width: var(--space-5);
  display: grid;
  justify-content: end;
  gap: 2px;

  i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-white);
  }
`;

const ComposerHeader = styled.header`
  min-height: var(--space-9);
  display: grid;
  grid-template-columns: var(--space-9) 1fr var(--space-9);
  align-items: center;
  gap: var(--space-2);

  h1 {
    font-size: var(--font-size-400);
    font-weight: 700;
    text-align: center;
  }
`;

const DetailHeader = styled(ComposerHeader)``;

const JournalDetail = styled.div`
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

const DetailImage = styled.div<{ $image?: string }>`
  width: 100%;
  flex: 0 0 auto;
  aspect-ratio: 4 / 3;
  border-radius: 28px;
  background-color: var(--color-secondary-500);
  background-image: ${({ $image }) => ($image ? `url(${$image})` : "none")};
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.16);
`;

const DetailCopy = styled.article`
  display: grid;
  gap: var(--space-4);

  h2 {
    font-size: var(--font-size-500);
    font-weight: 700;
  }

  p {
    color: var(--color-text);
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
    white-space: pre-line;
  }
`;

const IconButton = styled(BaseButton)`
  width: var(--space-9);
  height: var(--space-9);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-700);
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

const MoreMenu = styled.span`
  width: var(--space-9);
  height: var(--space-9);
  display: grid;
  align-content: center;
  justify-content: end;
  gap: 2px;

  i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
`;

const Composer = styled.div`
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
  width: 100%;
  flex: 0 0 auto;
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

const Tag = styled.span<{ $tone: "brand" | "neutral" | "secondary" }>`
  min-width: 0;
  min-height: 24px;
  display: grid;
  place-items: center;
  padding: var(--space-1) var(--space-2);
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-500)"
      : $tone === "secondary"
        ? "var(--color-secondary-500)"
        : "var(--color-neutral-500)"};
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-overflow: ellipsis;
  white-space: nowrap;
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
