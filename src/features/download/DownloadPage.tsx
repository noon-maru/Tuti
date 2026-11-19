"use client";

import styled from "@emotion/styled";
import { Apple, ArrowUpRight, ChevronDown, Play } from "lucide-react";
import Image from "next/image";
import { breakpoints, palette } from "@/styles/tokens";
import { BackLink, baseControlStyles } from "@/features/tuti/components/buttons";
import { WelcomeHarumadiSample } from "@/features/tuti/components/HarumadiSheet";

const stores = [
  { name: "App Store", platform: "iPhone · iPad", url: "https://apps.apple.com/kr/app/tuti/id6474651880", qr: "/download/tuti-ios-qr.svg", Icon: Apple },
  { name: "Google Play", platform: "Android", url: "https://play.google.com/store/apps/details?id=com.noonmaru.tuti", qr: "/download/tuti-android-qr.svg", Icon: Play },
] as const;

export function DownloadPage() {
  return <Page>
    <Header>
      <BackLink href="/" aria-label="Tuti 메인으로 돌아가기" />
      <Wordmark src="/brand/tuti-wordmark.svg" alt="Tuti" width={115} height={46} priority />
    </Header>
    <Main>
      <Hero>
        <Intro>
          <h1>일상을 추억으로,<br />추억을 한 권으로.</h1>
          <p>반려동물과 함께한 순간도, 나만의 하루도.<br />사진 한 장이나 짧은 글로 마디를 남겨보세요.</p>
        </Intro>
        <Install aria-label="Tuti 앱 다운로드">
          <StoreLinks>
            {stores.map(({ name, platform, url, Icon }) => <Store key={name}>
              <span>{platform}</span>
              <StoreLink href={url} target="_blank" rel="noopener noreferrer" aria-label={`${name}에서 Tuti 받기 (새 창)`}>
                <Icon size={20} aria-hidden="true" />{name}에서 받기<ArrowUpRight size={16} aria-hidden="true" />
              </StoreLink>
            </Store>)}
          </StoreLinks>
          <QrDisclosure>
            <summary>QR 코드로 다운로드<ChevronDown size={16} aria-hidden="true" /></summary>
            <QrList>
              {stores.map(({ name, qr }) => <QrItem key={name}>
                <Image src={qr} alt={`Tuti ${name} 다운로드 QR 코드`} width={264} height={264} />
                <figcaption>{name}</figcaption>
              </QrItem>)}
            </QrList>
            <QrHelp>휴대폰 카메라로 QR 코드를 비춰주세요.</QrHelp>
          </QrDisclosure>
        </Install>
        <Memory aria-label="하루마디 지면 예시">
          <Sample><WelcomeHarumadiSample page="page" priority /></Sample>
          <figcaption>마디가 모이면, 한 권의 하루마디.</figcaption>
        </Memory>
      </Hero>
      <Footnote>
        <p>가까운 사람과 함께 채우고, PDF로 간직할 수 있어요.</p>
        <WebLink href="/">먼저 웹에서 시작하기<ArrowUpRight size={16} aria-hidden="true" /></WebLink>
      </Footnote>
    </Main>
  </Page>;
}

const Page = styled.div`
  width: 100%; height: 100vh; height: 100dvh; min-height: 0;
  overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain;
  touch-action: pan-y; -webkit-overflow-scrolling: touch;
  background: ${palette.surface.library}; color: var(--color-text);
`;

const Header = styled.header`
  position: relative; width: min(100% - 48px, 1040px); min-height: 84px;
  display: flex; align-items: center; margin-inline: auto;
  padding-top: env(safe-area-inset-top, 0px);
  @media (max-width: ${breakpoints.mobile}px) { width: calc(100% - 32px); min-height: 72px; }
`;

const Wordmark = styled(Image)`
  position: absolute; left: 50%; transform: translateX(-50%); width: 64px; height: auto;
`;

