"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { BackButton, BaseButton, ButtonLink, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { WelcomeHarumadiSample } from "./WelcomeHarumadiSample";
import { WELCOME_GUIDE, type WelcomeGuideStep } from "@/shared/tuti/welcomeGuide";
import type { WelcomeHarumadiOrigin } from "@/shared/tuti/welcomeHarumadi";

export function WelcomeScreen({ onRecord, onExplore, guideStep, onGuideOpen, onGuideNext, onGuideBack, onBookOpen }: {
  onRecord: () => void;
  onExplore: () => void;
  guideStep: WelcomeGuideStep | null;
  onGuideOpen: () => void;
  onGuideNext: () => void;
  onGuideBack: () => void;
  onBookOpen: (origin: WelcomeHarumadiOrigin | null) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const harumadiPdf = useRef<HTMLButtonElement>(null);
  const guide = guideStep === null ? null : WELCOME_GUIDE[guideStep];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [guideStep]);

  useEffect(() => {
    if (guideStep === null) return;
    const onBack = (event: Event) => {
      event.preventDefault();
      onGuideBack();
    };
    window.addEventListener(ANDROID_BACK_EVENT, onBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onBack);
  }, [guideStep, onGuideBack]);

  return <Frame key={guideStep ?? "welcome"} aria-labelledby="welcome-heading" data-welcome-screen>
    <Header>
      {guide ? <BackButton aria-label="이용 방법 이전 화면" onClick={onGuideBack} /> : <GuideButton type="button" onClick={onGuideOpen}>이용 방법</GuideButton>}
      {guide ? <StepCount>{guideStep! + 1} / {WELCOME_GUIDE.length}</StepCount> : <ButtonLink href="/login" $tone="text" $size="compact">로그인</ButtonLink>}
    </Header>
    <Copy>
      <h1 id="welcome-heading" ref={heading} tabIndex={-1}>{guide ? guide.title : "기억하고 싶은 하루를,\n한 마디씩 남겨요."}</h1>
      <p>{guide ? guide.description : "사진 한 장, 짧은 이야기면 충분해요."}</p>
    </Copy>
    <Visual>
      {guideStep === 1 ? <StoryExample aria-label="사진과 짧은 이야기 예시">
        <StoryPhoto><Image src="/welcome/shared-afternoon-example.webp" alt="함께 커피를 마신 오후의 사진 예시" fill sizes="220px" /></StoryPhoto>
        <p>별일 없던 오후도,<br />함께라서 좋았어.</p>
      </StoryExample> : guideStep === 0 ? <PhotoExample>
        <Image src="/welcome/shared-afternoon-example.webp" alt="두 사람이 함께한 오후의 사진 예시" fill sizes="(max-width: 600px) 70vw, 280px" />
      </PhotoExample> : <HarumadiFigure>
        <HarumadiButton ref={harumadiPdf} type="button" aria-label="하루마디 예시 펼쳐보기" onClick={() => {
          const sheet = harumadiPdf.current?.querySelector('[data-harumadi-pdf-sample]');
          const rect = sheet?.getBoundingClientRect();
          onBookOpen(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
        }}>
          <SamplePulse>
            <WelcomeHarumadiSample page="page" priority />
          </SamplePulse>
        </HarumadiButton>
        <OpenHint aria-hidden="true"><BookOpen size={14} />하루마디 예시 펼쳐보기</OpenHint>
      </HarumadiFigure>}
    </Visual>
    <Actions>
      {guide ? <>
        <NextButton type="button" onClick={guideStep === 2 ? onRecord : onGuideNext}>{guideStep === 2 ? "첫 마디 남기기" : "다음"}</NextButton>
        <SubButton type="button" onClick={guideStep === 2 ? onExplore : onRecord}>{guideStep === 2 ? "가까운 공간 둘러보기" : "바로 첫 마디 남기기"}</SubButton>
      </> : <>
        <NextButton type="button" onClick={onRecord}>첫 마디 남기기</NextButton>
        <ExploreButton type="button" onClick={onExplore}>가까운 공간 둘러보기</ExploreButton>
      </>}
    </Actions>
  </Frame>;
}

const appear = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;
const Frame = styled(ScreenFrame)`
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: clamp(12px, 2cqh, 20px);
  background: var(--color-surface);
  overflow: hidden;
  animation: ${appear} 240ms ease-out both;
  @container app-viewport (max-height: 500px) and (min-aspect-ratio: 1/1) {
    --screen-padding-top: calc(12px + var(--app-safe-area-top, 0px));
    --screen-padding-bottom: calc(12px + var(--app-safe-area-bottom, 0px));
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px 16px;
    > header { grid-column: 1 / -1; }
    > div:last-of-type { grid-column: 1 / -1; }
  }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
`;
const GuideButton = styled(TextButton)`min-height: 40px; padding-inline: 0; font-size: 12px; font-weight: 400; color: var(--color-text-muted);`;
const StepCount = styled.span`font-size: var(--font-size-100); color: var(--color-text-muted);`;
const Copy = styled.div`
  h1 {
    margin: 0 0 var(--space-3);
    font-size: clamp(24px, 4.2cqh, 30px);
    font-weight: 600;
    line-height: 1.45;
    letter-spacing: var(--letter-spacing-heading);
    white-space: pre-line;
    word-break: keep-all;
    &:focus { outline: none; }
  }
  p {
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
    color: var(--color-text-muted);
    white-space: pre-line;
    word-break: keep-all;
  }
  @container app-viewport (max-height: 500px) and (min-aspect-ratio: 1/1) {
    h1 { font-size: var(--font-size-500); margin-bottom: var(--space-2); }
    p { font-size: var(--font-size-100); }
  }
`;
const Visual = styled.div`
  display: grid;
  place-items: center;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
`;
const HarumadiFigure = styled.figure`
  width: 100%; height: 100%;
  min-height: 0; margin: 0;
  container-type: size;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px;
  @container app-viewport (max-height: 500px) and (min-aspect-ratio: 1/1) { gap: 8px; }
`;
const invite = keyframes`
  0%, 100% { transform: translateY(0); }
  45% { transform: translateY(-4px); }
`;
const HarumadiButton = styled(BaseButton)`
  position: relative; min-height: 0; min-width: 0;
  width: min(calc(100cqw - 40px), calc((100cqh - 64px) * 148 / 210), 250px);
  aspect-ratio: 148 / 210; padding: 0;
  background: transparent; border-radius: 2px;
  flex-shrink: 0;
  &:hover > span, &:focus-visible > span { animation-play-state: paused; }
  &:active > span { animation: none; transform: scale(0.985); }
  @container app-viewport (max-height: 500px) and (min-aspect-ratio: 1/1) {
    width: min(calc(100cqw - 12px), calc((100cqh - 36px) * 148 / 210), 180px);
  }
`;
const SamplePulse = styled.span`
  position: relative; display: block; width: 100%; border: 1px solid var(--color-border);
  transform-origin: center 75%;
  animation: ${invite} 1.8s cubic-bezier(0.22, 0.61, 0.36, 1) 650ms 1;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const OpenHint = styled.span`
  flex-shrink: 0; pointer-events: none;
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--color-text-muted);
  font-size: 11px; font-weight: 400; line-height: 1.5; white-space: nowrap;
  @container app-viewport (max-height: 520px) { font-size: 10px; }
