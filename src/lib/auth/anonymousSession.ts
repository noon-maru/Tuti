import { apiUrl } from "@/lib/api/apiUrl";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import type {
  AnonymousSession,
  AnonymousSessionResponse,
} from "@/shared/api/anonymousSession";

const ANONYMOUS_SESSION_STORAGE_KEY = "tuti-anonymous-session";

let sessionPromise: Promise<AnonymousSession> | undefined;

export function ensureAnonymousSession() {
  sessionPromise ??= loadOrCreateAnonymousSession().catch((error) => {
    sessionPromise = undefined;
    throw error;
  });

  return sessionPromise;
}

export async function fetchWithAnonymousSession(
  path: string,
  init?: RequestInit,
) {
  const session = await ensureAnonymousSession();
  const response = await fetchWithToken(path, session.accessToken, init);

  if (response.status !== 401) return response;

  await resetAnonymousSession();
  const refreshedSession = await ensureAnonymousSession();
  return fetchWithToken(path, refreshedSession.accessToken, init);
}

async function loadOrCreateAnonymousSession() {
  const storedValue = await preferencesStorage.getItem(
    ANONYMOUS_SESSION_STORAGE_KEY,
  );
  const storedSession = parseStoredSession(storedValue);

  if (storedSession) return storedSession;

  const response = await fetch(apiUrl("anonymous-session"), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("익명 사용자를 준비하지 못했어요.");
  }

  const data = (await response.json()) as AnonymousSessionResponse;

  if (!isAnonymousSession(data.session)) {
    throw new Error("익명 사용자 응답을 확인하지 못했어요.");
  }

  await preferencesStorage.setItem(
    ANONYMOUS_SESSION_STORAGE_KEY,
    JSON.stringify(data.session),
  );

  return data.session;
}

async function resetAnonymousSession() {
  sessionPromise = undefined;
  await preferencesStorage.removeItem(ANONYMOUS_SESSION_STORAGE_KEY);
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

function parseStoredSession(value: string | null) {
  if (!value) return null;

  try {
    const session = JSON.parse(value) as unknown;
    return isAnonymousSession(session) ? session : null;
  } catch {
    return null;
  }
}

function isAnonymousSession(value: unknown): value is AnonymousSession {
  if (typeof value !== "object" || value === null) return false;

  const session = value as Partial<AnonymousSession>;
  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length >= 32 &&
    typeof session.userId === "string" &&
    session.userId.length > 0
  );
}
