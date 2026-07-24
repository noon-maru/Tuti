export const palette = {
  neutral: {
    100: "#FFFFFF",
    200: "#F4F4F2",
    300: "#EAEAE7",
    400: "#DDDDDA",
    500: "#CFCFCF",
    600: "#B7B7B7",
    700: "#9F9F9F",
    800: "#7F7F7F",
    900: "#606060",
    1000: "#474747",
    1100: "#303030",
    1200: "#181818",
    1300: "#000000",
  },
  brand: {
    100: "#F1F7FD",
    200: "#E1EFFB",
    300: "#CDE3F8",
    400: "#ADD1F4",
    500: "#8CBDEF",
    600: "#68A7E6",
    700: "#438FD7",
    800: "#2D73B8",
    900: "#245A8E",
    1000: "#1C4268",
  },
  secondary: {
    100: "#F6FBEA",
    200: "#EBF5D5",
    300: "#E0F2BD",
    400: "#D4EDA2",
    500: "#C7EA86",
    600: "#AEDD62",
    700: "#91C943",
    800: "#73A92F",
    900: "#577F27",
    1000: "#3C591D",
  },
  status: {
    warning: "#9A5C00",
    error: "#C83D4A",
    success: "#2F7D4A",
  },
} as const;

export const breakpoints = {
  mobile: 480,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
  wide: 1536,
} as const;

export const layoutHeightRange = {
  min: 690,
  max: 960,
} as const;

export function fluidByViewportHeight(
  minViewportValue: number,
  maxViewportValue: number,
) {
  const viewportRange = layoutHeightRange.max - layoutHeightRange.min;
  const slope = (maxViewportValue - minViewportValue) / viewportRange;
  const viewportCoefficient = slope * 100;
  const intercept = minViewportValue - slope * layoutHeightRange.min;
  const lowerBound = Math.min(minViewportValue, maxViewportValue);
  const upperBound = Math.max(minViewportValue, maxViewportValue);
  const operator = intercept < 0 ? "-" : "+";

  return `clamp(${lowerBound}px, calc(${viewportCoefficient.toFixed(6)}cqh ${operator} ${Math.abs(intercept).toFixed(6)}px), ${upperBound}px)`;
}

export const spacingUnit = 4;
