"use client";
import styled from "@emotion/styled";
import { ChevronDown } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import type { HarumadiLibraryView } from "@/shared/harumadi/libraryView";

const views = [{ value: "carousel", label: "한 권씩" }, { value: "covers", label: "표지" }, { value: "spines", label: "책등" }] as const;

export function LibraryViewSwitch({ view, onChange }: { view: HarumadiLibraryView; onChange: (view: HarumadiLibraryView) => void }) {
  const current = views.find(item => item.value === view)!;
  return <ViewMenu label={`책장 보기 방식, 현재 ${current.label}`} triggerContent={<>{current.label}<ChevronDown size={16} aria-hidden="true" /></>}
    items={views.map(item => ({ label: item.label, kind: "radio", selected: item.value === view, onSelect: () => onChange(item.value) }))} />;
}
const ViewMenu = styled(ContextMenu)`width: auto; min-width: 0; > button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 8px; border-radius: 999px; font-size: var(--ui-body-size); font-weight: 500; color: var(--color-text); background: transparent; white-space: nowrap;
  &:hover { background: var(--color-brand-100); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
} `;
