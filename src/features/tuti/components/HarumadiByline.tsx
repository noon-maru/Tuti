"use client";
import styled from "@emotion/styled";
import { HARUMADI_READING_LAYOUT } from "@/shared/harumadi/readingTypography";

/** A quiet signature attached to the paper, not a badge in the page controls. */
export function HarumadiByline({ authorName, shared }: { authorName: string | null; shared?: boolean }) {
  if (!shared) return null;
  return <Signature data-harumadi-byline aria-hidden={!authorName || undefined} title={authorName ? `${authorName}의 마디` : undefined}>
    {authorName && <><Stroke aria-hidden="true" /><span><strong>{authorName}</strong>의 마디</span></>}
  </Signature>;
}
const Signature = styled.div`
  display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  height: ${HARUMADI_READING_LAYOUT.byline.height}px; margin-top: ${HARUMADI_READING_LAYOUT.byline.gap}px; padding: 0 3px;
  color: var(--color-text-muted); font-size: 12px; line-height: ${HARUMADI_READING_LAYOUT.byline.height}px; text-align: left;
  > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: var(--color-text); font-size: 13px; font-weight: 500; }
`;
const Stroke = styled.span`flex: none; width: 14px; border-top: 1px solid #cbd6c2;`;
