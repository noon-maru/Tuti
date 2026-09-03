import { isJournalPublicationPolicyEffective } from "@/shared/legal/journalPublicationPolicy";

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
  now: Date = new Date(),
) {
  if (!enabled || !role) return false;
  if (role === "admin") return true;
  return audience === "public" && isJournalPublicationPolicyEffective(now);
}
