"use client";

import styled from "@emotion/styled";
import { Search, X } from "lucide-react";
import { inputControlStyles } from "@/shared/ui/typography";
import { BaseButton } from "./buttons";

export function MadiSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Field role="search" aria-label="마디 찾기">
    <Search size={17} aria-hidden="true" />
    <Input type="search" aria-label="마디 검색" placeholder="제목, 이야기, 장소, 날짜 검색" value={value} onChange={event => onChange(event.target.value)} />
    {value && <Clear type="button" aria-label="검색 지우기" onClick={() => onChange("")}><X size={17} aria-hidden="true" /></Clear>}
  </Field>;
}

const Field = styled.div`position: relative; flex: none; display: flex; align-items: center; > svg { position: absolute; left: 14px; color: var(--color-text-muted); pointer-events: none; }`;
const Input = styled.input`${inputControlStyles} padding-left: 40px; padding-right: 44px; &::-webkit-search-cancel-button { -webkit-appearance: none; }`;
const Clear = styled(BaseButton)`position: absolute; right: 0; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; background: transparent; color: var(--color-text-muted);`;
