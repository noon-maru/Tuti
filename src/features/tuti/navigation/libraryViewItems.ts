import type { ContextMenuItem } from "../components/ContextMenu";
import type { HarumadiLibraryView } from "@/shared/harumadi/libraryView";

const views = [{ value: "carousel", label: "한 권씩" }, { value: "covers", label: "표지" }, { value: "spines", label: "책등" }] as const;

export function libraryViewItems(view: HarumadiLibraryView, onChange: (view: HarumadiLibraryView) => void): ContextMenuItem[] {
  return views.map(item => ({ group: "책장 보기", label: item.label, kind: "radio", selected: item.value === view, onSelect: () => onChange(item.value) }));
}
