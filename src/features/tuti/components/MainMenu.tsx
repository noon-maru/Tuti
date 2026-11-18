"use client";

import styled from "@emotion/styled";
import { MoreVertical } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { mainMenuItems, type MainMenuActions } from "../navigation/mainMenuItems";
import { quietIconButtonStyles } from "./buttons";

/** 책장·나들이의 공통 진입점. 화면별 동작은 items/helpItems로만 확장한다. */
export function MainMenu({ className, label = "메인 메뉴", ...actions }: MainMenuActions & { className?: string; label?: string }) {
  return <Menu className={className} label={label} triggerContent={<MoreVertical size={22} aria-hidden="true" />}
    items={mainMenuItems(actions, process.env.NEXT_PUBLIC_TUTI_TARGET)} />;
}

const Menu = styled(ContextMenu)`
  width: 44px; height: 44px; flex: none;
  > button { ${quietIconButtonStyles} }
`;
