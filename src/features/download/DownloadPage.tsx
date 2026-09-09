"use client";

import styled from "@emotion/styled";
import { Apple, ArrowLeft, ArrowUpRight, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { breakpoints } from "@/styles/tokens";

const IOS_URL = "https://apps.apple.com/kr/app/tuti/id6474651880";
const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.noonmaru.tuti";

export function DownloadPage() {
  return (
    <Page>
      <Header>
        <HomeLink href="/" aria-label="Tuti 메인으로 돌아가기">
          <ArrowLeft aria-hidden="true" />
          <span>돌아가기</span>
        </HomeLink>
        <Wordmark
          src="/brand/tuti-wordmark.svg"
          alt="Tuti"
          width={115}
          height={46}
          priority
        />
        <HeaderSpacer aria-hidden="true" />
      </Header>

      <Main>
        <Intro>
          <Eyebrow>앱 다운로드</Eyebrow>
          <h1>
            오늘의 다른 공기를
            <br />
            더 가까이 두세요.
          </h1>
          <p>
            Tuti를 설치하면 알림을 받고,
            <br />
            남겨둔 공간과 기록을 더 편하게 이어볼 수 있어요.
          </p>
        </Intro>

        <StoreRail aria-label="Tuti 앱 스토어 다운로드">
          <StoreCard $tone="brand">
            <PlatformHeading>
              <PlatformIcon $tone="brand"><Apple aria-hidden="true" /></PlatformIcon>
              <div>
                <span>iPhone · iPad</span>
                <strong>App Store</strong>
              </div>
            </PlatformHeading>
            <QrFrame>
              <Image
                src="/download/tuti-ios-qr.svg"
                alt="Tuti App Store 다운로드 QR 코드"
                width={264}
                height={264}
              />
            </QrFrame>
            <StoreLink href={IOS_URL} target="_blank" rel="noreferrer">
              App Store에서 받기
              <ArrowUpRight aria-hidden="true" />
            </StoreLink>
          </StoreCard>

          <RailMark aria-hidden="true">
            <i />
            <i />
            <i />
          </RailMark>

          <StoreCard $tone="secondary">
            <PlatformHeading>
              <PlatformIcon $tone="secondary"><Play aria-hidden="true" /></PlatformIcon>
              <div>
                <span>Android</span>
                <strong>Google Play</strong>
              </div>
            </PlatformHeading>
            <QrFrame>
              <Image
                src="/download/tuti-android-qr.svg"
                alt="Tuti Google Play 다운로드 QR 코드"
                width={264}
                height={264}
              />
            </QrFrame>
            <StoreLink href={ANDROID_URL} target="_blank" rel="noreferrer">
              Google Play에서 받기
              <ArrowUpRight aria-hidden="true" />
            </StoreLink>
          </StoreCard>
        </StoreRail>

        <Footnote>
          휴대폰 카메라로 QR 코드를 비추거나 스토어 버튼을 눌러주세요.
        </Footnote>
      </Main>
    </Page>
  );
}

const Page = styled.div`
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  background: var(--color-neutral-200);
  color: var(--color-text);

  @media (max-width: ${breakpoints.mobile}px) {
    background: var(--color-surface);
  }
`;

const Header = styled.header`
  width: min(100% - 40px, 1120px);
  min-height: 84px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  margin-inline: auto;
  border-bottom: 1px solid var(--color-neutral-400);

  @media (max-width: ${breakpoints.tablet}px) {
    width: min(100% - 32px, 1120px);
    min-height: 72px;
  }
`;

const HomeLink = styled(Link)`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 600;

  svg {
    width: 18px;
    height: 18px;
  }

  @media (max-width: ${breakpoints.tablet}px) {
    span {
      display: none;
    }
  }
`;

const Wordmark = styled(Image)`
  width: 68px;
  height: auto;

  @media (max-width: ${breakpoints.mobile}px) {
    width: 60px;
  }
`;

const HeaderSpacer = styled.span``;

const Main = styled.main`
  width: min(100% - 40px, 1120px);
  display: grid;
  justify-items: center;
  margin-inline: auto;
  padding: clamp(52px, 7vw, 88px) 0 clamp(56px, 8vw, 104px);

  @media (max-width: ${breakpoints.tablet}px) {
    width: min(100% - 32px, 520px);
    padding-top: var(--space-10);
  }
`;

const Intro = styled.section`
  display: grid;
  justify-items: center;
  text-align: center;

  h1 {
    margin-top: var(--space-3);
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  p {
    margin-top: var(--space-5);
    color: var(--color-text-muted);
    font-size: clamp(0.95rem, 1.7vw, 1.125rem);
    line-height: 1.7;
  }

  @media (max-width: ${breakpoints.mobile}px) {
    h1 {
      font-size: clamp(1.8rem, 9vw, 2.35rem);
    }
  }
`;

const Eyebrow = styled.span`
  color: var(--color-brand-700);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const StoreRail = styled.section`
  position: relative;
  width: min(100%, 780px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
  align-items: center;
  margin-top: clamp(44px, 7vw, 76px);

  @media (max-width: ${breakpoints.tablet}px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
`;

const StoreCard = styled.article<{ $tone: "brand" | "secondary" }>`
  position: relative;
  z-index: 1;
  min-width: 0;
  display: grid;
  gap: var(--space-5);
  padding: clamp(20px, 3vw, 28px);
  border: 1px solid
    ${({ $tone }) =>
      $tone === "brand"
        ? "var(--color-brand-300)"
        : "var(--color-secondary-400)"};
  border-radius: 24px;
  background: var(--color-surface);
  box-shadow: 0 18px 56px rgb(var(--color-black-rgb) / 0.08);

  @media (max-width: ${breakpoints.tablet}px) {
    width: min(100%, 360px);
    justify-self: center;
  }

  @media (max-width: ${breakpoints.mobile}px) {
    border-radius: 20px;
    box-shadow: none;
  }
`;

const PlatformHeading = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);

  > div:last-of-type {
    display: grid;
    gap: 1px;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-300);
    font-weight: 700;
  }
`;

const PlatformIcon = styled.div<{ $tone: "brand" | "secondary" }>`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-200)"
      : "var(--color-secondary-200)"};
  color: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-900)"
      : "var(--color-secondary-900)"};

  svg {
    width: 21px;
    height: 21px;
    stroke-width: 1.9;
  }
`;

const QrFrame = styled.div`
  aspect-ratio: 1;
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-neutral-400);
  border-radius: 18px;
  background: white;

  img {
    width: 100%;
    height: 100%;
  }
`;

const StoreLink = styled.a`
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: 999px;
  background: var(--color-neutral-1200);
  color: white;
  font-size: var(--font-size-100);
  font-weight: 700;
  transition: transform 180ms ease, background 180ms ease;

  svg {
    width: 17px;
    height: 17px;
  }

  &:hover {
    background: var(--color-brand-900);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const RailMark = styled.div`
  display: grid;
  justify-items: stretch;
  gap: 5px;

  i {
    height: 4px;
    background: var(--color-brand-400);
  }

  i:nth-of-type(2) {
    background: var(--color-accent-bridge);
  }

  i:nth-of-type(3) {
    background: var(--color-secondary-500);
  }

  @media (max-width: ${breakpoints.tablet}px) {
    width: 48px;
    margin-inline: auto;
    padding-block: var(--space-3);
    transform: rotate(90deg);
  }
`;

const Footnote = styled.p`
  margin-top: var(--space-7);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
`;
