import { apiUrl } from "@/lib/api/apiUrl";
import { clientFetch } from "@/lib/api/clientFetch";
import { ensureSession, getSessionSnapshot, readStoredSession } from "@/lib/auth/session";
import { submitServiceTerms } from "@/lib/serviceTerms";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { parseServiceTermsDocument, type ServiceTermsOffer } from "@/shared/legal/serviceTerms";
import { syncLegalPolicyRelease } from "@/shared/legal/policyRelease";
import { validateFinalizedTerms, validateFinalizedTermsReference } from "@/shared/legal/validateFinalizedTerms";
import { serviceTermsAcceptanceCache } from "./serviceTermsAcceptanceCache";

export type InitialTermsState = {
  hasStoredSession: boolean;
  offer: ServiceTermsOffer | null;
  allowed: boolean;
  acceptedTerms?: { version: string; documentHash: string };
  userId?: string;
};

const INITIAL_TERMS_PENDING_KEY = "tuti-initial-terms-pending";

export class InitialTermsLoadError extends Error {
  constructor(readonly hasStoredSession: boolean) {
    super("이용약관을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.");
  }
}

export async function startInitialServiceTerms(onCached: (state: InitialTermsState) => void, useCache = true) {
  const session = getSessionSnapshot() ?? await readStoredSession();
  if (session && useCache) {
    const cached = await serviceTermsAcceptanceCache.read(session.userId);
    const activeSession = getSessionSnapshot() ?? await readStoredSession();
    if (cached && activeSession?.userId === session.userId && activeSession.accessToken === session.accessToken) onCached({ hasStoredSession: true, userId: session.userId, offer: null, allowed: true,
      acceptedTerms: { version: cached.version, documentHash: cached.documentHash } });
  }
  return loadInitialServiceTerms();
}

// 서버가 확인한 결과만 캐시한다. 시작 시 UX 캐시 참조와 실제 동의 조회는 분리한다.
export async function loadInitialServiceTerms(): Promise<InitialTermsState> {
  const session = getSessionSnapshot() ?? await readStoredSession();
  const checkSession = async () => {
    const activeSession = getSessionSnapshot() ?? await readStoredSession();
    if (activeSession?.userId !== session?.userId || activeSession?.accessToken !== session?.accessToken) {
      throw new Error("확인 중 계정이 변경됐어요.");
    }
  };
  try {
    const response = await clientFetch(apiUrl("service-terms?scope=entry"), {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
    });
    if (!response.ok) throw new Error("이용약관을 불러오지 못했어요.");
    const status = await response.json();
    await checkSession();
    syncLegalPolicyRelease(status?.legalPolicyRelease);
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
      validateFinalizedTermsReference(input);
      if (input.accepted && status.required) throw new Error("동의 상태가 일치하지 않아요.");
      if (input.accepted && session && !("document" in input)) {
        await serviceTermsAcceptanceCache.write({ userId: session.userId, version: input.version, documentHash: input.documentHash });
        await checkSession();
        return { hasStoredSession: true, userId: session.userId, offer: null, allowed: true,
          acceptedTerms: { version: input.version, documentHash: input.documentHash } };
      }
      validateFinalizedTerms(status);
      offer = { ...input, document: parseServiceTermsDocument(input.document) };
    } else throw new Error("시행 중인 이용약관을 확인하지 못했어요.");
    if (!offer) throw new Error("시행 중인 이용약관을 확인하지 못했어요.");
    if (session) {
      if (offer.accepted) await serviceTermsAcceptanceCache.write({ userId: session.userId, version: offer.version, documentHash: offer.documentHash });
      else await serviceTermsAcceptanceCache.clear(session.userId);
      await checkSession();
    }
    return { hasStoredSession: Boolean(session), userId: session?.userId, offer, allowed: Boolean(session && offer.accepted),
      ...(session && offer.accepted ? { acceptedTerms: { version: offer.version, documentHash: offer.documentHash } } : {}) };
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
      state.acceptedTerms?.documentHash !== offer.documentHash || state.acceptedTerms.version !== offer.version) {
    throw new Error("동의 상태를 다시 확인해주세요. 약관이 변경되었다면 새 내용을 확인해주세요.");
  }
  await preferencesStorage.removeItem(INITIAL_TERMS_PENDING_KEY);
  return state;
}

export function isInitialTermsRightsPath(pathname: string) {
  // 약관 미동의 상태에도 기존 계정의 복구·열람·삭제·철회·문의는 유지한다.
  return ["/login", "/inquiry", "/journal", "/journal/detail", "/harumadi/pdf/create", "/harumadi", "/harumadi/pdfs", "/harumadi/pdf/view", "/location", "/notifications"].includes(pathname);
}

export function initialTermsEntryRedirect(pathname: string, state: InitialTermsState | null): "/entry" | null {
  if (!state || state.allowed || pathname === "/entry") return null;
  if (pathname === "/login" || pathname === "/inquiry" || (state.hasStoredSession && isInitialTermsRightsPath(pathname))) return null;
  return "/entry";
}
