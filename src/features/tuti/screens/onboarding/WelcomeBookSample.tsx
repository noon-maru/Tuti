"use client";

import Image from "next/image";
import styled from "@emotion/styled";
import { getJournalBookCoverPalette } from "@/shared/api/journalBook";

const sample = {
  title: "함께라서 좋았던 오후",
  content: "별다른 계획 없이 걸었는데,\n같이여서 오래 기억하고 싶은 하루.\n\n다음에도 이렇게 천천히 걷자.",
  photo: "/welcome/shared-afternoon-example.webp",
};
const coverPalette = getJournalBookCoverPalette("green-image");

/** HTML rendition of the A5 photo-text layout; all copy remains real text. */
export function WelcomeBookSample({ page, priority = false }: { page: "cover" | "page" | "text"; priority?: boolean }) {
  const cover = page === "cover";
  if (page === "text") return <Sheet data-book-sample="text">
    <TextPaper $cover={false}>
      <TextFrame>
        <TextMeta>2026.06.28 · 동네 산책길</TextMeta>
        <TextTitle>집까지 조금 더 천천히</TextTitle>
        <TextBody>{"금방 들어가기 아쉬워서\n익숙한 길을 한 바퀴 더 걸었다.\n\n별일 없던 하루도\n같이 걸으면 남기고 싶어진다."}</TextBody>
      </TextFrame>
      <Folio>2</Folio>
    </TextPaper>
  </Sheet>;
  return <Sheet data-book-sample={page}>
    <Paper $cover={cover}>
      {cover ? <>
        <CoverHeader><span>2026.06.23<br />- 2026.06.28</span><span>함께 남긴 하루</span></CoverHeader>
        <CoverPhoto><Image src={sample.photo} alt="함께 커피를 나눈 오후의 예시 사진" fill sizes="200px" priority={priority} /></CoverPhoto>
        <CoverMark>Tuti</CoverMark>
      </> : <>
        <PageHeader><span>2026.06.23</span><Place><PlaceMark aria-hidden="true" />동네 카페</Place></PageHeader>
        <Photo><Image src={sample.photo} alt="함께 커피를 나눈 오후의 예시 사진" fill sizes="(max-width: 600px) 60vw, 320px" priority={priority} /></Photo>
        <Story><Title>{sample.title}</Title><Body>{sample.content}</Body></Story>
        <Folio>1</Folio>
      </>}
    </Paper>
  </Sheet>;
}

const Sheet = styled.span`
  position: relative; display: block;
  width: 100%; min-width: 0; min-height: 0;
  container-type: inline-size;
`;
// A5: 419.53 × 595.28pt. Dimensions below follow the PDF's 42pt inset,
// 250pt photo, 66pt short-copy gap, 10pt semibold title and 9pt body.
const Paper = styled.span<{ $cover: boolean }>`
  position: relative; display: block; width: 100%; aspect-ratio: 148 / 210;
  padding: ${({ $cover }) => $cover ? "8.1cqw" : "10cqw"};
  background: ${({ $cover }) => $cover ? coverPalette.background : "#fff"};
  color: ${({ $cover }) => $cover ? coverPalette.foreground : "#303030"};
  text-align: left; font-size: 2.145cqw; font-weight: 400; line-height: 1.8;
`;
const PageHeader = styled.span`
  display: flex; justify-content: space-between; align-items: center;
  height: 3.34cqw; line-height: 1.4;
`;
const Place = styled.span`display: inline-flex; align-items: center; gap: 0.715cqw;`;
const PlaceMark = styled.span`
  display: inline-block; width: 1.67cqw; height: 1.67cqw; border-radius: 50%;
  background: linear-gradient(to bottom, #c7e887 50%, #8cbdef 50%);
`;
const Photo = styled.span`
  display: block; position: relative; margin-top: 7.63cqw;
  width: 100%; height: 59.59cqw; border-radius: 1.19cqw; overflow: hidden;
  img { object-fit: cover; }
`;
const Story = styled.span`
  display: grid; grid-template-columns: 42% 52%; justify-content: space-between;
  margin-top: 15.73cqw;
`;
const Title = styled.span`font-size: 2.384cqw; font-weight: 600; line-height: 1.8;`;
const Body = styled.span`white-space: pre-line; line-height: 1.9; word-break: keep-all;`;
const Folio = styled.span`position: absolute; bottom: 4.76cqw; right: 8.1cqw; color: #858585;`;
const CoverHeader = styled.span`
  display: flex; justify-content: space-between; font-size: 1.907cqw; line-height: 1.55;
`;
const CoverPhoto = styled(Photo)`
  position: absolute; top: 36%; left: 25%; margin: 0;
  width: 50%; height: 40.52cqw;
`;
const CoverMark = styled.span`position: absolute; bottom: 6.67cqw; right: 8.1cqw; font-size: 2.384cqw;`;
const TextPaper = styled(Paper)`
  display: flex; flex-direction: column; justify-content: center;
  padding: 17.16cqw 8.1cqw; background: #fbfcfe;
`;
const TextFrame = styled.span`
  display: block; padding-left: 5.24cqw; padding-right: 2.86cqw;
  border-left: 0.477cqw solid #add1f4;
`;
const TextMeta = styled.span`display: block; color: #606060; margin-bottom: 3.34cqw;`;
const TextTitle = styled.span`display: block; font-size: 2.384cqw; font-weight: 600; margin-bottom: 4.77cqw; line-height: 1.5;`;
const TextBody = styled.span`display: block; font-size: 3.1cqw; line-height: 2; white-space: pre-line; word-break: keep-all;`;
