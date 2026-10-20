import { BackupVerificationError, verifyBackupFiles } from "../src/server/legal/backupVerification";

if (process.argv.length !== 2) {
  console.error("고정된 읽기 전용 /backup 경로만 검증합니다.");
  process.exitCode = 1;
} else {
  verifyBackupFiles("/backup").then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error("선택한 백업의 무결성 검증에 실패했습니다. 원문·객체 키를 출력하지 말고 점검해주세요.");
    console.error(JSON.stringify(error instanceof BackupVerificationError
      ? { stage: error.stage, reason: error.reason }
      : { stage: "unknown", reason: "VERIFICATION_FAILED" }));
    process.exitCode = 1;
  });
}
