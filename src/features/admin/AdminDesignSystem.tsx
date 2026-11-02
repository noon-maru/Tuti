"use client";

import styled from "@emotion/styled";
import { adminTheme } from "./adminTheme";

/** 관리자 라우트에만 적용한다. 앱·공개 약관 화면의 토큰은 변경하지 않는다. */
export const AdminDesignSystem = styled.div`
  ${adminTheme}
  min-width: 0;
  min-height: 100%;
  color: var(--color-text);
  background: var(--admin-page-background);

  :where(button, a, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
