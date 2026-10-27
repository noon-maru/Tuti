"use client";

import Image from "next/image";
import styled from "@emotion/styled";
import { getHarumadiPdfCoverPalette } from "@/shared/api/harumadiPdf";
import { HARUMADI_PDF_LAYOUT as layout, harumadiPdfCssLength as pt } from "@/shared/harumadi/pdfLayout";

const sample = {
  title: "함께라서 좋았던 오후",
  content: "별다른 계획 없이 걸었는데,\n같이여서 오래 기억하고 싶은 하루.\n\n다음에도 이렇게 천천히 걷자.",
  photo: "/welcome/shared-afternoon-example.webp",
};
const coverPalette = getHarumadiPdfCoverPalette("green-image");

/** 실제 PDF의 A5 레이아웃 수치를 공유하는 HTML 예시. */
export function WelcomeHarumadiSample({ page, priority = false }: { page: "cover" | "page" | "photo" | "text"; priority?: boolean }) {
  if (page === "photo") return <Sheet data-harumadi-pdf-sample="photo">
    <PhotoOnlyPaper $cover={false}>
      <PhotoHeader date="2026.06.25" place="동네 카페" />
      <PhotoOnlyBody><PhotoOnly><Image src={sample.photo} alt="함께 커피를 나눈 오후를 사진만으로 담은 마디 예시" fill sizes="(max-width: 600px) 80vw, 400px" priority={priority} /></PhotoOnly></PhotoOnlyBody>
      <Folio number={2} />
    </PhotoOnlyPaper>
  </Sheet>;
  if (page === "text") return <Sheet data-harumadi-pdf-sample="text">
    <TextPaper $cover={false}>
      <TextFrame>
        <TextMeta>2026-06-28 · 동네 산책길</TextMeta>
        <TextTitle>집까지 조금 더 천천히</TextTitle>
        <TextBody>{"금방 들어가기 아쉬워서\n익숙한 길을 한 바퀴 더 걸었다.\n\n별일 없던 하루도\n같이 걸으면 남기고 싶어진다."}</TextBody>
      </TextFrame>
      <Folio number={3} />
    </TextPaper>
  </Sheet>;
  return <Sheet data-harumadi-pdf-sample={page}>
    {page === "cover" ? <CoverPaper $cover>
      <CoverHeader><span>2026.06.23<br />- 2026.06.28</span><span>함께 남긴 하루</span></CoverHeader>
      <CoverBody><CoverPhoto><Image src={sample.photo} alt="함께 커피를 나눈 오후의 예시 사진" fill sizes="200px" priority={priority} /></CoverPhoto></CoverBody>
      <CoverMark>Tuti</CoverMark>
    </CoverPaper> : <PhotoPaper $cover={false}>
      <PhotoHeader date="2026.06.23" place="동네 카페" />
      <Photo><Image src={sample.photo} alt="함께 커피를 나눈 오후의 예시 사진" fill sizes="(max-width: 600px) 60vw, 320px" priority={priority} /></Photo>
      <Story><Title>{sample.title}</Title><Body>{sample.content}</Body></Story>
      <Folio number={1} />
    </PhotoPaper>}
  </Sheet>;
}

function PhotoHeader({ date, place }: { date: string; place: string }) {
  return <PageHeader><span>{date}</span><Place><PlaceMark aria-hidden="true" />{place}</Place></PageHeader>;
}

// PDF 쪽번호와 동일한 좌표·기준선에 배치한다.
function Folio({ number }: { number: number }) {
  return <FolioLayer viewBox={`0 0 ${layout.page.width} ${layout.page.height}`} aria-hidden="true">
    <text x={layout.page.width - layout.folio.right} y={layout.page.height - layout.folio.bottom}
      textAnchor="end" fontFamily="Helvetica, Arial, sans-serif" fontSize={layout.folio.fontSize}
      fill={`rgb(${layout.folio.gray * 100}% ${layout.folio.gray * 100}% ${layout.folio.gray * 100}%)`}>{number}</text>
  </FolioLayer>;
}

