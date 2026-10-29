// 새 이름이 명시되면 빈 값·false도 우선한다. 이전 배포의 env는 전환 동안만 호환한다.
export function preferMadiEnvironmentValue(current?: string, legacy?: string) {
  return current ?? legacy;
}

export function madiShareTraceSecret(environment: Record<string, string | undefined>) {
  return environment.MADI_SHARE_TRACE_SECRET?.trim() ||
    environment.JOURNAL_SHARE_TRACE_SECRET?.trim() ||
    environment.AUTH_EMAIL_CODE_SECRET?.trim();
}