`;
const PhotoExample = styled.div`
  position: relative; width: min(100%, 280px); height: min(100%, 280px);
  min-height: 0; border-radius: 20px; overflow: hidden;
  img { object-fit: cover; }
`;
const StoryExample = styled.div`
  width: min(100%, 260px); max-height: 300px; min-height: 0; height: 100%;
  display: grid; grid-template-rows: minmax(0, 1fr) auto;
  gap: var(--space-4); padding: var(--space-4);
  border-radius: 20px; background: var(--color-secondary-200);
  p { font-size: var(--font-size-200); line-height: var(--line-height-body); }
`;
const StoryPhoto = styled.div`position: relative; min-height: 0; overflow: hidden; border-radius: 5px; img { object-fit: cover; }`;
const Actions = styled.div`
  display: grid; gap: var(--space-1);
  @container app-viewport (max-height: 500px) and (min-aspect-ratio: 1/1) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > button:first-of-type { grid-column: 1 / -1; }
    > button:last-child:nth-child(2) { grid-column: 1 / -1; }
  }
`;
const NextButton = styled(PrimaryButton)`
  width: 100%; min-height: 52px;
  background: var(--color-brand-800);
  white-space: normal; line-height: 1.5;
  &:hover { background: var(--color-brand-900); }
`;
const SubButton = styled(TextButton)`min-height: 44px; font-size: var(--font-size-100); white-space: normal; line-height: 1.5;`;
const ExploreButton = styled(SubButton)`color: var(--color-brand-900);`;
