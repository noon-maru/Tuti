import { createRightsDeliveryTest, sendRightsDeliveryTest, sendRightsAlertTest } from "../src/server/legal/rightsDeliveryTest";

async function main() {
  if (process.argv.length > 3 || (process.argv[2] && !["--send-test", "--send-alert-test"].includes(process.argv[2]))) throw new Error("기본은 조회용이며, 운영자 메일·알림 시험만 명시적으로 허용합니다.");
  if (process.argv[2] === "--send-alert-test") { console.log(JSON.stringify(await sendRightsAlertTest())); return; }
  if (process.argv[2] === "--send-test") { console.log(JSON.stringify(await sendRightsDeliveryTest())); return; }
  const test = createRightsDeliveryTest();
  console.log(JSON.stringify({ mode: "dry-run", reference: test.reference, recipient: test.message.to, attachments: test.attachmentEvidence, smtpAccepted: false, recipientReceiptVerified: false, formalNoticeDeliveryVerified: false }));
}

main().catch(() => {
  console.error("운영자 권리 전달 시험에 실패했습니다. 메일 설정·연결을 확인해주세요. 실제 당사자에게 발송하거나 오류 원문·인증정보를 출력하지 않습니다.");
  process.exitCode = 1;
});
