"use client";

import styled from "@emotion/styled";
import { useRef, useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { JournalShareDialog } from "@/features/tuti/components/JournalShareDialog";
import { JournalPublicationConsentDialog } from "@/features/tuti/components/JournalPublicationConsentDialog";
import { JournalLocationLabel } from "@/features/tuti/components/JournalLocationLabel";
import {
  useJournalEntryTransition,
  useJournalEntryTransitionTarget,
} from "@/features/tuti/components/JournalEntryTransition";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { journalImageMaxWidth, palette } from "@/styles/tokens";

export function JournalDetailScreen({
  entry,
  publicationEnabled,
  onBack,
  onDelete,
  onEdit,
  onCopyPublicLink,
  onSharePublicLink,
  onPublish,
  onUnpublish,
}: {
  entry: TutiJournalEntry;
  publicationEnabled: boolean;
  onBack: () => void;
  onCopyPublicLink: () => void | Promise<void>;
  onSharePublicLink: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onEdit: () => void;
  onPublish: () => void | Promise<void>;
  onUnpublish: () => void | Promise<void>;
}) {
  const imageRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [publicationConsentOpen, setPublicationConsentOpen] = useState(false);
  const { startTransition } = useJournalEntryTransition();
  const entryTransition = useJournalEntryTransitionTarget(
    entry.id,
    imageRef,
    "detail",
  );
  const returnToJournal = () => {
    if (!imageRef.current) {
      onBack();
      return;
    }

    startTransition({
      entryId: entry.id,
      image: entry.image ?? undefined,
      navigate: onBack,
      sourceElement: imageRef.current,
      sourceSurface: "detail",
    });
  };

  return (
    <Frame>
      <Header $hidden={!entryTransition.isContentVisible}>
        <BackButton
          type="button"
          aria-label="지난 공간으로 돌아가기"
          onClick={returnToJournal}
        >
          ‹
        </BackButton>
        <h1>{formatJournalDateLong(entry.visitedAt)}</h1>
        <ContextMenu
          label={`${entry.title} 기록 메뉴`}
          items={[
            {
              label: "수정하기",
              onSelect: onEdit,
            },
            ...(publicationEnabled && entry.publication
              ? [
                  {
                    label: "PNG로 공유하기",
                    onSelect: () => setShareOpen(true),
                  },
                  {
                    label: "웹 링크로 공유",
                    onSelect: onSharePublicLink,
                  },
                  {
                    label: "공유 링크 복사",
                    onSelect: onCopyPublicLink,
                  },
                  {
                    label: "공개 중지",
                    tone: "danger" as const,
                    onSelect: onUnpublish,
                  },
                ]
              : [
                  {
                    label: "PNG로 공유하기",
                    onSelect: () => setShareOpen(true),
                  },
                  ...(publicationEnabled
                    ? [
                        {
                          label: "인터넷에 공개",
                          onSelect: () => setPublicationConsentOpen(true),
                        },
                      ]
                    : []),
                ]),
            {
              label: "삭제하기",
              tone: "danger",
              onSelect: onDelete,
            },
            {
              label: "지난 공간으로\n돌아가기",
              onSelect: returnToJournal,
            },
          ]}
        />
      </Header>

      <Detail data-scroll-region>
        <DetailImage
          ref={imageRef}
          role="img"
          $image={entry.image ?? undefined}
          $hidden={entryTransition.isActive && !entryTransition.isSettling}
          data-journal-transition-entry-id={entry.id}
          data-journal-transition-image={entry.image ?? undefined}
          data-journal-transition-surface="detail"
          aria-label={`${entry.placeName} 기록 이미지`}
        />

        <DetailContent
          $hidden={!entryTransition.isContentVisible}
        >
          {entry.publicationStatus === "hidden" && (
            <ModerationNotice role="status">
              운영 검토로 인터넷 공개가 중지된 기록이에요. 기록은 나만 볼 수
              있으며, 재검토가 필요하면 1:1 문의로 알려주세요.
            </ModerationNotice>
          )}
          <JournalLocationLabel placeName={entry.placeName} />
          <Tags aria-label="기록 정보">
            <Tag $tone="brand">{entry.crowd}</Tag>
            <Tag $tone="neutral">{entry.theme}</Tag>
            <Tag $tone="secondary">{entry.difficulty}</Tag>
          </Tags>

          <Copy>
            <h2>{entry.title}</h2>
            <p>{entry.content}</p>
          </Copy>
        </DetailContent>
      </Detail>
      {shareOpen && (
        <JournalShareDialog
          entry={entry}
          onClose={() => setShareOpen(false)}
        />
      )}
      {publicationConsentOpen && (
        <JournalPublicationConsentDialog
          placeName={entry.placeName}
          onClose={() => setPublicationConsentOpen(false)}
          onConfirm={async () => {
            await onPublish();
          }}
        />
      )}
    </Frame>
  );
}

export function JournalDetailStatusScreen({
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
      <Header>
        <BackButton
          type="button"
          aria-label="지난 공간으로 돌아가기"
          onClick={onBack}
        >
          ‹
        </BackButton>
        <h1>지난 공간</h1>
        <HeaderSpacer />
      </Header>
      <Status role={loading ? undefined : "status"}>
        {loading ? <LoadingIndicator label={message} /> : message}
      </Status>
    </Frame>
  );
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

const Frame = styled(ScreenFrame)`
  z-index: 1;
  gap: var(--space-7);
  background: var(--color-surface);
`;

const ModerationNotice = styled.p`
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid ${palette.status.error};
  border-radius: 14px;
  background: ${palette.neutral[200]};
  color: ${palette.neutral[1100]};
  font-size: var(--font-size-200);
  line-height: 1.55;
`;

const Header = styled.header<{ $hidden?: boolean }>`
  min-height: var(--space-9);
  display: grid;
  grid-template-columns: var(--space-11) 1fr var(--space-11);
  align-items: center;
  gap: var(--space-2);
  opacity: ${({ $hidden = false }) => ($hidden ? 0 : 1)};
  transition: opacity 200ms ease 40ms;

  h1 {
    font-size: var(--font-size-400);
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

const Detail = styled.div`
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

const DetailImage = styled.div<{ $image?: string; $hidden?: boolean }>`
  width: min(100%, ${journalImageMaxWidth}px);
  flex: 0 0 auto;
  align-self: center;
  aspect-ratio: 4 / 3;
  border-radius: 28px;
  background-color: var(--color-secondary-500);
  background-image: ${({ $image }) => ($image ? `url(${$image})` : "none")};
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.16);
  opacity: ${({ $hidden = false }) => ($hidden ? 0 : 1)};

  @container app-viewport (min-width: 600px) {
    width: min(78%, 480px);
  }
`;

const DetailContent = styled.div<{ $hidden: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  opacity: ${({ $hidden }) => ($hidden ? 0 : 1)};
  transition: opacity 240ms ease 60ms;
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
  font-family: var(--font-sans);
  font-size: var(--font-size-100);
  font-stretch: 100%;
  font-weight: 400;
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Copy = styled.article`
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

const Status = styled.p`
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding-bottom: 15%;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  text-align: center;
`;
