import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import styled from "@emotion/styled";
import * as jsx from "react/jsx-runtime";
import * as fields from "../../src/shared/api/firstJournal";
import * as copy from "../../src/shared/tuti/madiFields";
import * as dates from "../../src/lib/date/koreanDate";
import { newMadiDraftContext } from "../../src/lib/madiDraft";
import { harumadiSharingNotice } from "../../src/shared/harumadi/sharingAudience";
import type { ComponentProps } from "react";
import type { MadiCreateScreen } from "../../src/features/tuti/screens/journal/MadiCreateScreen";

type Element = { props?: Record<string, unknown> };
export function findMadiControl(root: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (Array.isArray(root)) return root.map(child => findMadiControl(child, predicate)).find(Boolean);
  if (!root || typeof root !== "object") return;
  const props = (root as Element).props;
  return props && (predicate(props) ? props : findMadiControl(props.children, predicate));
}

/** Drive the real screen handlers, substituting only hooks, browser APIs and child surfaces. */
export function madiCreateHarness(props: ComponentProps<typeof MadiCreateScreen>, stage = "write") {
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  let cursor = 0, refCursor = 0, finished = 0;
  const tag = "div";
  const deps: Record<string, unknown> = {
    react: { ...React, useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in states)) states[index] = index === 0 ? stage : typeof initial === "function" ? initial() : initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    }, useRef: (initial: unknown) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }), useEffect() {}, useCallback: (fn: unknown) => fn },
    "react/jsx-runtime": jsx, "@emotion/styled": { __esModule: true, default: styled },
    "next/image": { __esModule: true, default: tag },
    "lucide-react": { Camera: tag, ImagePlus: tag, Check: tag, ArrowRight: tag, PenLine: tag },
    "@/shared/ui/typography": Object.fromEntries(["screenTitleStyles", "sectionHeadingStyles", "bodyCopyStyles", "captionStyles", "inputControlStyles", "nativeDateInputStyles"].map(key => [key, ""])),
    "@/features/tuti/components/MadiFieldLabel": { MadiFieldLabel: tag },
    "@/shared/tuti/madiFields": copy,
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: tag },
    "@/features/tuti/components/buttons": { BackButton: "button", Button: "button", PrimaryButton: "button", TextButton: "button" },
    "@/features/tuti/components/ImageCropDialog": { ImageCropDialog: tag },
    "@/features/tuti/lib/readImageMetadata": { readImageMetadata: async () => ({}) },
    "@/features/tuti/navigation/androidBack": { ANDROID_BACK_EVENT: "back" },
    "@/lib/date/koreanDate": dates, "@/shared/api/firstJournal": fields,
    "./MadiHarumadiSelection": { MadiHarumadiSelection: "selection" },
    "@/features/tuti/hooks/useMadiDraft": { useMadiDraft: () => ({ ready: true, notice: "", finish: async () => { finished++; }, leave: async (fn: () => void) => fn() }) },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: tag },
    "@/features/tuti/components/JournalPlacePicker": { JournalPlacePicker: tag },
    "@/features/tuti/components/MadiFieldFeedback": { MadiFieldFeedback: tag },
    "@/lib/madiDraft": { newMadiDraftContext },
    "@/shared/harumadi/sharingAudience": { harumadiSharingNotice },
  };
  const exports: { MadiCreateScreen?: (props: unknown) => unknown } = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/screens/journal/MadiCreateScreen.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, require: (id: string) => { if (!(id in deps)) throw Error(`Unexpected dependency ${id}`); return deps[id]; }, Date, URL });
  const render = () => { cursor = 0; refCursor = 0; return exports.MadiCreateScreen!(props); };
  const text = (node: unknown): string => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") :
    node && typeof node === "object" ? text((node as Element).props?.children) : "";
  const control = (label: string) => findMadiControl(render(), p => p["aria-label"] === label || Boolean(p.onClick && text(p.children).trim() === label))!;
  return { render, control, finished: () => finished,
    change: (label: string, value: string) => (control(label).onChange as (e: unknown) => void)({ target: { value } }),
    click: (label: string) => { const node = control(label); if (!node || node.disabled) throw Error(`Missing/enabled control: ${label}`); (node.onClick as () => void)(); },
  };
}
