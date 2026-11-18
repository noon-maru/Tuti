"use client";

import styled from "@emotion/styled";
import { madiComposeRevealStyle } from "@/shared/tuti/madiComposeReveal";

/** 전체 화면을 끌어오는 대신 가까운 위치에서 서서히 드러나는 작성 미리보기. */
export const MadiComposeRevealLayer = styled.div<{ $progress: number }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  opacity: ${({ $progress }) => madiComposeRevealStyle($progress).opacity};
  transform: ${({ $progress }) => madiComposeRevealStyle($progress).transform};
  transition: ${({ $progress }) => $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};
  @media (prefers-reduced-motion: reduce) { transform: none; transition: opacity 100ms ease; }
`;
