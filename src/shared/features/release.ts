export function isJournalPublicationEnabled(
  value = process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}

export const journalPublicationEnabled = isJournalPublicationEnabled();

export type JournalPublicationAudience = "internal" | "public";

export function getJournalPublicationAudience(
  value = process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_AUDIENCE,
): JournalPublicationAudience {
  return value?.trim().toLowerCase() === "public" ? "public" : "internal";
}

export const journalPublicationAudience = getJournalPublicationAudience();

export function canAccountPublishJournal(
  role: "user" | "admin" | undefined,
  enabled = journalPublicationEnabled,
  audience = journalPublicationAudience,
) {
  if (!enabled) return false;
  return audience === "public" || role === "admin";
}
