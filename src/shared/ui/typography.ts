import { css } from "@emotion/react";

/** Small-trip app language for controls around the book, never the printed page. */
export const screenTitleStyles = css`
  margin: 0; min-width: 0; font-size: var(--ui-title-size); font-weight: var(--ui-title-weight);
  line-height: 1.4; letter-spacing: var(--ui-title-tracking); text-wrap: balance; overflow-wrap: anywhere;
`;
export const sectionHeadingStyles = css`
  ${screenTitleStyles}
  font-size: var(--ui-heading-size);
`;
export const bodyCopyStyles = css`
  font-size: var(--ui-body-size); font-weight: 400; line-height: 1.7; text-wrap: pretty; overflow-wrap: anywhere;
`;
export const captionStyles = css`
  font-size: var(--ui-caption-size); font-weight: 400; line-height: 1.6; color: var(--color-text-muted);
`;
export const inputControlStyles = css`
  display: block; box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%;
  min-height: var(--ui-control-height); padding: 14px; border: 1px solid var(--color-border);
  border-radius: var(--ui-field-radius); background: var(--color-surface); color: var(--color-text);
  font: inherit; font-size: var(--ui-input-size); font-weight: 400; line-height: 1.7;
  caret-color: var(--color-brand-800);
  &::placeholder { color: var(--color-text-muted); opacity: 1; }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;
