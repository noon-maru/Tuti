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
