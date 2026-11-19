"use client";

import styled from "@emotion/styled";
import { MoreVertical } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { mainMenuItems, type MainMenuActions } from "../navigation/mainMenuItems";
import { quietIconButtonStyles } from "./buttons";
import type { ReactNode } from "react";
import { PetMenuPortraits } from "./PetMenuPortraits";

/** 책장·나들이의 공통 진입점. 동작은 items/helpItems, 버튼 내용은 triggerContent로 확장한다. */
export function MainMenu({ className, label = "메인 메뉴", triggerContent, ownerId, onPets, ...actions }: MainMenuActions & { className?: string; label?: string; triggerContent?: ReactNode; ownerId?: string; onPets?: () => void }) {
  return <Menu className={className} label={label} triggerContent={triggerContent ?? (ownerId ? <PetMenuPortraits key={ownerId} ownerId={ownerId} /> : <MoreVertical size={22} aria-hidden="true" />)}
    items={mainMenuItems({ ...actions, helpItems: [...(onPets ? [{ label: "함께하는 반려동물", onSelect: onPets }] : []), ...(actions.helpItems ?? [])] }, process.env.NEXT_PUBLIC_TUTI_TARGET)} />;
}

const Menu = styled(ContextMenu)`
  width: 44px; height: 44px; flex: none;
  > button { ${quietIconButtonStyles} }
`;
