"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/tuti/hooks/useSession";
import { loadJournalBookDraft } from "@/lib/journalBookDraft";
import { fetchJournalBooks } from "@/lib/tutiApi";

export function JournalBookEntry({ hasEntries }: { hasEntries: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const { data: books = [] } = useQuery({
    queryKey: ["journal-books", session?.userId],
    queryFn: fetchJournalBooks,
    enabled: Boolean(session),
  });
  useEffect(() => {
    let active = true;
    if (session)
      void loadJournalBookDraft(session.userId)
        .then((draft) => {
          if (active) setDraftOwner(draft ? session.userId : null);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [session]);
  const hasDraft = Boolean(session && draftOwner === session.userId);
  if (!hasEntries && !hasDraft && books.length === 0) return null;
  return (
    <Button type="button" onClick={() => router.push("/journal/book")}>
      <Icon aria-hidden="true">
        <BookOpen size={18} />
      </Icon>
      <Copy>
        <strong>
          {hasDraft
            ? "만들던 기록집 이어가기"
            : books.length > 0
              ? "나의 기록집"
              : "기록집 만들기"}
        </strong>
        <span>
          {books.length > 0
            ? `완성한 기록집 ${books.length}권을 모아두었어요.`
            : "남긴 공간을 한 권으로 엮어보세요."}
        </span>
      </Copy>
      <ChevronRight size={18} aria-hidden="true" />
    </Button>
  );
}

const Button = styled.button`
  width: 100%;
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-secondary-300);
  border-radius: 18px;
  background: var(--color-secondary-100);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;

  &:hover {
    background: var(--color-secondary-200);
  }

  &:active {
    transform: scale(0.985);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }
`;

const Icon = styled.span`
  width: var(--space-9);
  height: var(--space-9);
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-secondary-300);
  color: var(--color-secondary-1000);
`;

const Copy = styled.span`
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;

  strong {
    font-size: var(--font-size-200);
    font-weight: 600;
    line-height: 1.4;
  }

  span {
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container app-viewport (max-width: 340px) {
    span {
      display: none;
    }
  }
`;
