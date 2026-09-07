"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import styled from "@emotion/styled";
import { useSession } from "@/features/tuti/hooks/useSession";
import { loadJournalBookDraft } from "@/lib/journalBookDraft";

export function JournalBookEntry({ hasEntries }: { hasEntries: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
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
  if (!hasEntries && !hasDraft) return null;
  return (
    <Button type="button" onClick={() => router.push("/journal/book")}>
      <BookOpen size={16} aria-hidden="true" />
      {hasDraft ? "만들던 기록집" : "기록집 만들기"}
    </Button>
  );
}

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 4px 0;
  background: transparent;
  border: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  &:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }
`;
