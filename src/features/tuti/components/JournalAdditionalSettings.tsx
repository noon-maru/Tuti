"use client";

import styled from "@emotion/styled";
import type { ReactNode } from "react";

export function JournalAdditionalSettings({ children, available = false, initiallyOpen = false, includesSensitive = false }: {
  children?: ReactNode;
  available?: boolean;
  initiallyOpen?: boolean;
  includesSensitive?: boolean;
}) {
  return <Settings>
    <p>민감정보나 주민등록번호 등은 남기지 말아주세요.</p>
    {available && <details open={initiallyOpen || undefined}>
      <summary>추가 설정{includesSensitive && <span> · 민감정보 포함</span>}</summary>
      {children}
    </details>}
  </Settings>;
}

const Settings = styled.div`
  margin-top: 12px;
  > p { margin: 0; color: var(--color-text-muted); font-size: 11px; font-weight: 400; line-height: 1.7; word-break: keep-all; }
  > details > summary {
    width: fit-content; min-height: 44px; display: list-item; align-content: center;
    color: var(--color-text-muted); font-size: 12px; font-weight: 400; cursor: pointer;
    &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 3px; border-radius: 4px; }
    > span { font-size: 11px; }
  }
`;
