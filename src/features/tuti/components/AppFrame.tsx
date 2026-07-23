"use client";

import styled from "@emotion/styled";
import Image from "next/image";
import { TutiWordmark } from "@/features/tuti/components/TutiWordmark";
import { breakpoints } from "@/styles/tokens";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const nativeApp = process.env.NEXT_PUBLIC_TUTI_TARGET === "app";

  return (
    <Shell $nativeApp={nativeApp}>
      <DesktopBrand data-desktop-brand>
        <BrandIcon
          src="/brand/tuti-symbol.svg"
          alt=""
          width={72}
          height={72}
          priority
        />
        <BrandCopy>
          <p>오늘 가능한 만큼만</p>
          <BrandTitle>
            <DesktopWordmark priority />
          </BrandTitle>
          <span>
            잠깐 다른 공기로 나갈 수 있도록,
            <br />
            지금의 상태에 맞는 장소를 준비해요.
          </span>
        </BrandCopy>
        <BrandPalette aria-hidden="true">
          <i />
          <i />
          <i />
        </BrandPalette>
      </DesktopBrand>
      <AppViewport $nativeApp={nativeApp} aria-label="Tuti 앱 화면">
        {children}
      </AppViewport>
    </Shell>
  );
}

const Shell = styled.main<{ $nativeApp: boolean }>`
  position: relative;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  grid-template-columns: minmax(0, 1fr);
  padding-block: var(--space-8);
  padding-inline: 0;
  overflow: hidden;
  background: var(--color-app-background);

  @media (min-width: ${breakpoints.laptop}px) {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 0;
  }

  @media (max-width: ${breakpoints.mobile}px) {
    padding: 0;
    background: var(--color-surface);
  }

  ${({ $nativeApp }) =>
    $nativeApp &&
    `
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      padding: 0;
      background: var(--color-surface);

      [data-desktop-brand] {
        display: none;
      }
    `}
`;

const DesktopBrand = styled.aside`
  display: none;

  @media (min-width: ${breakpoints.laptop}px) {
    --desktop-brand-gap: clamp(var(--space-12), 8vw, 144px);

    position: absolute;
    top: 50%;
    right: calc(50% + 195px + var(--desktop-brand-gap));
    width: min(
      280px,
      calc(50vw - 195px - var(--desktop-brand-gap))
    );
    display: grid;
    align-content: center;
    justify-items: start;
    gap: var(--space-7);
    transform: translateY(-50%);
  }
`;

const BrandIcon = styled(Image)`
  border-radius: 18px;
  box-shadow: 0 18px 48px rgb(var(--color-black-rgb) / 0.12);
`;

const BrandCopy = styled.div`
  display: grid;
  gap: var(--space-3);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-300);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-300);
    line-height: var(--line-height-body);
  }
`;

const BrandTitle = styled.h1`
  line-height: 0;
`;

const DesktopWordmark = styled(TutiWordmark)`
  width: clamp(112px, 10vw, 160px);
  height: auto;
`;

const BrandPalette = styled.div`
  display: flex;
  gap: var(--space-2);

  i {
    width: 40px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-accent-primary);
  }

  i:nth-of-type(2) {
    background: var(--color-accent-secondary);
  }

  i:nth-of-type(3) {
    background: var(--color-accent-soft);
  }
`;

const AppViewport = styled.section<{ $nativeApp: boolean }>`
  --app-safe-area-top: 0px;
  --app-safe-area-right: 0px;
  --app-safe-area-bottom: 0px;
  --app-safe-area-left: 0px;

  position: relative;
  z-index: 1;
  width: min(100%, 390px);
  height: min(844px, calc(100vh - var(--space-16)));
  height: min(844px, calc(100dvh - var(--space-16)));
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgb(var(--color-black-rgb) / 0.14);
  border-radius: 32px;

  @supports (corner-shape: squircle) {
    border-radius: 50px;
    corner-shape: squircle;
  }

  background: var(--color-surface);
  box-shadow: 0 24px 80px rgb(var(--color-black-rgb) / 0.14);
  isolation: isolate;

  @media (max-width: ${breakpoints.mobile}px) {
    --app-safe-area-top: var(
      --safe-area-inset-top,
      env(safe-area-inset-top, 0px)
    );
    --app-safe-area-right: var(
      --safe-area-inset-right,
      env(safe-area-inset-right, 0px)
    );
    --app-safe-area-bottom: var(
      --safe-area-inset-bottom,
      env(safe-area-inset-bottom, 0px)
    );
    --app-safe-area-left: var(
      --safe-area-inset-left,
      env(safe-area-inset-left, 0px)
    );

    width: 100%;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  ${({ $nativeApp }) =>
    $nativeApp &&
    `
      --app-safe-area-top: var(
        --safe-area-inset-top,
        env(safe-area-inset-top, 0px)
      );
      --app-safe-area-right: var(
        --safe-area-inset-right,
        env(safe-area-inset-right, 0px)
      );
      --app-safe-area-bottom: var(
        --safe-area-inset-bottom,
        env(safe-area-inset-bottom, 0px)
      );
      --app-safe-area-left: var(
        --safe-area-inset-left,
        env(safe-area-inset-left, 0px)
      );

      width: 100%;
      max-width: none;
      height: 100vh;
      height: 100dvh;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    `}
`;
