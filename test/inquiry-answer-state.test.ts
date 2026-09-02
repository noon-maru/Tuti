import assert from "node:assert/strict";
import test from "node:test";
import { resolveInquiryAnswerState } from "../src/server/inquiries/answerState";

test("답변을 작성하면 문의 상태를 답변 완료로 맞춘다", () => {
  assert.deepEqual(
    resolveInquiryAnswerState({
      requestedStatus: "pending",
      submittedResponse: " 확인 후 수정했습니다. ",
      previousResponse: null,
    }),
    {
      ok: true,
      status: "answered",
      adminResponse: "확인 후 수정했습니다.",
    },
  );
});

test("종결 상태의 답변은 종결 상태를 유지한다", () => {
  assert.deepEqual(
    resolveInquiryAnswerState({
      requestedStatus: "closed",
      submittedResponse: "안내를 완료했습니다.",
      previousResponse: null,
    }),
    {
      ok: true,
      status: "closed",
      adminResponse: "안내를 완료했습니다.",
    },
  );
});

test("답변이 없는 문의를 답변 완료로 저장하지 않는다", () => {
  assert.deepEqual(
    resolveInquiryAnswerState({
      requestedStatus: "answered",
      submittedResponse: "   ",
      previousResponse: null,
    }),
    {
      ok: false,
      error: "답변 완료 상태에는 답변을 작성해주세요.",
    },
  );
});
