// 문서 편집 버전과 실제 시행 시점을 분리한다. 날짜만 지나서는 활성화되지 않는다.
export const FINAL_LEGAL_POLICY_VERSION = "2026-10-22";
export type LegalPolicyRelease = { version: typeof FINAL_LEGAL_POLICY_VERSION; effectiveAt: string };

export function parseLegalPolicyRelease(value: unknown): LegalPolicyRelease | null {
  if (value === null || value === undefined) return null; // 구서버
  if (typeof value !== "object") throw new Error("법적 문서 적용 버전을 확인하지 못했어요.");
  const data = value as Record<string, unknown>;
  if (data.version !== FINAL_LEGAL_POLICY_VERSION || typeof data.effectiveAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(data.effectiveAt) || !Number.isFinite(Date.parse(data.effectiveAt))) {
    throw new Error("지원하지 않는 법적 문서 적용 버전이에요. 앱 업데이트를 확인해주세요.");
  }
  return { version: data.version, effectiveAt: data.effectiveAt };
}

export function configuredLegalPolicyRelease(env: Record<string, string | undefined>, now = new Date()): LegalPolicyRelease | null {
  if (!env.TUTI_LEGAL_POLICY_RELEASE) return null;
  const release = parseLegalPolicyRelease({ version: env.TUTI_LEGAL_POLICY_RELEASE, effectiveAt: env.TUTI_LEGAL_POLICY_EFFECTIVE_AT });
  if (!release || Date.parse(release.effectiveAt) > now.getTime()) throw new Error("법적 문서 전환은 실제 시행 시점 이후에 명시적으로 실행해야 합니다.");
  return release;
}

let clientRelease: LegalPolicyRelease | null | undefined;
export function getClientLegalPolicyRelease() { return clientRelease; }
const listeners = new Set<() => void>();
let serverKey: string | undefined;
let serverRelease: LegalPolicyRelease | null = null;
export function getLegalPolicyRelease() {
  if (typeof window !== "undefined") return clientRelease ?? null;
  const key = JSON.stringify([process.env.TUTI_LEGAL_POLICY_RELEASE, process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT]);
  if (key !== serverKey) {
    serverRelease = configuredLegalPolicyRelease(process.env);
    serverKey = key;
  }
  return serverRelease;
}
export function syncLegalPolicyRelease(value: unknown) {
  const next = parseLegalPolicyRelease(value);
  if (JSON.stringify(clientRelease) === JSON.stringify(next)) return;
  clientRelease = next;
  listeners.forEach(listener => listener());
}
export function subscribeLegalPolicyRelease(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function legalPolicyDate(release: LegalPolicyRelease) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(release.effectiveAt));
}
