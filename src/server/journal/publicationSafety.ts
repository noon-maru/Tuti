export type JournalPublicationReviewReason =
  | "image_review_required"
  | "external_image_not_publishable"
  | "contact_information"
  | "external_link"
  | "unsafe_language"
  | "sexual_or_exploitative_content"
  | "hate_or_harassment"
  | "threat_or_self_harm"
  | "spam_pattern"
  | "content_changed_after_publication";

export type JournalPublicationSafetyInput = {
  title: string;
  content: string;
  image: string | null;
  placeName?: string;
  crowd?: string;
  theme?: string;
  difficulty?: string;
};

const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?82[- ]?)?0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/;
const LINK_PATTERN = /(?:https?:\/\/|www\.|(?:instagram|kakao|telegram)\s*[:：])/i;
const UNSAFE_LANGUAGE_PATTERN = /(?:씨발|시발|개새끼|병신|죽여|자살해)/i;
const SEXUAL_OR_EXPLOITATIVE_PATTERN =
  /(?:포르노|야동|음란|성매매|강간|아동\s*성|nudes?|porn|sex\s*video)/i;
const HATE_OR_HARASSMENT_PATTERN =
  /(?:혐오|비하|열등한|박멸|꺼져라|hate\s*speech|racial\s*slur)/i;
const THREAT_OR_SELF_HARM_PATTERN =
  /(?:죽여|죽인다|살해|해치(?:겠다|고)|폭파|테러|자살해|suicide|kill\s+(?:you|them)|bomb\s+threat)/i;
const REPEATED_CHARACTER_PATTERN = /(.)\1{9,}/u;

export function assessJournalPublicationSafety({
  title,
  content,
  image,
  placeName = "",
  crowd = "",
  theme = "",
  difficulty = "",
}: JournalPublicationSafetyInput) {
  const text = [title, content, placeName, crowd, theme, difficulty]
    .join("\n")
    .normalize("NFKC");
  const reasons: JournalPublicationReviewReason[] = [];

  if (image) reasons.push("image_review_required");
  if (image && !image.startsWith("journal-images/")) {
    reasons.push("external_image_not_publishable");
  }
  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)) {
    reasons.push("contact_information");
  }
  if (LINK_PATTERN.test(text)) reasons.push("external_link");
  if (UNSAFE_LANGUAGE_PATTERN.test(text)) reasons.push("unsafe_language");
  if (SEXUAL_OR_EXPLOITATIVE_PATTERN.test(text)) {
    reasons.push("sexual_or_exploitative_content");
  }
  if (HATE_OR_HARASSMENT_PATTERN.test(text)) {
    reasons.push("hate_or_harassment");
  }
  if (THREAT_OR_SELF_HARM_PATTERN.test(text)) {
    reasons.push("threat_or_self_harm");
  }
  if (REPEATED_CHARACTER_PATTERN.test(text)) reasons.push("spam_pattern");

  return {
    decision: reasons.length === 0 ? "allow" : "review",
    reasons,
  } as const;
}
