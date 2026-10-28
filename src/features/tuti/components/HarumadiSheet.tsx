"use client";

import Image from "next/image";
import styled from "@emotion/styled";
import { getHarumadiPdfCoverPalette } from "@/shared/api/harumadiPdf";
import { HARUMADI_PDF_LAYOUT as layout, harumadiPdfCssLength as pt } from "@/shared/harumadi/pdfLayout";
import type { HarumadiReaderPage } from "@/shared/harumadi/readerPages";
import type { HarumadiPdfCoverStyle } from "@/shared/api/harumadiPdf";
import { HARUMADI_READING_TYPE as reading } from "@/shared/harumadi/readingTypography";

/** 예시와 실제 마디가 같은 종이·수치·서체를 사용한다. */
export function HarumadiPageSheet({ page, coverStyle, number, compactCover = false }: { page: HarumadiReaderPage; coverStyle: HarumadiPdfCoverStyle; number: number; compactCover?: boolean }) {
  const palette = getHarumadiPdfCoverPalette(coverStyle);
  const photo = page.image ? <Image src={page.image} alt="마디에 남긴 사진" fill unoptimized sizes="(max-width: 600px) 85vw, 400px" /> : null;
  if (page.kind === "cover" || page.kind === "back") return <Sheet $reading $compactCover={compactCover} data-harumadi-page={page.kind}>
    <CoverPaper $cover style={{ background: palette.background, color: palette.foreground }}>
      {page.kind === "cover" ? <><CoverHeader><span style={{ whiteSpace: "pre-line" }}>{page.date}</span><span>{page.title}</span></CoverHeader><CoverBody>{coverStyle.endsWith("-image") && <CoverPhoto style={{ background: photo ? undefined : palette.placeholder }}>{photo}</CoverPhoto>}</CoverBody><CoverMark>Tuti</CoverMark></> : <BackMessage>{page.content}</BackMessage>}
    </CoverPaper>
  </Sheet>;
  if (page.kind === "empty") return <Sheet $reading data-harumadi-page="empty"><TextPaper $cover={false}><TextFrame><TextTitle>첫 마디를 채워보세요</TextTitle><TextBody>사진 한 장, 짧은 이야기부터.</TextBody></TextFrame></TextPaper></Sheet>;
  if (page.kind === "photo-only") return <Sheet $reading data-harumadi-page="photo-only"><PhotoOnlyPaper $cover={false}>
    <PhotoHeader date={page.date.replaceAll("-", ".")} place={page.place} /><PhotoOnlyBody><PhotoOnly>{photo}</PhotoOnly></PhotoOnlyBody><Folio number={number} />
  </PhotoOnlyPaper></Sheet>;
  if (page.kind === "photo") return <Sheet $reading data-harumadi-page="photo"><PhotoPaper $cover={false}>
    <PhotoHeader date={page.date.replaceAll("-", ".")} place={page.place} /><Photo>{photo}</Photo>
    <Story style={{ marginTop: `var(--story-gap, ${pt(page.long ? layout.photo.longGap : layout.photo.shortGap)})` }}>{page.title && <Title>{page.title}</Title>}<Body>{page.content}</Body></Story><Folio number={number} />
  </PhotoPaper></Sheet>;
  if (page.kind === "continuation" || page.long) return <Sheet $reading data-harumadi-page={page.kind}><LongPaper $cover={false}>
    <LongHeader><TextMeta>{page.date} · {page.place}{page.kind === "continuation" ? " · 이어지는 마디" : ""}</TextMeta>{page.title && <TextTitle>{page.title}</TextTitle>}</LongHeader><LongBody>{page.content}</LongBody><Folio number={number} />
  </LongPaper></Sheet>;
  return <Sheet $reading data-harumadi-page="text"><TextPaper $cover={false}><TextFrame>
    <TextMeta>{page.date} · {page.place}</TextMeta>{page.title && <TextTitle>{page.title}</TextTitle>}<TextBody>{page.content}</TextBody>
  </TextFrame><Folio number={number} /></TextPaper></Sheet>;
}

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

