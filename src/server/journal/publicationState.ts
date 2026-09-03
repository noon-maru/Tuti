export type JournalPublicationState = {
  publicId: string | null;
  publishedAt: Date | null;
  publicationStatus: "private" | "pending" | "published" | "hidden";
};

export function isJournalEntryPublic(
  entry: JournalPublicationState,
) {
  return (
    entry.publicationStatus === "published" &&
    Boolean(entry.publicId && entry.publishedAt)
  );
}

export function canOwnerPublishJournalEntry(
  status: JournalPublicationState["publicationStatus"],
) {
  return status !== "hidden";
}

export function getJournalModerationTransition(
  status: JournalPublicationState["publicationStatus"],
  action: "hide" | "restore",
) {
  if (action === "hide" && status === "published") {
    return { expectedStatus: "published", nextStatus: "hidden" } as const;
  }

  if (action === "restore" && status === "hidden") {
    return { expectedStatus: "hidden", nextStatus: "published" } as const;
  }

  return null;
}
