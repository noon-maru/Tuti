export type PushProvider = "fcm" | "apns";
const noticeFields = ["recipient", "contact", "items", "timingAndMethod", "purpose", "retention", "refusal"] as const;
const references = ["contractReference", "noticeReference", "nativeVerificationReference"] as const;
const confirmedText = (value: unknown): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.length <= 4000 && !/미확정|확인 필요|미국 등|TODO|TBD/i.test(value);
const proof = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{3,100}$/.test(value);

function validCountryDisclosure(provider: PushProvider, value: Record<string, unknown>) {
  const codes = Array.isArray(value.countries) && value.countries.length > 0 &&
    value.countries.every(country => typeof country === "string" && /^[A-Z]{2}$/.test(country));
  if (!codes) return false;
  if (value.countryScope === undefined) return true;
  if (value.countryScope === "named_countries") return true;
  // A qualified global-service disclosure is not an assertion that US is the exhaustive list.
  // Require the qualification, provider's source and an explicit review decision together.
  const domains = provider === "fcm" ? ["firebase.google.com", "cloud.google.com", "www.google.com"] : ["www.apple.com", "developer.apple.com"];
  return value.countryScope === "global_facilities" && (value.countries as string[]).includes("US") &&
    confirmedText(value.countryScopeDescription) && proof(value.countryScopeReviewReference) &&
    Array.isArray(value.countryScopeSources) && value.countryScopeSources.length > 0 &&
    value.countryScopeSources.every(source => {
      try { const url = new URL(String(source)); return url.protocol === "https:" && !url.username && !url.password && domains.includes(url.hostname); }
      catch { return false; }
    });
}

// 이 검사는 입력한 근거의 존재·형식만 확인한다. 계약/처리 국가/전달 사실을 자동 승인하지 않는다.
export function pushTransferBlockers(provider: PushProvider, input: unknown): string[] {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const missing: string[] = [];
  for (const field of noticeFields) if (!confirmedText(value[field])) missing.push(field);
  if (!validCountryDisclosure(provider, value)) missing.push("countries");
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
