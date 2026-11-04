"use client";

import styled from "@emotion/styled";
import { captionStyles } from "@/shared/ui/typography";

/** 빈 초기 입력은 안내로, 사용자가 다룬 필드의 문제만 오류로 표시한다. */
export function MadiFieldFeedback({ id, message, touched = false }: { id: string; message?: string; touched?: boolean }) {
  return message ? <Feedback id={id} $error={touched} role="status">{message}</Feedback> : null;
}

const Feedback = styled.span<{ $error: boolean }>`
  ${captionStyles} display: block; margin: 0;
  color: ${({ $error }) => $error ? "var(--color-danger, #b84242)" : "var(--color-text-muted)"};
`;
