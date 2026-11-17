import type { ContextMenuItem } from "../components/ContextMenu";

export type MainMenuActions = {
  items?: ContextMenuItem[];
  helpItems?: ContextMenuItem[];
  adminAccess?: boolean;
  onDownload: () => void;
  onSettings: () => void;
  onAdmin: () => void;
};

export function mainMenuItems({ items = [], helpItems = [], adminAccess = false, onDownload, onSettings, onAdmin }: MainMenuActions, target?: string): ContextMenuItem[] {
  return [
    ...items,
    ...helpItems.map(item => ({ ...item, group: "도움말 · 설정" })),
    ...(target === "web" ? [{ group: "도움말 · 설정", label: "앱 다운로드", onSelect: onDownload }] : []),
    { group: "도움말 · 설정", label: "설정", onSelect: onSettings },
    ...(adminAccess && target !== "app" ? [{ group: "운영", label: "관리자 페이지", onSelect: onAdmin }] : []),
  ];
}