const Main = styled.main`
  width: min(100% - 48px, 1040px); margin-inline: auto;
  padding: clamp(40px, 7vw, 88px) 0 max(40px, env(safe-area-inset-bottom, 0px));
  @media (max-width: ${breakpoints.mobile}px) { width: calc(100% - 40px); padding-top: 32px; }
`;

const Hero = styled.div`
  display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  grid-template-areas: "intro memory" "install memory"; align-items: center;
  column-gap: clamp(32px, 6vw, 80px); row-gap: 32px;
  @media (max-width: ${breakpoints.tablet}px) {
    grid-template-columns: minmax(0, 1fr); grid-template-areas: "intro" "install" "memory";
    max-width: 520px; margin-inline: auto; row-gap: 28px;
  }
`;

const Intro = styled.section`
  grid-area: intro; align-self: end;
  h1 { margin: 0; font-family: var(--font-emotional), var(--font-sans), sans-serif;
    font-size: clamp(28px, 4.2vw, 48px); font-weight: 700; line-height: 1.35;
    letter-spacing: -0.025em; text-wrap: balance; overflow-wrap: anywhere; }
  p { margin: 24px 0 0; color: var(--color-text-muted); font-size: 16px; line-height: 1.8; text-wrap: pretty; }
  @media (max-width: ${breakpoints.tablet}px) { text-align: center; }
`;

const Install = styled.section`grid-area: install; align-self: start; min-width: 0;`;

const StoreLinks = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 16px;
  @media (max-width: ${breakpoints.mobile}px) { grid-template-columns: minmax(0, 1fr); gap: 12px; }
`;

const Store = styled.div`
  min-width: 0;
  > span { display: block; margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted); }
`;

const StoreLink = styled.a`
  ${baseControlStyles}
  width: 100%; min-height: 52px; padding: 12px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  border-radius: 999px; background: var(--color-brand-300); color: var(--color-brand-1000);
  font-size: 14px; font-weight: 700; line-height: 1.5; text-align: center; text-decoration: none;
  svg { flex-shrink: 0; }
  &:hover { background: var(--color-brand-400); }
  &:active { background: var(--color-brand-200); }
`;

const QrDisclosure = styled.details`
  margin-top: 12px;
  summary { display: flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px; padding: 10px; cursor: pointer; list-style: none;
    color: var(--color-text-muted); font-size: 14px; }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 2px solid var(--color-brand-800); outline-offset: 2px; border-radius: 8px; }
  &[open] summary svg { transform: rotate(180deg); }
`;

const QrList = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px;
  max-width: 360px; margin: 16px auto 0;
`;

const QrItem = styled.figure`
  margin: 0; min-width: 0; text-align: center;
  img { display: block; box-sizing: border-box; width: 100%; height: auto; aspect-ratio: 1; padding: 8px; background: white; }
  figcaption { margin-top: 8px; font-size: 13px; }
`;

const QrHelp = styled.p`margin: 16px 0 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.7; text-align: center;`;

const Memory = styled.figure`
  grid-area: memory; margin: 0; min-width: 0; display: grid; justify-items: center; gap: 24px;
  figcaption { color: var(--color-text-muted); font-size: 14px; line-height: 1.7; text-align: center; }
  @media (max-width: ${breakpoints.tablet}px) { margin-top: 20px; }
`;

const Sample = styled.div`
  width: min(100%, 320px); box-shadow: 0 20px 40px rgb(var(--color-black-rgb) / 0.08);
  @media (max-width: ${breakpoints.mobile}px) { width: min(100%, 260px); }
`;

const Footnote = styled.footer`
  margin-top: clamp(48px, 8vw, 88px); text-align: center;
  p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.8; text-wrap: pretty; }
`;

const WebLink = styled.a`
  ${baseControlStyles}
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 10px 4px; margin-top: 12px;
  color: var(--color-brand-900); font-size: 14px; text-decoration: underline; text-underline-offset: 4px;
  &:hover { color: var(--color-brand-1000); }
`;
