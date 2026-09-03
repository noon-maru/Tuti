export type JournalPublicationReviewReason =
  | "image_review_required"
  | "contact_information"
  | "external_link"
  | "unsafe_language"
  | "spam_pattern"
  | "content_changed_after_publication";

export type JournalPublicationSafetyInput = {
  title: string;
  content: string;
  image: string | null;
};

const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?82[- ]?)?0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/;
const LINK_PATTERN = /(?:https?:\/\/|www\.|(?:instagram|kakao|telegram)\s*[:：])/i;
const UNSAFE_LANGUAGE_PATTERN = /(?:씨발|시발|개새끼|병신|죽여|자살해)/i;
const REPEATED_CHARACTER_PATTERN = /(.)\1{9,}/u;

export function assessJournalPublicationSafety({
  title,
  content,
  image,
}: JournalPublicationSafetyInput) {
  const text = `${title}\n${content}`.normalize("NFKC");
  const reasons: JournalPublicationReviewReason[] = [];

  if (image) reasons.push("image_review_required");
  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)) {
    reasons.push("contact_information");
  }
  if (LINK_PATTERN.test(text)) reasons.push("external_link");
  if (UNSAFE_LANGUAGE_PATTERN.test(text)) reasons.push("unsafe_language");
  if (REPEATED_CHARACTER_PATTERN.test(text)) reasons.push("spam_pattern");

  return {
    decision: reasons.length === 0 ? "allow" : "review",
    reasons,
  } as const;
}