const Sheet = styled.span`
  position: relative; display: block; width: 100%; min-width: 0; min-height: 0; container-type: inline-size;
`;
const Paper = styled.span<{ $cover: boolean }>`
  position: relative; display: block; box-sizing: border-box; width: 100%;
  aspect-ratio: ${layout.page.width} / ${layout.page.height};
  padding: ${pt(layout.page.padding)}; padding-bottom: ${pt(layout.page.paddingBottom)};
  background: ${({ $cover }) => $cover ? coverPalette.background : "#fff"};
  color: ${({ $cover }) => $cover ? coverPalette.foreground : "#303030"};
  font-family: var(--font-pretendard), sans-serif; text-align: left;
  font-size: ${pt(layout.page.fontSize)}; font-weight: 400; line-height: ${layout.page.lineHeight};
`;
const PhotoPaper = styled(Paper)`
  padding: ${pt(layout.photo.padding)}; padding-bottom: ${pt(layout.photo.paddingBottom)};
  font-size: ${pt(layout.photo.fontSize)};
`;
const PageHeader = styled.span`
  display: flex; flex: none; justify-content: space-between; align-items: center;
  height: ${pt(layout.photo.headerHeight)}; line-height: ${layout.photo.headerLineHeight};
`;
const Place = styled.span`display: inline-flex; align-items: center; gap: ${pt(layout.photo.placeMarkGap)};`;
const PlaceMark = styled.span`
  display: inline-block; flex: none; width: ${pt(layout.photo.placeMarkSize)}; height: ${pt(layout.photo.placeMarkSize)}; border-radius: 50%;
  background: linear-gradient(to bottom, #c7e887 50%, #8cbdef 50%);
`;
const Photo = styled.span`
  display: block; position: relative; margin-top: ${pt(layout.photo.lead)};
  width: 100%; height: ${pt(layout.photo.imageHeight)}; border-radius: ${pt(layout.photo.imageRadius)}; overflow: hidden;
  img { object-fit: cover; }
`;
const PhotoOnlyPaper = styled(PhotoPaper)`display: flex; flex-direction: column;`;
const PhotoOnlyBody = styled.span`display: flex; flex: 1; flex-direction: column; justify-content: center;`;
const PhotoOnly = styled(Photo)`margin-top: 0; flex: none;`;
const Story = styled.span`display: flex; justify-content: space-between; margin-top: ${pt(layout.photo.shortGap)};`;
const Title = styled.span`
  box-sizing: border-box; width: ${layout.photo.titleWidth}; padding-right: ${pt(layout.photo.titlePaddingRight)};
  font-size: ${pt(layout.photo.titleSize)}; font-weight: ${layout.photo.titleWeight}; line-height: ${layout.photo.titleLineHeight};
`;
const Body = styled.span`width: ${layout.photo.textWidth}; white-space: pre-line; line-height: ${layout.photo.textLineHeight}; word-break: keep-all;`;
const FolioLayer = styled.svg`position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;`;
const CoverPaper = styled(Paper)`
  display: flex; flex-direction: column; justify-content: space-between;
  padding-top: ${pt(layout.cover.paddingTop)}; padding-bottom: ${pt(layout.cover.paddingBottom)};
`;
const CoverHeader = styled.span`
  display: flex; flex: none; justify-content: space-between; align-items: flex-start;
  font-size: ${pt(layout.cover.fontSize)}; line-height: ${layout.cover.lineHeight};
  > span:first-of-type { width: ${layout.cover.dateWidth}; }
  > span:last-of-type { width: ${layout.cover.titleWidth}; text-align: right; }
`;
const CoverBody = styled.span`display: flex; flex: none; height: ${pt(layout.cover.bodyHeight)}; align-items: center; justify-content: center;`;
const CoverPhoto = styled.span`
  display: block; position: relative; width: ${pt(layout.cover.imageWidth)}; height: ${pt(layout.cover.imageHeight)};
  border-radius: ${pt(layout.photo.imageRadius)}; overflow: hidden; img { object-fit: cover; }
`;
const CoverMark = styled.span`display: block; flex: none; text-align: right; font-size: ${pt(layout.cover.wordmarkSize)};`;
const TextPaper = styled(Paper)`
  display: flex; flex-direction: column; justify-content: center;
  padding-top: ${pt(layout.shortText.paddingVertical)}; padding-bottom: ${pt(layout.shortText.paddingVertical)};
  background: ${layout.shortText.background};
`;
const TextFrame = styled.span`
  display: block; padding-left: ${pt(layout.shortText.frameLeft)}; padding-right: ${pt(layout.shortText.frameRight)};
  border-left: ${pt(layout.shortText.borderWidth)} solid ${layout.shortText.borderColor};
`;
const TextMeta = styled.span`display: block; color: #606060; font-size: ${pt(layout.shortText.captionSize)}; margin-bottom: ${pt(layout.shortText.captionGap)};`;
const TextTitle = styled.span`display: block; font-size: ${pt(layout.shortText.titleSize)}; font-weight: ${layout.shortText.titleWeight}; margin-bottom: ${pt(layout.shortText.titleGap)}; line-height: ${layout.shortText.titleLineHeight};`;
const TextBody = styled.span`display: block; font-size: ${pt(layout.shortText.bodySize)}; line-height: ${layout.shortText.bodyLineHeight}; white-space: pre-line; word-break: keep-all;`;
