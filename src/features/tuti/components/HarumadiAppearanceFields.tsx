"use client";

import styled from "@emotion/styled";
import { Check, ImageIcon, Type } from "lucide-react";
import { BaseButton } from "./buttons";
import { HARUMADI_COVER_COLORS, HARUMADI_PAPER_COLORS, getHarumadiCoverColor, getHarumadiPaperPalette, type HarumadiPaperColor } from "@/shared/harumadi/colors";
import type { HarumadiPdfCoverStyle } from "@/shared/api/harumadiPdf";
import { HarumadiPageSheet } from "./HarumadiSheet";
import { captionStyles } from "@/shared/ui/typography";

type Appearance = { coverStyle: HarumadiPdfCoverStyle; paperColor?: HarumadiPaperColor };
/** 책 설정과 PDF 만들기가 같은 색 이름·선택 상태·조작 크기를 사용한다. */
export function HarumadiAppearanceFields({ value, onChange, disabled = false }: {
  value: Appearance; onChange: (value: Appearance) => void; disabled?: boolean;
}) {
  const color = getHarumadiCoverColor(value.coverStyle), photo = value.coverStyle.endsWith("-image");
  const paper = getHarumadiPaperPalette(value.paperColor);
  return <AppearanceFields data-harumadi-appearance>
    <Group disabled={disabled}><legend>표지 구성</legend><Layouts>
      {[{ image: false, label: "사진 없이", Icon: Type }, { image: true, label: "사진과 함께", Icon: ImageIcon }].map(({ image, label, Icon }) =>
        <LayoutChoice key={label} type="button" aria-pressed={photo === image} onClick={() => onChange({ ...value, coverStyle: `${color}-${image ? "image" : "plain"}` })}>
          <Icon size={16} aria-hidden="true" />{label}{photo === image && <Check size={14} aria-hidden="true" />}
        </LayoutChoice>)}
    </Layouts></Group>
    <Group disabled={disabled}><legend>표지 색상</legend><Colors>
      {HARUMADI_COVER_COLORS.map(option => <ColorChoice key={option.id} type="button" aria-label={`표지 ${option.label}`} aria-pressed={color === option.id}
        onClick={() => onChange({ ...value, coverStyle: `${option.id}-${photo ? "image" : "plain"}` })}>
        <Swatch style={{ background: option.background, color: option.foreground }}>{color === option.id && <Check size={17} aria-hidden="true" />}</Swatch>
        <span>{option.label}</span>
      </ColorChoice>)}
    </Colors></Group>
    <Group disabled={disabled}><legend>속지 색상</legend><PaperSelection>
      <PaperPreview role="img" aria-label={`${paper.label} 속지 미리보기`}>
        <div aria-hidden="true"><HarumadiPageSheet
          page={{ kind: "empty", title: "", content: "", image: null, date: "", place: "" }}
          coverStyle={value.coverStyle} paperColor={paper.id} number={1} preview
        /></div>
      </PaperPreview>
      <PaperOptions><Colors>
      {HARUMADI_PAPER_COLORS.map(option => <ColorChoice key={option.id} type="button" aria-label={`속지 ${option.label}`} aria-pressed={(value.paperColor ?? "white") === option.id}
        onClick={() => onChange({ ...value, paperColor: option.id })}>
        <Swatch style={{ background: option.background }}>{(value.paperColor ?? "white") === option.id && <Check size={17} aria-hidden="true" />}</Swatch>
        <span>{option.label}</span>
      </ColorChoice>)}
      </Colors><PaperLabel aria-live="polite">{paper.label} 속지</PaperLabel></PaperOptions>
    </PaperSelection></Group>
  </AppearanceFields>;
}
const AppearanceFields = styled.div`display: grid; gap: 20px; container: harumadi-colors / inline-size;`;
const Group = styled.fieldset`&& { min-width: 0; margin: 0; padding: 0; border: 0; } && legend { padding: 0; margin-bottom: 10px; font-size: 14px; font-weight: 700; } &:disabled { opacity: .55; }`;
const Layouts = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`;
const LayoutChoice = styled(BaseButton)`display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 8px; border: 1px solid var(--color-border); border-radius: 12px; color: var(--color-text); background: var(--color-surface); font-size: 13px;
  &[aria-pressed="true"] { border-color: var(--color-brand-700); background: var(--color-brand-100); }`;
const Colors = styled.div`display: grid; grid-template-columns: repeat(6, minmax(44px, 1fr)); gap: 2px; @container harumadi-colors (max-width: 273px) { grid-template-columns: repeat(3, minmax(44px, 1fr)); }`;
const ColorChoice = styled(BaseButton)`display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; min-height: 62px; padding: 4px 0; color: var(--color-text-muted); background: transparent; font-size: 12px; line-height: 1.4; border-radius: 10px;
  &[aria-pressed="true"] { color: var(--color-text); > span:first-of-type { outline: 2px solid var(--color-brand-700); outline-offset: 2px; } }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: 2px; }
  &:hover:not(:disabled) { background: var(--color-brand-100); }`;
const Swatch = styled.span`display: grid; place-items: center; flex: none; width: 32px; height: 32px; border: 1px solid #7d898e; border-radius: 50%; color: #303030;`;
const PaperSelection = styled.div`display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 12px; @container harumadi-colors (max-width: 249px) { grid-template-columns: minmax(0, 1fr); justify-items: center; }`;
const PaperPreview = styled.div`width: 92px; overflow: hidden; border: 1px solid var(--color-border); border-radius: 2px;
  [data-harumadi-page] { --hm-title: 10px; --hm-body: 9px; --hm-line: 1.6; }
`;
const PaperOptions = styled.div`width: 100%; min-width: 0; display: grid; gap: 8px; > div { grid-template-columns: repeat(3, minmax(44px, 1fr)); }`;
const PaperLabel = styled.p`${captionStyles} margin: 0; text-align: center;`;
