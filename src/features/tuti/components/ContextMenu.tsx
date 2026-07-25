"use client";

import styled from "@emotion/styled";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BaseButton } from "@/features/tuti/components/buttons";

const MENU_WIDTH = 160;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 6;
const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 360;
const MENU_INPUT_HEIGHT = 52;

export type ContextMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
  selected?: boolean;
  tone?: "default" | "danger";
};

export type ContextMenuTextInput = {
  label: string;
  onSubmit: (value: string) => void | Promise<void>;
  placeholder?: string;
  value?: string;
};

export function ContextMenu({
  className,
  items,
  label,
  tone = "default",
  triggerContent,
  triggerTone = "default",
  textInput,
}: {
  className?: string;
  items: ContextMenuItem[];
  label: string;
  tone?: "default" | "inverse";
  triggerContent?: ReactNode;
  triggerTone?: "brand" | "neutral" | "secondary" | "default";
  textInput?: ContextMenuTextInput;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [textInputValue, setTextInputValue] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const hasTextInput = textInput !== undefined;
  const initialTextInputValue = textInput?.value ?? "";

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
    const menuHeight = Math.min(
      items.length * MENU_ITEM_HEIGHT +
        (hasTextInput ? MENU_INPUT_HEIGHT : 0) +
        MENU_PADDING * 2,
      MENU_MAX_HEIGHT,
      viewportRect.bottom - viewportRect.top - MENU_PADDING * 2,
    );
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
  }, [hasTextInput, items.length, open]);

  useEffect(() => {
    if (open && hasTextInput) {
      setTextInputValue(initialTextInputValue);
    }
  }, [hasTextInput, initialTextInputValue, open]);

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
    <MenuAnchor className={className} $wide={triggerContent !== undefined}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        data-swipe-back-ignore
        $tone={tone}
        $triggerTone={triggerTone}
        $wide={triggerContent !== undefined}
        onClick={toggleMenu}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {triggerContent ?? (
          <>
            <i />
            <i />
            <i />
          </>
        )}
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
                  <span>{item.label}</span>
                  {item.selected && <span aria-hidden="true">✓</span>}
                </MenuItem>
              ))}
              {textInput && (
                <MenuInputForm
                  onSubmit={(event) => {
                    event.preventDefault();
                    const nextValue = textInputValue.trim();

                    if (!nextValue) return;

                    setOpen(false);
                    void textInput.onSubmit(nextValue);
                  }}
                >
                  <MenuInput
                    aria-label={textInput.label}
                    placeholder={textInput.placeholder}
                    value={textInputValue}
                    onChange={(event) =>
                      setTextInputValue(event.target.value)
                    }
                  />
                  <MenuInputSubmit
                    type="submit"
                    aria-label={`${textInput.label} 적용`}
                    disabled={!textInputValue.trim()}
                  >
                    ✓
                  </MenuInputSubmit>
                </MenuInputForm>
              )}
            </Menu>
          </DismissLayer>,
          document.body,
        )}
    </MenuAnchor>
  );
}

const MenuAnchor = styled.span<{ $wide: boolean }>`
  width: ${({ $wide }) => ($wide ? "100%" : "var(--space-11)")};
  height: ${({ $wide }) => ($wide ? "auto" : "var(--space-11)")};
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
`;

const Trigger = styled(BaseButton)<{
  $tone: "default" | "inverse";
  $triggerTone: "brand" | "neutral" | "secondary" | "default";
  $wide: boolean;
}>`
  width: ${({ $wide }) => ($wide ? "100%" : "var(--space-11)")};
  height: ${({ $wide }) => ($wide ? "auto" : "var(--space-11)")};
  min-height: ${({ $wide }) => ($wide ? "24px" : "auto")};
  display: grid;
  align-content: center;
  justify-content: center;
  gap: 2px;
  padding: ${({ $wide }) =>
    $wide ? "var(--space-1) var(--space-2)" : "0"};
  border-radius: 999px;
  background: ${({ $triggerTone }) =>
    $triggerTone === "brand"
      ? "var(--color-brand-500)"
      : $triggerTone === "secondary"
        ? "var(--color-secondary-500)"
        : $triggerTone === "neutral"
          ? "var(--color-neutral-500)"
          : "transparent"};
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-100);
  font-stretch: 100%;
  font-weight: 400;
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

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
  max-height: ${MENU_MAX_HEIGHT}px;
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const MenuItem = styled(BaseButton)<{
  $tone: "default" | "danger";
}>`
  min-height: ${MENU_ITEM_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
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
  white-space: pre-line;

  &:hover,
  &:focus-visible {
    background: var(--color-neutral-200);
    outline: none;
  }
`;

const MenuInputForm = styled.form`
  min-height: ${MENU_INPUT_HEIGHT}px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--space-8);
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding: var(--space-2);
  border-top: 1px solid var(--color-border);
`;

const MenuInput = styled.input`
  min-width: 0;
  height: var(--space-8);
  padding: 0 var(--space-2);
  border: 0;
  border-radius: 8px;
  outline: 0;
  background: var(--color-neutral-200);
  color: var(--color-text);
  font-size: var(--font-size-100);

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px var(--color-info);
  }
`;

const MenuInputSubmit = styled(BaseButton)`
  width: var(--space-8);
  height: var(--space-8);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 8px;
  background: var(--color-accent-primary);
  color: var(--color-white);
  font-size: var(--font-size-100);

  &:disabled {
    background: var(--color-border);
    color: var(--color-text-muted);
  }
`;
