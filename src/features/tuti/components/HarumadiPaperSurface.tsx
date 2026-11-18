"use client";

import styled from "@emotion/styled";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { animateHarumadiPaperFlex } from "@/lib/harumadiPaperFlex";

/** The real content stays mounted once. Temporary strips exist only during motion. */
export function HarumadiPaperSurface({ children, opening = false, hinge = "left" }: { children: ReactNode; opening?: boolean; hinge?: "left" | "right" }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!opening || !ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return animateHarumadiPaperFlex(ref.current, "open", 900);
  }, [opening]);
  return <Surface ref={ref} data-paper-surface data-paper-hinge={hinge}><span data-paper-source>{children}</span></Surface>;
}
const Surface = styled.span`position: relative; display: block; width: 100%; aspect-ratio: 148 / 210; transform-style: preserve-3d;
  > [data-paper-source] { position: absolute; inset: 0; display: block; }
`;
