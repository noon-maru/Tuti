export function isJournalPublicationEnabled(
  value = process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}

export const journalPublicationEnabled = isJournalPublicationEnabled();
