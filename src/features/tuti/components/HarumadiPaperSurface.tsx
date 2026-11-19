"use client";

import styled from "@emotion/styled";
import type { ReactNode } from "react";

/** Preserve the page geometry without deforming or cloning its content. */
export function HarumadiPaperSurface({ children }: { children: ReactNode }) {
  return <Surface data-paper-surface><span data-paper-source>{children}</span></Surface>;
}
const Surface = styled.span`position: relative; display: block; width: 100%; aspect-ratio: 148 / 210; transform-style: preserve-3d;
  > [data-paper-source] { position: absolute; inset: 0; display: block; }
`;
