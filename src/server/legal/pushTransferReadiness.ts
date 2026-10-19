export type PushProvider = "fcm" | "apns";
const noticeFields = ["recipient", "contact", "items", "timingAndMethod", "purpose", "retention", "refusal"] as const;
const references = ["contractReference", "noticeReference", "nativeVerificationReference"] as const;
const confirmedText = (value: unknown): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.length <= 4000 && !/미확정|확인 필요|미국 등|TODO|TBD/i.test(value);
const proof = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{3,100}$/.test(value);

// 이 검사는 입력한 근거의 존재·형식만 확인한다. 계약/처리 국가/전달 사실을 자동 승인하지 않는다.
export function pushTransferBlockers(provider: PushProvider, input: unknown): string[] {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const missing: string[] = [];
  for (const field of noticeFields) if (!confirmedText(value[field])) missing.push(field);
  if (!Array.isArray(value.countries) || !value.countries.length ||
      value.countries.some((country) => typeof country !== "string" || !/^[A-Z]{2}$/.test(country))) missing.push("countries");
  if (value.legalBasis !== "separate_consent" && value.legalBasis !== "contract_necessary") missing.push("legalBasis");
  for (const field of references) if (!proof(value[field])) missing.push(field);
  if (value.legalBasis === "separate_consent" && !proof(value.consentReference)) missing.push("consentReference");
  return missing.map((field) => `pushTransfer.${provider}.${field}`);
}

export function readPushProviderEvidence(input: unknown): Partial<Record<PushProvider, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const providers = (input as Record<string, unknown>).providers;
  return providers && typeof providers === "object" && !Array.isArray(providers)
    ? { fcm: (providers as Record<string, unknown>).fcm, apns: (providers as Record<string, unknown>).apns } : {};
}