const Sheet = styled.span<{ $reading?: boolean; $compactCover?: boolean }>`
  position: relative; display: block; width: 100%; min-width: 0; min-height: 0; container-type: inline-size;
  ${({ $reading }) => $reading && `
    --hm-body: ${reading.body}px; --hm-photo-body: ${reading.photoBody}px;
    --hm-title: ${reading.title}px; --hm-photo-title: ${reading.photoTitle}px;
    --hm-meta: ${reading.meta}px; --hm-line: ${reading.bodyLineHeight}; --hm-title-line: ${reading.titleLineHeight};
    --hm-story-direction: column; --hm-copy-width: 100%; --hm-title-padding: 0px; --hm-copy-gap: 8px;
    --hm-cover-direction: column; --hm-cover-align: left; --hm-cover-height: auto; --hm-cover-flex: 1;
    --hm-header-height: 20px; --hm-meta-display: -webkit-box; --hm-meta-lines: 2;
  `}
  ${({ $compactCover }) => $compactCover && `
    --hm-title: ${reading.title / 320 * 100}cqw;
    --hm-meta: ${reading.meta / 320 * 100}cqw;
    --hm-copy-gap: ${8 / 320 * 100}cqw;
  `}
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
  height: var(--hm-header-height, ${pt(layout.photo.headerHeight)}); font-size: var(--hm-meta, inherit); line-height: ${layout.photo.headerLineHeight};
`;
const Place = styled.span`display: inline-flex; align-items: center; gap: ${pt(layout.photo.placeMarkGap)}; max-width: 60%; overflow-wrap: anywhere;`;
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
const Story = styled.span`display: flex; flex-direction: var(--hm-story-direction, row); gap: var(--hm-copy-gap, 0px); justify-content: space-between; margin-top: ${pt(layout.photo.shortGap)};`;
const Title = styled.span`
  box-sizing: border-box; width: var(--hm-copy-width, ${layout.photo.titleWidth}); padding-right: var(--hm-title-padding, ${pt(layout.photo.titlePaddingRight)});
  font-size: var(--hm-photo-title, ${pt(layout.photo.titleSize)}); font-weight: ${layout.photo.titleWeight}; line-height: var(--hm-title-line, ${layout.photo.titleLineHeight});
`;
const Body = styled.span`width: var(--hm-copy-width, ${layout.photo.textWidth}); font-size: var(--hm-photo-body, inherit); white-space: pre-wrap; line-height: var(--hm-line, ${layout.photo.textLineHeight}); word-break: keep-all; overflow-wrap: anywhere;`;
const FolioLayer = styled.svg`position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;`;
const CoverPaper = styled(Paper)`
  display: flex; flex-direction: column; justify-content: space-between;
  padding-top: ${pt(layout.cover.paddingTop)}; padding-bottom: ${pt(layout.cover.paddingBottom)};
`;
const CoverHeader = styled.span`
  display: flex; flex: none; justify-content: space-between; align-items: flex-start;
  flex-direction: var(--hm-cover-direction, row); gap: var(--hm-copy-gap, 0px);
  font-size: var(--hm-meta, ${pt(layout.cover.fontSize)}); line-height: ${layout.cover.lineHeight};
  > span:first-of-type { width: var(--hm-copy-width, ${layout.cover.dateWidth}); }
  > span:last-of-type { width: var(--hm-copy-width, ${layout.cover.titleWidth}); text-align: var(--hm-cover-align, right); font-size: var(--hm-title, inherit); overflow-wrap: anywhere; }
`;
const CoverBody = styled.span`display: flex; flex: var(--hm-cover-flex, none); min-height: 0; height: var(--hm-cover-height, ${pt(layout.cover.bodyHeight)}); align-items: center; justify-content: center;`;
const CoverPhoto = styled.span`
  display: block; position: relative; width: ${pt(layout.cover.imageWidth)}; height: ${pt(layout.cover.imageHeight)};
  max-height: 100%; border-radius: ${pt(layout.photo.imageRadius)}; overflow: hidden; img { object-fit: cover; }
`;
const CoverMark = styled.span`display: block; flex: none; text-align: right; font-size: var(--hm-meta, ${pt(layout.cover.wordmarkSize)});`;
const TextPaper = styled(Paper)`
  display: flex; flex-direction: column; justify-content: center;
  padding-top: ${pt(layout.shortText.paddingVertical)}; padding-bottom: ${pt(layout.shortText.paddingVertical)};
  background: ${layout.shortText.background};
`;
const TextFrame = styled.span`
  display: block; padding-left: ${pt(layout.shortText.frameLeft)}; padding-right: ${pt(layout.shortText.frameRight)};
  border-left: ${pt(layout.shortText.borderWidth)} solid ${layout.shortText.borderColor};
`;
const TextMeta = styled.span`display: var(--hm-meta-display, block); -webkit-box-orient: vertical; -webkit-line-clamp: var(--hm-meta-lines, unset); overflow: hidden; color: #606060; font-size: var(--hm-meta, ${pt(layout.shortText.captionSize)}); margin-bottom: ${pt(layout.shortText.captionGap)}; overflow-wrap: anywhere;`;
const TextTitle = styled.span`display: block; font-size: var(--hm-title, ${pt(layout.shortText.titleSize)}); font-weight: ${layout.shortText.titleWeight}; margin-bottom: ${pt(layout.shortText.titleGap)}; line-height: ${layout.shortText.titleLineHeight}; overflow-wrap: anywhere;`;
const TextBody = styled.span`display: block; font-size: var(--hm-body, ${pt(layout.shortText.bodySize)}); line-height: var(--hm-line, ${layout.shortText.bodyLineHeight}); white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere;`;
const LongPaper = styled(Paper)`display: flex; flex-direction: column;`;
const LongHeader = styled.span`display: block; margin-bottom: ${pt(22)}; padding-bottom: ${pt(18)}; border-bottom: ${pt(1)} solid #DCE7F1;`;
const LongBody = styled.span`display: block; font-size: var(--hm-body, ${pt(12)}); line-height: var(--hm-line, 1.95); white-space: pre-wrap; overflow-wrap: anywhere;`;
const BackMessage = styled.span`display: grid; flex: 1; place-items: center; font-size: var(--hm-body, ${pt(14)}); line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere;`;
