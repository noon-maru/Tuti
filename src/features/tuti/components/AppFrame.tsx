"use client";

import styled from "@emotion/styled";

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
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(139, 168, 149, 0.22), transparent 34%),
    linear-gradient(135deg, #f6f4ef 0%, #e8ece4 52%, #dce5e0 100%);

  @media (max-width: 520px) {
    padding: 0;
    background: #fbfaf6;
  }
`;

const Phone = styled.section`
  position: relative;
  width: min(100%, 390px);
  height: min(860px, calc(100svh - 56px));
  min-height: 680px;
  overflow: hidden;
  border: 1px solid rgba(31, 33, 29, 0.18);
  border-radius: 34px;
  background: #fbfaf6;
  box-shadow: 0 24px 80px rgba(31, 33, 29, 0.16);

  @media (max-width: 520px) {
    width: 100%;
    height: 100svh;
    min-height: 620px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
`;
