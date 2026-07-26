import { apiUrl } from "@/lib/api/apiUrl";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import type {
  EmailCodeRequestResponse,
  EmailCodeVerification,
  EmailCodeVerificationResult,
  OAuthProvider,
  OAuthStartResponse,
  SessionResponse,
  TutiSession,
} from "@/shared/api/session";

const SESSION_STORAGE_KEY = "tuti-session";
const LEGACY_SESSION_STORAGE_KEY = "tuti-anonymous-session";

let sessionPromise: Promise<TutiSession> | undefined;
let sessionSnapshot: TutiSession | null = null;
const sessionListeners = new Set<() => void>();

export function ensureSession() {
  sessionPromise ??= loadOrCreateSession().catch((error) => {
    sessionPromise = undefined;
    throw error;
  });

  return sessionPromise;
}

export async function fetchWithSession(
  path: string,
  init?: RequestInit,
) {
  const session = await ensureSession();
  const response = await fetchWithToken(path, session.accessToken, init);

  if (response.status !== 401) return response;

  await clearStoredSession();
  const refreshedSession = await ensureSession();
  return fetchWithToken(path, refreshedSession.accessToken, init);
}

export function getSessionSnapshot() {
  return sessionSnapshot;
}

export function subscribeToSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export async function requestEmailLoginCode(email: string) {
  const response = await fetchWithSession("auth/email/request-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "인증코드를 보내지 못했어요."),
    );
  }

  return (await response.json()) as EmailCodeRequestResponse;
}

export async function verifyEmailLoginCode(
  input: EmailCodeVerification,
) {
  const response = await fetchWithSession("auth/email/verify-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "인증코드를 확인하지 못했어요."),
    );
  }

  const data = (await response.json()) as EmailCodeVerificationResult;

  if (data.status === "journal-resolution-required") {
    return data;
  }

  if (
    data.status !== "authenticated" ||
    !isTutiSession(data.session) ||
    !data.session.account
  ) {
    throw new Error("계정 응답을 확인하지 못했어요.");
  }

  await storeSession(data.session);
  return data;
}

export async function createOAuthLoginUrl(provider: OAuthProvider) {
  const response = await fetchWithSession(
    `auth/oauth/${provider}/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ returnTo: "/" }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "소셜 로그인을 시작하지 못했어요."),
    );
  }

  const data = (await response.json()) as OAuthStartResponse;

  if (!data.authorizationUrl) {
    throw new Error("소셜 로그인 주소를 확인하지 못했어요.");
  }

  return data.authorizationUrl;
}

export async function logoutAccount() {
  const currentSession = await ensureSession();
  const response = await fetchWithToken(
    "auth/logout",
    currentSession.accessToken,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(await readApiError(response, "로그아웃하지 못했어요."));
  }

  const data = (await response.json()) as SessionResponse;
  await storeSession(data.session);
  return data.session;
}

async function loadOrCreateSession() {
  const [storedValue, legacyStoredValue] = await Promise.all([
    preferencesStorage.getItem(SESSION_STORAGE_KEY),
    preferencesStorage.getItem(LEGACY_SESSION_STORAGE_KEY),
  ]);
  const storedSession =
    parseStoredSession(storedValue) ??
    parseStoredSession(legacyStoredValue);

  if (storedSession) {
    if (!storedValue) {
      await storeSession(storedSession);
      await preferencesStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } else {
      updateSessionSnapshot(storedSession);
    }

    return storedSession;
  }

  const response = await fetch(apiUrl("anonymous-session"), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("사용자를 준비하지 못했어요.");
  }

  const data = (await response.json()) as SessionResponse;

  if (!isTutiSession(data.session)) {
    throw new Error("사용자 응답을 확인하지 못했어요.");
  }

  await storeSession(data.session);
  return data.session;
}

async function clearStoredSession() {
  sessionPromise = undefined;
  await Promise.all([
    preferencesStorage.removeItem(SESSION_STORAGE_KEY),
    preferencesStorage.removeItem(LEGACY_SESSION_STORAGE_KEY),
  ]);
  updateSessionSnapshot(null);
}

async function storeSession(session: TutiSession) {
  sessionPromise = Promise.resolve(session);
  await preferencesStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
  updateSessionSnapshot(session);
}

function updateSessionSnapshot(session: TutiSession | null) {
  sessionSnapshot = session;
  sessionListeners.forEach((listener) => listener());
}

function fetchWithToken(
  path: string,
  accessToken: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(apiUrl(path), {
    ...init,
    headers,
  });
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

function parseStoredSession(value: string | null) {
  if (!value) return null;

  try {
    const session = JSON.parse(value) as unknown;
    return isTutiSession(session) ? session : null;
  } catch {
    return null;
  }
}

function isTutiSession(value: unknown): value is TutiSession {
  if (typeof value !== "object" || value === null) return false;

  const session = value as Partial<TutiSession>;
  const accountValid =
    session.account === undefined ||
    (typeof session.account === "object" &&
      session.account !== null &&
      (session.account.email === undefined ||
        typeof session.account.email === "string") &&
      Array.isArray(session.account.providers) &&
      session.account.providers.every((provider) =>
        ["email", "apple", "google", "kakao"].includes(provider),
      ));

  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length >= 32 &&
    typeof session.userId === "string" &&
    session.userId.length > 0 &&
    accountValid
  );
}
