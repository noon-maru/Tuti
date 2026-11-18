"use client";

import styled from "@emotion/styled";
import { useState } from "react";
import { FileText, ChevronRight } from "lucide-react";
import type { StoredHarumadiPdf } from "@/shared/api/harumadiPdf";
import { ScreenFrame } from "../../components/ScreenFrame";
import { BackButton, BaseButton, Button, TextButton } from "../../components/buttons";
import { HarumadiCover } from "../../components/HarumadiCover";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { screenTitleStyles, bodyCopyStyles, captionStyles } from "@/shared/ui/typography";

export function HarumadiPdfArchiveScreen({ ownerId, files, pending, error, busy, hasNextPage, onBack, onOpen, onRetry, onLoadMore }: {
  ownerId: string; files: StoredHarumadiPdf[]; pending: boolean; error: boolean; busy: boolean; hasNextPage: boolean;
  onBack: () => void; onOpen: (id: string) => void; onRetry: () => void; onLoadMore: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <Frame aria-labelledby="pdf-archive-title">
    <Header><BackButton aria-label="내 책장으로 돌아가기" onClick={onBack} /><Title id="pdf-archive-title">저장한 PDF</Title></Header>
    <Body>
      {pending && files.length === 0 ? <Centered><LoadingIndicator label="저장한 PDF를 불러오고 있어요." /></Centered>
        : error && files.length === 0 ? <Centered><StateTitle>PDF를 불러오지 못했어요.</StateTitle><Copy>잠시 후 다시 확인해주세요.</Copy><Button type="button" disabled={busy} onClick={onRetry}>다시 불러오기</Button></Centered>
        : files.length === 0 ? <Centered>
          <EmptyIcon aria-hidden="true"><FileText size={32} strokeWidth={1.25} /></EmptyIcon>
          <StateTitle>간직하고 싶은 하루를<br />PDF로 남겨보세요.</StateTitle>
          <Copy>하루마디에서 PDF로 저장하면<br />이곳에 차곡차곡 모여요.</Copy>
          <Button type="button" onClick={onBack}>책장으로 가기<ChevronRight size={16} aria-hidden="true" /></Button>
        </Centered> : <>
          <Grid aria-label="저장한 PDF 목록">{files.map(file => <li key={file.id}><FileButton type="button" onClick={() => onOpen(file.id)} aria-label={`${file.title}, ${file.pageCount}쪽 PDF 열기`}>
            <Cover aria-hidden="true"><HarumadiCover harumadiPdf={file} ownerId={ownerId} /></Cover>
            <FileTitle>{file.title}</FileTitle><Meta><time dateTime={file.createdAt}>{file.createdAt.slice(0, 10).replaceAll("-", ".")}</time> · {file.pageCount}쪽</Meta>
          </FileButton></li>)}</Grid>
          {error && <Retry role="status"><span>PDF 목록을 모두 불러오지 못했어요.</span><TextButton type="button" disabled={busy} onClick={onRetry}>다시 시도</TextButton></Retry>}
          {hasNextPage && !error && <More type="button" disabled={busy} onClick={onLoadMore}>{busy ? "불러오는 중…" : "PDF 더 보기"}</More>}
        </>}
    </Body>
    <Help>
      <HelpToggle type="button" aria-expanded={helpOpen} aria-controls="pdf-archive-help" onClick={() => setHelpOpen(open => !open)}>저장한 PDF에 대해</HelpToggle>
      <HelpCopy id="pdf-archive-help" $visible={helpOpen} aria-hidden={!helpOpen}>저장한 시점의 하루마디예요. 책장의 하루마디를 수정해도 이 파일은 바뀌지 않아요.</HelpCopy>
    </Help>
  </Frame>;
}

const Frame = styled(ScreenFrame)`background: var(--color-surface); gap: var(--space-5); color: var(--color-text);`;
const Header = styled.header`flex: none; display: flex; align-items: center; gap: 4px; margin-left: -10px;`;
const Title = styled.h1`${screenTitleStyles}`;
const Body = styled.div`flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column;`;
const Centered = styled.div`flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 16px; padding: 24px 4px; > button { margin-top: 8px; flex: none; }`;
const EmptyIcon = styled.span`display: grid; place-items: center; color: var(--color-brand-800); margin-bottom: 8px;`;
const StateTitle = styled.h2`${screenTitleStyles} font-size: var(--ui-heading-size); font-weight: 500; line-height: 1.6;`;
const Copy = styled.p`${bodyCopyStyles} color: var(--color-text-muted); margin: 0;`;
const Grid = styled.ul`list-style: none; margin: 0; padding: 8px 2px 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 20px; > li { min-width: 0; } @container app-viewport (min-width: 600px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }`;
const FileButton = styled(BaseButton)`display: flex; flex-direction: column; align-items: stretch; width: 100%; min-width: 0; padding: 0; background: transparent; color: inherit; text-align: left; gap: 6px; border-radius: 6px; &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }`;
const Cover = styled.span`display: block; margin-bottom: 6px;`;
const FileTitle = styled.strong`${bodyCopyStyles} font-weight: 500; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;`;
const Meta = styled.span`${captionStyles}`;
const More = styled(TextButton)`align-self: center; flex: none; margin: 0 0 12px;`;
const Retry = styled.div`${captionStyles} display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 8px; flex: none;`;
const Help = styled.div`${captionStyles} flex: none;`;
const HelpToggle = styled(BaseButton)`width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: center; background: transparent; color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; &:focus-visible { outline: 2px solid var(--color-brand-700); border-radius: 4px; }`;
// 닫힌 상태에서도 문구의 실제 높이를 확보해 본문과 목록이 밀리지 않게 한다.
const HelpCopy = styled.p<{ $visible: boolean }>`margin: 0; padding: 4px 8px 0; text-align: center; visibility: ${({ $visible }) => $visible ? "visible" : "hidden"};`;
