"use client";

import styled from "@emotion/styled";
import { useRef, useState } from "react";
import { BackButton } from "@/features/tuti/components/buttons";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { JournalShareDialog } from "@/features/tuti/components/JournalShareDialog";
import { JournalLocationLabel } from "@/features/tuti/components/JournalLocationLabel";
import {
  useJournalEntryTransition,
  useJournalEntryTransitionTarget,
} from "@/features/tuti/components/JournalEntryTransition";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { journalImageMaxWidth, palette } from "@/styles/tokens";
import { screenTitleStyles, bodyCopyStyles } from "@/shared/ui/typography";
import { MadiLoadNotice } from "@/features/tuti/components/MadiLoadNotice";

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
  onWithdrawSensitive,
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
  onWithdrawSensitive?: () => void | Promise<void>;
}) {
  const imageRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
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
          aria-label="나의 마디로 돌아가기"
          onClick={returnToJournal}
        />
        <h1>{formatJournalDateLong(entry.visitedAt)}</h1>
        <ContextMenu
          label={`${entry.title.trim() || "남겨둔 이야기"} 마디 메뉴`}
          items={[
            ...(entry.sensitiveContent && onWithdrawSensitive ? [{
              label: entry.sensitiveWithdrawnAt ? "철회한 마디 정리 재시도" : "민감정보 동의 철회",
              onSelect: onWithdrawSensitive,
            }] : []),
            {
              label: "수정하기",
              onSelect: onEdit,
            },
            {
              label: "마디 공유하기",
              onSelect: () => setShareOpen(true),
            },
            {
              label: "삭제하기",
              tone: "danger",
              onSelect: onDelete,
            },
            {
              label: "나의 마디로 돌아가기",
              onSelect: returnToJournal,
            },
          ]}
        />
      </Header>

      <Detail data-scroll-region>
        {entry.image && <DetailImage
          ref={imageRef}
          role="img"
          $image={entry.image ?? undefined}
          $hidden={entryTransition.isActive && !entryTransition.isSettling}
          data-journal-transition-entry-id={entry.id}
          data-journal-transition-image={entry.image ?? undefined}
          data-journal-transition-surface="detail"
          aria-label={`${entry.title.trim() || "마디"} 사진`}
        />}

        <DetailContent
          $hidden={!entryTransition.isContentVisible}
        >
          {entry.publicationStatus === "hidden" && (
            <ModerationNotice role="status">
              운영 검토로 인터넷 공개가 중지된 마디예요. 마디는 나만 볼 수
              있으며, 재검토가 필요하면 1:1 문의로 알려주세요.
            </ModerationNotice>
          )}
          {entry.sensitiveContent && <ModerationNotice role="status">{entry.sensitiveWithdrawnAt
            ? "동의 철회로 마디와 하루마디를 정리하고 있어요."
            : "민감정보 처리에 별도로 동의한 나만의 마디예요. 웹 링크로는 공개할 수 없어요."}</ModerationNotice>}
          {entry.placeName.trim() && entry.placeName.trim() !== "남긴 공간" && <DetailLocation placeName={entry.placeName} />}

          <Copy>
            {entry.title.trim() && <h2>{entry.title}</h2>}
            {entry.content.trim() && <p>{entry.content}</p>}
          </Copy>
        </DetailContent>
      </Detail>
      {shareOpen && (
        <JournalShareDialog
          entry={entry}
          publicationEnabled={publicationEnabled}
          onClose={() => setShareOpen(false)}
          onCopyPublicLink={onCopyPublicLink}
          onPublish={onPublish}
          onSharePublicLink={onSharePublicLink}
          onUnpublish={onUnpublish}
        />
      )}
    </Frame>
  );
}

export function JournalDetailStatusScreen({
  message,
  onBack,
  loading = false,
  onRetry,
}: {
  message: string;
  onBack: () => void;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Frame>
      <Header>
        <BackButton
          type="button"
          aria-label="나의 마디로 돌아가기"
          onClick={onBack}
        />
        <h1>나의 마디</h1>
        <HeaderSpacer />
      </Header>
      {onRetry ? <MadiLoadNotice title={message} onRetry={onRetry} /> : <Status role={loading ? undefined : "status"}>
        {loading ? <LoadingIndicator label={message} /> : message}
      </Status>}
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
    ${screenTitleStyles}
    text-align: center;
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
  border-radius: 16px;
  background-color: var(--color-brand-100);
  background-image: ${({ $image }) => ($image ? `url(${$image})` : "none")};
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.16);
  opacity: ${({ $hidden = false }) => ($hidden ? 0 : 1)};

  @container app-viewport (min-width: 600px) {
    width: min(78%, 480px);
  }
`;

const DetailContent = styled.div<{ $hidden: boolean }>`
  width: min(100%, 68ch);
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  opacity: ${({ $hidden }) => ($hidden ? 0 : 1)};
  transition: opacity 240ms ease 60ms;
`;

const DetailLocation = styled(JournalLocationLabel)`align-items: flex-start; > span:last-child { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }`;

const Copy = styled.article`
  display: grid;
  gap: var(--space-4);

  h2 {
    ${screenTitleStyles}
  }

  p {
    ${bodyCopyStyles}
    color: var(--color-text);
    font-size: max(1rem, var(--ui-body-size));
    line-height: 1.85;
    overflow-wrap: anywhere;
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
