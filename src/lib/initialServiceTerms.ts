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

// 상태 조회는 계정을 발급하지 않는다. 전환 전 일반 서비스 부트스트랩은 기존 흐름을 따른다.
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
    if ("enforcementEnabled" in status && typeof status.enforcementEnabled !== "boolean") throw new Error("이용약관 전환 상태를 확인하지 못했어요.");
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
    // 서버의 명시적 비활성 응답은 기존 이용 흐름을 허용하는 것이지 동의 영수증이 아니다.
    // 실제 운영 구서버의 빈 응답만 호환한다. 조회 장애·손상 응답을 비활성으로 추정하지 않는다.
    const legacyInactive = !("enforcementEnabled" in status) && status.current === null && status.upcoming === null && status.required === false && pending !== "true";
    const enforcementDisabled = status.enforcementEnabled === false || legacyInactive;
    return { hasStoredSession: Boolean(session), offer, allowed: enforcementDisabled || Boolean(session && offer?.accepted) };
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
  if (getSessionSnapshot()?.userId !== session.userId || !state.allowed || !state.offer?.accepted ||
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
