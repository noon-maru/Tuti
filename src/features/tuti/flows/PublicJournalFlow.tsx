"use client";

import { useCallback, useEffect, useState } from "react";

import { PublicJournalScreen } from "@/features/tuti/screens/journal/PublicJournalScreen";
import { fetchWithSession } from "@/lib/auth/session";
import type {
  PublicJournalEntry,
  PublicJournalEntryResponse,
} from "@/shared/api/journal";

export function PublicJournalFlow({ publicId }: { publicId: string }) {
  const [entry, setEntry] = useState<PublicJournalEntry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    let imageUrl: string | null = null;

    const load = async () => {
      try {
        const response = await fetchWithSession(
          `public/journal-entries/${encodeURIComponent(publicId)}`,
        );
        if (!response.ok) throw new Error("missing");
        const data = (await response.json()) as PublicJournalEntryResponse;
        let nextEntry = data.entry;

        if (nextEntry.image) {
          const imageResponse = await fetchWithSession(
            nextEntry.image.replace(/^\/api\//, ""),
          );
          if (imageResponse.ok) {
            imageUrl = URL.createObjectURL(await imageResponse.blob());
            nextEntry = { ...nextEntry, image: imageUrl };
          } else {
            nextEntry = { ...nextEntry, image: null };
          }
        }

        if (!active) {
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          return;
        }
        setEntry(nextEntry);
        setStatus("ready");
      } catch {
        if (active) setStatus("missing");
      }
    };

    void load();
    return () => {
      active = false;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [publicId]);

  const blockAuthor = useCallback(async () => {
    const response = await fetchWithSession("journal-author-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId }),
    });
    if (!response.ok) throw new Error("작성자를 차단하지 못했어요.");
    setEntry(null);
    setStatus("missing");
  }, [publicId]);

  return (
    <PublicJournalScreen
      entry={entry}
      loading={status === "loading"}
      onBlockAuthor={blockAuthor}
    />
  );
}
