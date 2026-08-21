"use client";

import styled from "@emotion/styled";
import Link from "next/link";

type LegalSection = {
  title: string;
  paragraphs: readonly string[];
};

export function LegalDocument({
  title,
  effectiveDate,
  summary,
  sections,
  appendix,
}: {
  title: string;
  effectiveDate: string;
  summary?: string;
  sections: readonly LegalSection[];
  appendix: readonly string[];
}) {
  return (
    <Page>
      <Header>
        <Link href="/" aria-label="Tuti로 돌아가기">‹</Link>
        <div>
          <span>Tuti 법적 안내</span>
          <h1>{title}</h1>
          <p>시행일 {effectiveDate}</p>
        </div>
      </Header>
      {summary && <Summary>{summary}</Summary>}
      <Navigation aria-label="법적 문서">
        <Link href="/legal/privacy">개인정보 처리방침</Link>
        <Link href="/legal/location-terms">위치기반서비스 이용약관</Link>
      </Navigation>
      <Content>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </Content>
      <Appendix>
        {appendix.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </Appendix>
      <Footer>
        <strong>눈마루 · Tuti</strong>
        <span>admin@tuti.today · 010-2724-4307</span>
        <Link href="/account-deletion">계정 및 데이터 삭제 안내</Link>
      </Footer>
    </Page>
  );
}

const Page = styled.main`
  width: min(100%, 760px);
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  margin-inline: auto;
  padding: max(var(--space-5), env(safe-area-inset-top, 0px))
    max(var(--space-5), env(safe-area-inset-right, 0px))
    max(var(--space-8), env(safe-area-inset-bottom, 0px))
    max(var(--space-5), env(safe-area-inset-left, 0px));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  background: var(--color-surface);
  color: var(--color-text-primary);

  @media (min-width: 768px) {
    height: calc(100dvh - var(--space-16));
    margin-block: var(--space-8);
    padding: var(--space-10) var(--space-12);
    border: 1px solid var(--color-border);
    border-radius: 32px;
    box-shadow: 0 24px 80px rgb(var(--color-black-rgb) / 0.1);
  }
`;

const Header = styled.header`
  display: grid;
  grid-template-columns: var(--space-10) 1fr;
  gap: var(--space-3);
  align-items: start;

  > a {
    display: grid;
    place-items: center;
    width: var(--space-10);
    height: var(--space-10);
    color: inherit;
    font-size: var(--font-size-600);
    text-decoration: none;
  }

  span,
  p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-100);
  }

  h1 {
    margin-block: var(--space-2);
    font-size: var(--font-size-600);
    line-height: var(--line-height-heading);
  }
`;

const Summary = styled.p`
  margin-top: var(--space-8);
  padding: var(--space-5);
  border-radius: 22px;
  background: var(--color-secondary-100);
  font-size: var(--font-size-200);
  font-weight: 600;
  line-height: var(--line-height-subtitle);
`;

const Navigation = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-block: var(--space-6) var(--space-9);

  a {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    color: var(--color-text-primary);
    font-size: var(--font-size-100);
    text-decoration: none;
  }
`;

const Content = styled.article`
  display: grid;
  gap: var(--space-9);

  section {
    display: grid;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-300);
    line-height: var(--line-height-heading);
  }

  p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const Appendix = styled.div`
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-10);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--font-size-100);
`;

const Footer = styled.footer`
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-10);
  padding: var(--space-5);
  border-radius: 20px;
  background: var(--color-neutral-200);

  span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-100);
  }

  a {
    width: fit-content;
    margin-top: var(--space-2);
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
