"use client";

import styled from "@emotion/styled";
import { TextButton } from "./buttons";
import { bodyCopyStyles } from "@/shared/ui/typography";

/** 빈 목록과 조회 실패를 구분하고, 남아 있는 마디는 화면에서 유지한다. */
export function MadiLoadNotice({ onRetry, busy = false, compact = false, title }: {
  onRetry: () => void; busy?: boolean; compact?: boolean; title?: string;
}) {
  return <Notice role="alert" $compact={compact}>
    <div><strong>{title ?? (compact ? "마디를 새로 불러오지 못했어요." : "마디를 불러오지 못했어요.")}</strong>
      {!compact && <p>저장한 마디가 없어진 건 아니에요.<br />연결을 확인하고 다시 불러와주세요.</p>}</div>
    <Retry type="button" disabled={busy} onClick={onRetry}>{busy ? "불러오는 중" : "다시 불러오기"}</Retry>
  </Notice>;
}
const Notice = styled.div<{ $compact: boolean }>`
  ${bodyCopyStyles} display: flex; flex-wrap: wrap; align-items: center; justify-content: ${({ $compact }) => $compact ? "space-between" : "center"};
  gap: 8px 16px; padding: ${({ $compact }) => $compact ? "12px 16px" : "20px"}; border-radius: 16px;
  background: var(--color-brand-100); color: var(--color-brand-1000); text-align: ${({ $compact }) => $compact ? "left" : "center"};
  strong { font-weight: 600; } p { margin: 8px 0 0; }
`;
const Retry = styled(TextButton)`min-height: 44px; color: var(--color-brand-1000);`;
