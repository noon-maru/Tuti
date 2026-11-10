"use client";

import { useCallback, useEffect, useState } from "react";

import { PublicJournalScreen } from "@/features/tuti/screens/journal/PublicJournalScreen";
import { fetchWithSession } from "@/lib/auth/session";
import type { PublicJournalEntry } from "@/shared/api/journal";
import { PublicMadiUnavailable, readPublicMadi } from "@/lib/publicMadiRead";

export function PublicJournalFlow({ publicId }: { publicId: string }) {
  return <PublicJournalContent key={publicId} publicId={publicId} />;
}

function PublicJournalContent({ publicId }: { publicId: string }) {
  const [entry, setEntry] = useState<PublicJournalEntry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [imageFailed, setImageFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let imageUrl: string | null = null;
    const controller = new AbortController();

    const load = async () => {
      try {
        const result = await readPublicMadi(publicId, fetchWithSession, controller.signal);
        if (!active) return;
        if (result.image) imageUrl = URL.createObjectURL(result.image);
        setEntry({ ...result.entry, image: imageUrl });
        setImageFailed(result.imageFailed);
        setStatus("ready");
      } catch (error) {
        if (active) setStatus(error instanceof PublicMadiUnavailable ? "missing" : "error");
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [publicId, attempt]);

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
      loadError={status === "error"}
      imageFailed={imageFailed}
      onRetry={() => { setEntry(null); setStatus("loading"); setImageFailed(false); setAttempt(value => value + 1); }}
      onBlockAuthor={blockAuthor}
    />
  );
}
