"use client";

import styled from "@emotion/styled";
import { PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";

export function OnboardingScreen({ onStart }: { onStart: () => void }) {
  return (
    <Frame>
      <BrandMark>T</BrandMark>
      <BrandText>
        <h1>Tuti</h1>
        <p>조금 다른 공기.</p>
      </BrandText>
      <BottomActions>
        <PrimaryButton onClick={onStart}>시작하기</PrimaryButton>
        <TextButton onClick={onStart}>로그인</TextButton>
      </BottomActions>
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
`;

const BrandMark = styled.div`
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-accent-soft);
  font-size: var(--font-size-600);
  font-weight: 700;
  box-shadow: 0 18px 48px rgb(var(--color-black-rgb) / 0.08);
`;

const BrandText = styled.div`
  display: grid;
  gap: var(--space-2);
  text-align: center;

  h1 {
    font-size: var(--font-size-600);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const BottomActions = styled.div`
  position: absolute;
  inset: auto var(--space-6) var(--space-14);
  display: grid;
  gap: var(--space-4);
`;
