import { isJournalPublicationPolicyEffective } from "@/shared/legal/journalPublicationPolicy";
import { preferMadiEnvironmentValue } from "@/shared/madi/environment";

export function isJournalPublicationEnabled(
  value?: string,
) {
  return value?.trim().toLowerCase() === "true";
}

export const journalPublicationEnabled = isJournalPublicationEnabled(
  preferMadiEnvironmentValue(process.env.NEXT_PUBLIC_MADI_PUBLICATION_ENABLED,
    process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED),
);

export type JournalPublicationAudience = "internal" | "public";

export function getJournalPublicationAudience(
  value?: string,
): JournalPublicationAudience {
  return value?.trim().toLowerCase() === "public" ? "public" : "internal";
}

export const journalPublicationAudience = getJournalPublicationAudience(
  preferMadiEnvironmentValue(process.env.NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE,
    process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_AUDIENCE),
);

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
