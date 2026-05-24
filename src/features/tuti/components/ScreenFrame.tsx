"use client";

import styled from "@emotion/styled";

export const ScreenFrame = styled.section`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 44px 24px 28px;

  @media (max-width: 520px) {
    padding-inline: 20px;
  }
`;
