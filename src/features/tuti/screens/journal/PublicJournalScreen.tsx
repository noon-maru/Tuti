"use client";

import styled from "@emotion/styled";

import type { PublicJournalEntry } from "@/shared/api/journal";
import { palette } from "@/styles/tokens";

export function PublicJournalScreen({
  entry,
}: {
  entry: PublicJournalEntry;
}) {
  return (
    <Page>
      <Shell>
        <Header>
          <Wordmark
            src="/brand/tuti-wordmark.svg"
            alt="Tuti"
          />
          <span>공개된 지난 공간</span>
        </Header>

        <Card>
          <Hero $hasImage={Boolean(entry.image)}>
            {entry.image && (
              <HeroImage
                src={entry.image}
                alt={`${entry.placeName} 기록 이미지`}
              />
            )}
          </Hero>

          <Content>
            <DateText>{formatPublicDate(entry.visitedAt)}</DateText>
            <h1>{entry.title || "남겨둔 공간"}</h1>
            <Tags aria-label="기록 정보">
              <Tag $tone="brand">{entry.crowd}</Tag>
              <Tag $tone="neutral">{entry.placeName}</Tag>
              <Tag $tone="secondary">{entry.difficulty}</Tag>
            </Tags>
            <Description>
              {entry.content || "오늘의 공기를 이곳에 남겨두었어요."}
            </Description>
          </Content>
        </Card>

        <Footer>
          <p>오늘 가능한 만큼만, 잠깐 다른 공기로.</p>
          <HomeLink href="/">Tuti에서 공간 찾아보기</HomeLink>
        </Footer>
      </Shell>
    </Page>
  );
}

function formatPublicDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
}

const Page = styled.main`
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(24px, 6vw, 72px) 20px;
  background:
    radial-gradient(
      circle at 92% 4%,
      ${palette.secondary[300]},
      transparent 34%
    ),
    linear-gradient(145deg, ${palette.brand[200]}, ${palette.neutral[200]} 62%);
`;

const Shell = styled.div`
  width: min(100%, 680px);
  display: grid;
  gap: 24px;
  margin: 0 auto;
`;

const Header = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  padding: 0 8px;
  color: ${palette.neutral[900]};
  font-size: 14px;
`;

const Wordmark = styled.img`
  width: 104px;
  height: auto;
  display: block;
`;

const Card = styled.article`
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 0.06);
  border-radius: clamp(32px, 8vw, 56px);
  background: ${palette.neutral[100]};
  box-shadow: 0 28px 72px rgb(0 0 0 / 0.16);
`;

const Hero = styled.div<{ $hasImage: boolean }>`
  aspect-ratio: 4 / 3;
  background: ${({ $hasImage }) =>
    $hasImage
      ? palette.neutral[300]
      : `radial-gradient(circle at 20% 18%, ${palette.secondary[500]}, transparent 36%), linear-gradient(145deg, ${palette.brand[500]}, ${palette.brand[700]})`};
`;

const HeroImage = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
`;

const Content = styled.div`
  display: grid;
  gap: 20px;
  padding: clamp(28px, 7vw, 48px);

  h1 {
    font-size: clamp(26px, 6vw, 38px);
    font-weight: 700;
  }
`;

const DateText = styled.time`
  color: ${palette.neutral[900]};
  font-size: 14px;
`;

const Tags = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`;

const Tag = styled.span<{
  $tone: "brand" | "neutral" | "secondary";
}>`
  min-width: 0;
  min-height: 32px;
  display: grid;
  place-items: center;
  padding: 4px 10px;
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? palette.brand[500]
      : $tone === "secondary"
        ? palette.secondary[500]
        : palette.neutral[500]};
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Description = styled.p`
  color: ${palette.neutral[1100]};
  font-size: clamp(15px, 3.6vw, 18px);
  line-height: 1.65;
  letter-spacing: -0.015em;
  white-space: pre-line;
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 8px;
  color: ${palette.neutral[900]};
  font-size: 13px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
    text-align: center;
  }
`;

const HomeLink = styled.a`
  min-height: 44px;
  display: inline-grid;
  place-items: center;
  padding: 0 20px;
  border-radius: 999px;
  background: ${palette.brand[700]};
  color: ${palette.neutral[100]};
  font-weight: 600;
`;
