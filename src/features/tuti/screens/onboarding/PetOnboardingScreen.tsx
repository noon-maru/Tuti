"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { ScreenFrame } from "../../components/ScreenFrame";
import { TextButton } from "../../components/buttons";
import { PetProfiles } from "../../components/PetProfiles";

export function PetOnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const onBusyChange = useCallback((value: boolean) => { saving.current = value; setBusy(value); }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <Frame aria-labelledby="pet-onboarding-title" data-pet-onboarding>
    <header>
      <h1 id="pet-onboarding-title" ref={heading} tabIndex={-1}>함께하는 반려동물을<br />알려주세요</h1>
      <p>함께 살아가는 날들을 남겨볼까요?<br />프로필은 나중에도 추가하거나 바꿀 수 있어요.</p>
    </header>
    <Content data-scroll-region>
      <PetProfiles registrationOnly onRegistered={onComplete} onBusyChange={onBusyChange} />
    </Content>
    <Footer><TextButton type="button" disabled={busy} onClick={() => { if (!saving.current) onComplete(); }}>건너뛰기</TextButton></Footer>
  </Frame>;
}
const Frame = styled(ScreenFrame)`
  gap: 24px; background: var(--color-surface);
  header { flex: none; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; line-height: 1.45; letter-spacing: -0.02em; }
  h1:focus { outline: none; }
  header p { margin: 12px 0 0; font-size: 14px; line-height: 1.7; color: var(--color-text-muted); }
  @container app-viewport (max-height: 620px) { gap: 16px; h1 { font-size: 22px; } }
`;
const Content = styled.main`flex: 1; min-height: 0; overflow-y: auto; padding: 2px 4px 12px; margin: 0 -4px; > p { font-size: 14px; line-height: 1.7; color: var(--color-text-muted); margin: 0 0 16px; }`;
const Footer = styled.footer`flex: none; display: flex; justify-content: center; button { min-height: 44px; font-size: 14px; color: var(--color-text-muted); }`;
