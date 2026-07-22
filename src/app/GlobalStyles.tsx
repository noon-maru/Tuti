"use client";

import { Global, css } from "@emotion/react";
import { palette } from "@/styles/tokens";

const globalStyles = css`
  :root {
    color-scheme: light;

    /* Neutral */
    --color-neutral-100: ${palette.neutral[100]};
    --color-neutral-200: ${palette.neutral[200]};
    --color-neutral-300: ${palette.neutral[300]};
    --color-neutral-400: ${palette.neutral[400]};
    --color-neutral-500: ${palette.neutral[500]};
    --color-neutral-600: ${palette.neutral[600]};
    --color-neutral-700: ${palette.neutral[700]};
    --color-neutral-800: ${palette.neutral[800]};
    --color-neutral-900: ${palette.neutral[900]};
    --color-neutral-1000: ${palette.neutral[1000]};
    --color-neutral-1100: ${palette.neutral[1100]};
    --color-neutral-1200: ${palette.neutral[1200]};
    --color-neutral-1300: ${palette.neutral[1300]};

    /* Brand blue */
    --color-brand-100: ${palette.brand[100]};
    --color-brand-200: ${palette.brand[200]};
    --color-brand-300: ${palette.brand[300]};
    --color-brand-400: ${palette.brand[400]};
    --color-brand-500: ${palette.brand[500]};
    --color-brand-600: ${palette.brand[600]};
    --color-brand-700: ${palette.brand[700]};
    --color-brand-800: ${palette.brand[800]};
    --color-brand-900: ${palette.brand[900]};
    --color-brand-1000: ${palette.brand[1000]};

    /* Secondary green */
    --color-secondary-100: ${palette.secondary[100]};
    --color-secondary-200: ${palette.secondary[200]};
    --color-secondary-300: ${palette.secondary[300]};
    --color-secondary-400: ${palette.secondary[400]};
    --color-secondary-500: ${palette.secondary[500]};
    --color-secondary-600: ${palette.secondary[600]};
    --color-secondary-700: ${palette.secondary[700]};
    --color-secondary-800: ${palette.secondary[800]};
    --color-secondary-900: ${palette.secondary[900]};
    --color-secondary-1000: ${palette.secondary[1000]};

    /* Status */
    --color-warning: ${palette.status.warning};
    --color-error: ${palette.status.error};
    --color-success: ${palette.status.success};
    --color-info: var(--color-brand-800);

    /* Semantic */
    --color-app-background: var(--color-neutral-200);
    --color-surface: var(--color-neutral-100);
    --color-text: var(--color-neutral-1300);
    --color-text-muted: var(--color-neutral-900);
    --color-border: var(--color-neutral-500);
    --color-accent-primary: var(--color-brand-500);
    --color-accent-secondary: var(--color-secondary-500);
    --color-accent-soft: var(--color-secondary-200);

    /* Compatibility aliases */
    --color-black: var(--color-neutral-1300);
    --color-white: var(--color-neutral-100);
    --color-gray-50: var(--color-neutral-200);
    --color-gray-300: var(--color-neutral-500);
    --color-gray-700: var(--color-neutral-900);
    --color-green-soft: var(--color-secondary-200);
    --color-blue: var(--color-brand-500);
    --color-green: var(--color-secondary-500);
    --color-black-rgb: 0 0 0;
    --color-white-rgb: 255 255 255;

    /* Typography: base 14px, 2px minor scale */
    --font-sans:
      var(--font-pretendard), Pretendard, -apple-system, BlinkMacSystemFont,
      "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif;
    --font-size-100: 0.75rem; /* 12px */
    --font-size-200: 0.875rem; /* 14px, base */
    --font-size-300: 1rem; /* 16px */
    --font-size-400: 1.125rem; /* 18px */
    --font-size-500: 1.25rem; /* 20px */
    --font-size-600: 1.375rem; /* 22px */
    --font-size-700: 1.5rem; /* 24px */
    --line-height-heading: 1.2;
    --line-height-subtitle: 1.4;
    --line-height-body: 1.5;
    --letter-spacing-heading: 0.005em;
    --letter-spacing-subtitle: -0.005em;
    --letter-spacing-body: -0.015em;

    /* 4px spacing grid */
    --space-0: 0;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-7: 28px;
    --space-8: 32px;
    --space-9: 36px;
    --space-10: 40px;
    --space-11: 44px;
    --space-12: 48px;
    --space-14: 56px;
    --space-16: 64px;

    /* Reference values; use src/styles/tokens.ts in media queries. */
    --breakpoint-mobile: 480px;
    --breakpoint-tablet: 768px;
    --breakpoint-laptop: 1024px;
    --breakpoint-desktop: 1280px;
    --breakpoint-wide: 1536px;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    min-width: 320px;
    min-height: 100%;
    background: var(--color-app-background);
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  html,
  body {
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    max-width: 100vw;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }

  body {
    display: flex;
    flex-direction: column;
    color: var(--color-text);
    background: var(--color-app-background);
    font-family: var(--font-sans);
    font-size: var(--font-size-200);
    font-stretch: 100%;
    font-synthesis: none;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }

  small {
    font-size: var(--font-size-100);
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  input,
  textarea,
  select {
    margin: 0;
    color: inherit;
    font: inherit;
  }

  a,
  button {
    -webkit-tap-highlight-color: transparent;
  }

  button {
    -webkit-appearance: none;
    appearance: none;
  }

  button:disabled {
    cursor: default;
  }

  img,
  picture,
  svg,
  canvas,
  video {
    display: block;
    max-width: 100%;
  }

  :focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }

  ::selection {
    color: var(--color-text);
    background: var(--color-accent-soft);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export default function GlobalStyles() {
  return <Global styles={globalStyles} />;
}
