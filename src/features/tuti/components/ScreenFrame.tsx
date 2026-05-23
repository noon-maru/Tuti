"use client";

import styled from "@emotion/styled";

export const ScreenFrame = styled.section`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 44px 24px 28px;
  animation: enter 420ms ease both;

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(10px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 520px) {
    padding-inline: 20px;
  }
`;
