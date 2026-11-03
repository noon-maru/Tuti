"use client";
import styled from "@emotion/styled";
import { LayoutGrid, Library } from "lucide-react";
import { BaseButton } from "./buttons";
import type { HarumadiLibraryView } from "@/shared/harumadi/libraryView";

export function LibraryViewSwitch({ view, onChange }: { view: HarumadiLibraryView; onChange: (view: HarumadiLibraryView) => void }) {
  return <Switch role="group" aria-label="책장 보기 방식">
    <Choice type="button" aria-pressed={view === "covers"} onClick={() => onChange("covers")}><LayoutGrid size={15} aria-hidden="true" />표지</Choice>
    <Choice type="button" aria-pressed={view === "spines"} onClick={() => onChange("spines")}><Library size={15} aria-hidden="true" />책등</Choice>
  </Switch>;
}
const Switch = styled.div`display: inline-flex; flex: none; gap: 2px; padding: 3px; border: 1px solid #e4e9e0; border-radius: 14px; background: #edf1e9;`;
const Choice = styled(BaseButton)`display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 8px 10px; border-radius: 10px; font-size: 13px; color: var(--color-text-muted); background: transparent;
  &[aria-pressed="true"] { color: var(--color-text); background: white; box-shadow: 0 1px 4px #1b222a0a; }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;
