"use client";

import styled from "@emotion/styled";
import { TriangleAlert, Trash2 } from "lucide-react";
import { useId } from "react";
import { BaseButton } from "./buttons";

export function HarumadiDeleteSection({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  const headingId = useId();
  return <Section aria-labelledby={headingId}>
    <h2 id={headingId}><TriangleAlert size={16} aria-hidden="true" />삭제 전 확인해주세요</h2>
    <p>하루마디 틀은 삭제하면 되돌릴 수 없어요.<br />담았던 원본 마디와 저장한 PDF는 남아요.</p>
    <DeleteButton type="button" disabled={disabled} onClick={onDelete}><Trash2 size={16} aria-hidden="true" />하루마디 틀 삭제</DeleteButton>
  </Section>;
}

const Section = styled.section`
  margin-top: 28px; padding: 16px; border: 1px solid #f0cec9; border-radius: 12px; background: #fff8f6;
  h2 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 14px; font-weight: 600; line-height: 1.5; color: #9f2d22; }
  h2 svg { flex: none; }
  p { margin: 10px 0 14px; font-size: 13px; line-height: 1.75; color: #705b57; overflow-wrap: anywhere; }
`;
const DeleteButton = styled(BaseButton)`
  display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 44px;
  padding: 10px 12px; border: 1px solid #e5b0a8; border-radius: 8px; background: #fff; color: #b42318;
  font-size: 14px; font-weight: 500; line-height: 1.5;
  &:hover:not(:disabled) { background: #fff0ed; }
  &:focus-visible { outline: 2px solid #b42318; outline-offset: 3px; }
  &:disabled { opacity: .5; }
`;
