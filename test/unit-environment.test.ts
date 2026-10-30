import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("단위 시험은 상속된 운영 DB·원장·공동작성 기본값을 사용하지 않는다", () => {
  const result = spawnSync(process.execPath, ["--import", "./test/setup-env.mjs", "-e", `
    const e = process.env;
    if (e.DATABASE_URL !== "postgresql://test:test@127.0.0.1:1/tuti_unit_test"
      || e.HARUMADI_TOGETHER_ENABLED !== "false"
      || e.PRIVACY_REPLAY_LEDGER_ENABLED !== "false"
      || e.PRIVACY_REPLAY_LEDGER_PATH !== undefined
      || e.PRIVACY_REPLAY_HMAC_SECRET !== undefined
      || e.TUTI_PRIVACY_REPLAY_OFFLINE !== undefined) process.exit(1);
    e.HARUMADI_TOGETHER_ENABLED = "true";
    if (e.HARUMADI_TOGETHER_ENABLED !== "true") process.exit(2);
  `], { env: { ...process.env, DATABASE_URL: "postgresql://synthetic:synthetic@invalid.invalid/production",
    HARUMADI_TOGETHER_ENABLED: "true", PRIVACY_REPLAY_LEDGER_ENABLED: "true",
    PRIVACY_REPLAY_LEDGER_PATH: "/synthetic-production-ledger",
    PRIVACY_REPLAY_HMAC_SECRET: "synthetic-not-a-secret", TUTI_PRIVACY_REPLAY_OFFLINE: "true" } });
  assert.equal(result.status, 0, "실제 연결 없이 합성 운영 환경 상속을 차단해야 한다");
});
