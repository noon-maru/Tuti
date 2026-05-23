"use client";

import styled from "@emotion/styled";

export const BaseButton = styled.button`
  border: 0;
  cursor: pointer;
`;

export const PrimaryButton = styled(BaseButton)`
  min-height: 54px;
  border-radius: 999px;
  background: #24271f;
  color: #fffdf8;
  font-weight: 700;
  transition: transform 180ms ease, background 180ms ease;

  &:active {
    transform: scale(0.98);
  }
`;

export const TextButton = styled(BaseButton)`
  width: fit-content;
  justify-self: center;
  padding: 8px 16px;
  background: transparent;
  color: #68665d;
  font-size: 14px;
`;

export const SkipButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;

export const BackButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;
