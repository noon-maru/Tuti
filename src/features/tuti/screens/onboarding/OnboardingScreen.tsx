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
  gap: 24px;
`;

const BrandMark = styled.div`
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(31, 33, 29, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 42px;
  font-weight: 800;
  box-shadow: 0 18px 48px rgba(31, 33, 29, 0.08);
`;

const BrandText = styled.div`
  display: grid;
  gap: 8px;
  text-align: center;

  h1 {
    font-size: 38px;
    line-height: 1.05;
    letter-spacing: 0;
  }

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }
`;

const BottomActions = styled.div`
  position: absolute;
  inset: auto 24px 56px;
  display: grid;
  gap: 16px;
`;
