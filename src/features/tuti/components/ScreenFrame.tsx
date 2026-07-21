"use client";

import styled from "@emotion/styled";
import { breakpoints } from "@/styles/tokens";

export const ScreenFrame = styled.section`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-11) var(--space-6) var(--space-7);

  @media (max-width: ${breakpoints.mobile}px) {
    padding-inline: var(--space-5);
  }
`;
