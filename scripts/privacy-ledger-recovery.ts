import { privacyReplayEnabled } from "../src/server/legal/privacyReplayLedger";
import { savePrivacyReplayRecovery, verifyPrivacyReplayRecovery } from "../src/server/legal/privacyReplayRecovery";

try {
  if (process.getuid?.() !== 0 || !privacyReplayEnabled() || process.argv.length !== 3 || !["--snapshot", "--verify"].includes(process.argv[2])) throw new Error("운영 전용 실행 조건이 필요합니다.");
  const result = process.argv[2] === "--snapshot" ? await savePrivacyReplayRecovery("/recovery") : await verifyPrivacyReplayRecovery("/recovery");
  console.log(JSON.stringify(result));
} catch {
  console.error("원장·키 복구 사본을 검증하지 못했습니다. 키나 사본 내용을 출력하지 말고 전용 경로·권한을 점검해주세요.");
  process.exitCode = 1;
}
