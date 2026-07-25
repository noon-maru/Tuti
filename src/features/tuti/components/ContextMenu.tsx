"use client";

import styled from "@emotion/styled";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { BaseButton } from "@/features/tuti/components/buttons";

const MENU_WIDTH = 160;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 6;
const MENU_GAP = 4;

export type ContextMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
  tone?: "default" | "danger";
};

export function ContextMenu({
  className,
  items,
  label,
  tone = "default",
}: {
  className?: string;
  items: ContextMenuItem[];
  label: string;
  tone?: "default" | "inverse";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportRect =
      triggerRef.current
        .closest<HTMLElement>("[data-app-viewport]")
        ?.getBoundingClientRect() ?? {
        bottom: window.innerHeight,
        left: 0,
        right: window.innerWidth,
        top: 0,
      };
    const menuHeight = items.length * MENU_ITEM_HEIGHT + MENU_PADDING * 2;
    const left = Math.min(
      Math.max(
        triggerRect.right - MENU_WIDTH,
        viewportRect.left + MENU_PADDING,
      ),
      viewportRect.right - MENU_WIDTH - MENU_PADDING,
    );
    const preferredTop = triggerRect.bottom + MENU_GAP;
    const top =
      preferredTop + menuHeight <= viewportRect.bottom - MENU_PADDING
        ? preferredTop
        : Math.max(
            viewportRect.top + MENU_PADDING,
            triggerRect.top - menuHeight - MENU_GAP,
          );

    setPosition({ left, top });
    window.requestAnimationFrame(() => firstItemRef.current?.focus());
  }, [items.length, open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setOpen(false);
      triggerRef.current?.focus();
    };
    const closeOnViewportChange = () => setOpen(false);

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const toggleMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((currentOpen) => !currentOpen);
  };

  return (
    <MenuAnchor className={className}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        data-swipe-back-ignore
        $tone={tone}
        onClick={toggleMenu}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <i />
        <i />
        <i />
      </Trigger>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <DismissLayer
            onPointerDown={() => setOpen(false)}
          >
            <Menu
              role="menu"
              aria-label={label}
              style={position}
              data-swipe-back-ignore
              onPointerDown={(event) => event.stopPropagation()}
            >
              {items.map((item, index) => (
                <MenuItem
                  key={item.label}
                  ref={index === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  $tone={item.tone ?? "default"}
                  onClick={() => {
                    setOpen(false);
                    void item.onSelect();
                  }}
                >
                  {item.label}
                </MenuItem>
              ))}
            </Menu>
          </DismissLayer>,
          document.body,
        )}
    </MenuAnchor>
  );
}

const MenuAnchor = styled.span`
  width: var(--space-11);
  height: var(--space-11);
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
`;

const Trigger = styled(BaseButton)<{
  $tone: "default" | "inverse";
}>`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  align-content: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  border-radius: 999px;
  background: transparent;

  i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: ${({ $tone }) =>
      $tone === "inverse"
        ? "var(--color-white)"
        : "var(--color-text-muted)"};
  }

  &:active {
    transform: scale(0.9);
  }
`;

const DismissLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147482000;
`;

const Menu = styled.div`
  position: fixed;
  width: ${MENU_WIDTH}px;
  display: grid;
  padding: ${MENU_PADDING}px;
  border: 1px solid rgb(var(--color-black-rgb) / 0.08);
  border-radius: 16px;
  background: rgb(var(--color-white-rgb) / 0.96);
  box-shadow: 0 16px 40px rgb(var(--color-black-rgb) / 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
`;

const MenuItem = styled(BaseButton)<{
  $tone: "default" | "danger";
}>`
  min-height: ${MENU_ITEM_HEIGHT}px;
  padding: 0 var(--space-3);
  border-radius: 12px;
  background: transparent;
  color: ${({ $tone }) =>
    $tone === "danger"
      ? "var(--color-error)"
      : "var(--color-text)"};
  font-size: var(--font-size-100);
  font-weight: 500;
  text-align: left;

  &:hover,
  &:focus-visible {
    background: var(--color-neutral-200);
    outline: none;
  }
`;
