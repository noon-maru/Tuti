import { AccountAuthError } from "@/server/auth/session";

export function assertAccountAuthEnabled() {
  if (process.env.ACCOUNT_AUTH_ENABLED === "true") return;

  throw new AccountAuthError(
    "계정 로그인 기능을 준비하고 있어요.",
    "account_auth_disabled",
    503,
  );
}

export function getRequiredAuthEnv(name: string) {
  const value = process.env[name]?.trim();

  if (value) return value;

  throw new AccountAuthError(
    "인증 공급자 설정이 완료되지 않았어요.",
    "auth_provider_not_configured",
    503,
  );
}
