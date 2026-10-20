export function enablePrivacyLedgerEnvironment(original: string) {
  if (original.includes("\0")) throw new Error("환경 파일 형식 확인 필요");
  const key = /^[ \t]*(?:export[ \t]+)?PRIVACY_REPLAY_LEDGER_ENABLED[ \t]*=/gm;
  const matches = [...original.matchAll(key)];
  if (matches.length > 1) throw new Error("원장 환경 변수 중복 확인 필요");
  return matches.length ? original.replace(/^[ \t]*(?:export[ \t]+)?PRIVACY_REPLAY_LEDGER_ENABLED[ \t]*=.*$/m, "PRIVACY_REPLAY_LEDGER_ENABLED=true") : `${original.trimEnd()}\nPRIVACY_REPLAY_LEDGER_ENABLED=true\n`;
}
