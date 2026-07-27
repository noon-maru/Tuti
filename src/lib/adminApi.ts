import { fetchWithSession } from "@/lib/auth/session";

export async function fetchAdminJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithSession(`admin/${path}`, init);

  if (!response.ok) {
    throw new AdminApiError(
      await readError(response),
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function adminJsonRequest(
  method: "DELETE" | "PATCH" | "POST",
  body: unknown,
): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string"
      ? body.error
      : "관리자 요청을 처리하지 못했습니다.";
  } catch {
    return "관리자 요청을 처리하지 못했습니다.";
  }
}
