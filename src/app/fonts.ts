import localFont from "next/font/local";

export const pretendard = localFont({
  src: [
    {
      path: "../../public/fonts/pretendard/Pretendard-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/pretendard/Pretendard-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/pretendard/Pretendard-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/pretendard/Pretendard-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/pretendard/Pretendard-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pretendard",
  display: "swap",
  preload: false,
});

export const lineSeed = localFont({
  src: [
    { path: "../../public/fonts/line-seed/LINESeedKR-Rg.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/line-seed/LINESeedKR-Bd.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-line-seed",
  display: "swap",
});

export const nanumSquareRound = localFont({
  src: [
    { path: "../../public/fonts/nanum-square-round/NanumSquareRoundR.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/nanum-square-round/NanumSquareRoundB.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-nanum-square-round",
  display: "swap",
  preload: false,
});
