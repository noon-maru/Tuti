"use client";

import styled from "@emotion/styled";
import { MoreVertical } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { mainMenuItems, type MainMenuActions } from "../navigation/mainMenuItems";
import { quietIconButtonStyles } from "./buttons";
import type { ReactNode } from "react";

/** 책장·나들이의 공통 진입점. 동작은 items/helpItems, 버튼 내용은 triggerContent로 확장한다. */
export function MainMenu({ className, label = "메인 메뉴", triggerContent, ...actions }: MainMenuActions & { className?: string; label?: string; triggerContent?: ReactNode }) {
  return <Menu className={className} label={label} triggerContent={triggerContent ?? <MoreVertical size={22} aria-hidden="true" />}
    items={mainMenuItems(actions, process.env.NEXT_PUBLIC_TUTI_TARGET)} />;
}

const Menu = styled(ContextMenu)`
  width: 44px; height: 44px; flex: none;
  > button { ${quietIconButtonStyles} }
`;
