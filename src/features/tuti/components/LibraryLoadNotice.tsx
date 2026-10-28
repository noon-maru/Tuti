"use client";

import styled from "@emotion/styled";
import { BaseButton } from "./buttons";

/** 이미 표시된 책장을 가리지 않는, 추가 조회·새로고침 실패 안내. */
export function LibraryLoadNotice({ nextPage, busy, onRetry }: {
  nextPage: boolean; busy: boolean; onRetry: () => void;
}) {
  return <Notice role="status" aria-live="polite">
    <span>{nextPage ? "나머지 하루마디를 잠시 불러오지 못했어요." : "책장을 새로 불러오지 못했어요."}</span>
    <Retry type="button" disabled={busy} onClick={onRetry}>{busy ? "불러오는 중…" : "다시 시도"}</Retry>
  </Notice>;
}

const Notice = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  gap: 0 12px; margin: 0 8px 12px; padding: 4px 8px;
  border-top: 1px solid #e8ede4; color: var(--color-text-muted);
  font-size: 13px; line-height: 1.7; text-align: center;
`;
const Retry = styled(BaseButton)`
  flex: none; min-height: 44px; padding: 8px 4px; background: transparent;
  color: var(--color-text-muted); font-size: 13px; font-weight: 500;
  text-decoration: underline; text-underline-offset: 3px;
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; border-radius: 4px; }
`;
