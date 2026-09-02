export type InquiryStatusValue =
  | "pending"
  | "reviewing"
  | "answered"
  | "closed";

type ResolveInquiryAnswerStateInput = {
  requestedStatus: InquiryStatusValue;
  submittedResponse: string | undefined;
  previousResponse: string | null;
};

export function resolveInquiryAnswerState({
  requestedStatus,
  submittedResponse,
  previousResponse,
}: ResolveInquiryAnswerStateInput) {
  const adminResponse = normalizeResponse(
    submittedResponse === undefined ? previousResponse : submittedResponse,
  );

  if (requestedStatus === "answered" && !adminResponse) {
    return {
      ok: false as const,
      error: "답변 완료 상태에는 답변을 작성해주세요.",
    };
  }

  return {
    ok: true as const,
    adminResponse,
    status:
      adminResponse && requestedStatus !== "closed"
        ? ("answered" as const)
        : requestedStatus,
  };
}

function normalizeResponse(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
