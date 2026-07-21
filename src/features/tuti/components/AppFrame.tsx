"use client";

import styled from "@emotion/styled";
import { breakpoints } from "@/styles/tokens";

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Phone aria-label="Tuti prototype">{children}</Phone>
    </Shell>
  );
}

const Shell = styled.main`
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: var(--space-7);
  background: var(--color-app-background);

  @media (max-width: ${breakpoints.mobile}px) {
    padding: 0;
    background: var(--color-surface);
  }
`;

const Phone = styled.section`
  position: relative;
  width: min(100%, 390px);
  height: min(860px, calc(100svh - 56px));
  min-height: 680px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-black-rgb) / 0.14);
  border-radius: 34px;
  background: var(--color-surface);
  box-shadow: 0 24px 80px rgb(var(--color-black-rgb) / 0.14);

  @media (max-width: ${breakpoints.mobile}px) {
    width: 100%;
    height: 100svh;
    min-height: 620px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
`;
