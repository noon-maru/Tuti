import { apiUrl } from "@/lib/api/apiUrl";
import { clientFetch } from "@/lib/api/clientFetch";
import { ensureSession, getSessionSnapshot, readStoredSession } from "@/lib/auth/session";
import { submitServiceTerms } from "@/lib/serviceTerms";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { parseServiceTermsDocument, type ServiceTermsOffer } from "@/shared/legal/serviceTerms";

export type InitialTermsState = {
  hasStoredSession: boolean;
  offer: ServiceTermsOffer | null;
  allowed: boolean;
};

const INITIAL_TERMS_PENDING_KEY = "tuti-initial-terms-pending";

export class InitialTermsLoadError extends Error {
  constructor(readonly hasStoredSession: boolean) {
    super("이용약관을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.");
  }
}

// 계정을 발급하는 ensureSession은 명시적인 확인 버튼을 누른 뒤에만 호출한다.
export async function loadInitialServiceTerms(): Promise<InitialTermsState> {
  const session = getSessionSnapshot() ?? await readStoredSession();
  try {
    const pending = await preferencesStorage.getItem(INITIAL_TERMS_PENDING_KEY);
    const response = await clientFetch(apiUrl("service-terms"), {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
    });
    if (!response.ok) throw new Error("이용약관을 불러오지 못했어요.");
    const status = await response.json();
    if (!status || typeof status !== "object" || !("current" in status) || typeof status.required !== "boolean") throw new Error("이용약관 응답을 확인하지 못했어요.");
    let offer: ServiceTermsOffer | null = null;
    if (status.current !== null) {
      const input = status.current;
      if (!input || typeof input.version !== "string" || !input.version.trim() ||
          typeof input.documentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.documentHash) ||
          typeof input.accepted !== "boolean" || typeof input.publishedAt !== "string" ||
          typeof input.effectiveAt !== "string" || !Number.isFinite(Date.parse(input.publishedAt)) ||
          !Number.isFinite(Date.parse(input.effectiveAt))) throw new Error("이용약관 응답을 확인하지 못했어요.");
      offer = { ...input, document: parseServiceTermsDocument(input.document) };
    } else if (status.required) throw new Error("이용약관 응답을 확인하지 못했어요.");
    // 공고 전의 기존 계정 이용은 소급 차단하지 않는다. 신규 이용자는 원문 없이 동의할 수 없다.
    return { hasStoredSession: Boolean(session), offer, allowed: offer ? Boolean(session && offer.accepted) : Boolean(session && pending !== "true") };
  } catch {
    // 실패해도 저장된 계정의 권리 행사 경로는 열어둘 수 있어야 한다.
    throw new InitialTermsLoadError(Boolean(session));
  }
}

export async function acceptInitialServiceTerms(offer: ServiceTermsOffer, confirmations: { ageConfirmed: boolean; importantTermsConfirmed: boolean }) {
  if (!confirmations.ageConfirmed || !confirmations.importantTermsConfirmed) throw new Error("필수 확인 항목을 확인해주세요.");
  await preferencesStorage.setItem(INITIAL_TERMS_PENDING_KEY, "true");
  // 계정 생성은 체크 및 명시적 버튼 클릭 이후다. 실패 시 앱 본문/분석을 시작하지 않는다.
  const session = await ensureSession();
  await submitServiceTerms(offer, confirmations);
  const state = await loadInitialServiceTerms();
  if (getSessionSnapshot()?.userId !== session.userId || !state.allowed ||
      state.offer?.documentHash !== offer.documentHash || state.offer.version !== offer.version) {
    throw new Error("동의 상태를 다시 확인해주세요. 약관이 변경되었다면 새 내용을 확인해주세요.");
  }
  await preferencesStorage.removeItem(INITIAL_TERMS_PENDING_KEY);
  return state;
}

export function isInitialTermsRightsPath(pathname: string) {
  // 약관 미동의 상태에도 기존 계정의 복구·열람·삭제·철회·문의는 유지한다.
  return ["/login", "/inquiry", "/journal", "/journal/detail", "/journal/book", "/location", "/notifications"].includes(pathname);
}
