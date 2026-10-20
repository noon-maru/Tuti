import assert from "node:assert/strict";
import test from "node:test";
import { createRightsDeliveryTest, RIGHTS_TEST_RECIPIENT, sendRightsDeliveryTest, sendRightsAlertTest } from "../src/server/legal/rightsDeliveryTest";

test("전달 시험은 고정 운영자 주소와 합성 첨부만 사용한다", () => {
  const result = createRightsDeliveryTest();
  assert.equal(result.message.to, RIGHTS_TEST_RECIPIENT);
  assert.equal(result.message.attachments.length, 2);
  for (const attachment of result.message.attachments) {
    assert.match(attachment.content, /실제.*아님/);
    assert.ok(attachment.content.includes(result.reference));
  }
  assert.throws(() => createRightsDeliveryTest("real-user@example.test"));
  assert.doesNotMatch(JSON.stringify(result), /DAUM_SMTP|PASSWORD|userId|caseId/);
});

test("SMTP 접수와 실제 수신·법정 통지 완료를 구분하고 인증정보를 결과에 포함하지 않는다", async () => {
  const env = { AUTH_EMAIL_PROVIDER: "daum-smartwork", DAUM_SMTP_USER: "synthetic-sender", DAUM_SMTP_APP_PASSWORD: "synthetic-secret", AUTH_EMAIL_FROM: "synthetic@example.test" };
  let closed = 0;
  const result = await sendRightsDeliveryTest(env, (options) => {
    assert.equal(options.host, "smtp.daum.net");
    assert.equal(options.secure, true);
    return { sendMail: async (message) => {
      assert.equal(message.to, RIGHTS_TEST_RECIPIENT);
      assert.equal(message.from, env.AUTH_EMAIL_FROM);
      return { accepted: [RIGHTS_TEST_RECIPIENT], rejected: [] };
    }, close: () => { closed++; } };
  });
  assert.equal(result.smtpAccepted, true);
  assert.equal(result.recipientReceiptVerified, false);
  assert.equal(result.formalNoticeDeliveryVerified, false);
  assert.equal(closed, 1);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|synthetic-sender|synthetic@example/);
  await assert.rejects(sendRightsDeliveryTest({ ...env, AUTH_EMAIL_PROVIDER: "other" }));
  for (const accepted of [[], ["different@example.test"]]) {
    await assert.rejects(sendRightsDeliveryTest(env, () => ({ sendMail: async () => ({ accepted }), close: () => { closed++; } })));
  }
  await assert.rejects(sendRightsDeliveryTest(env, () => ({ sendMail: async () => { throw new Error("synthetic-secret"); }, close: () => { closed++; } })));
  assert.equal(closed, 4);
});

test("운영 알림 시험은 실제 지연 경고나 사건 정보를 보내지 않고 실패를 성공으로 숨기지 않는다", async () => {
  const env = { LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "https://example.test/synthetic-secret" };
  const result = await sendRightsAlertTest(env, async (_url, options) => {
    assert.equal(options?.redirect, "error");
    assert.match(String(options?.body), /실제 신고나 처리 지연은 없으며/);
    assert.doesNotMatch(String(options?.body), /synthetic-secret|caseId|userId/);
    return new Response(null, { status: 200 });
  });
  assert.equal(result.providerAccepted, true);
  assert.equal(result.formalNoticeDeliveryVerified, false);
  await assert.rejects(sendRightsAlertTest(env, async () => new Response(null, { status: 500 })));
  await assert.rejects(sendRightsAlertTest({ LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "http://example.test" }));
});
