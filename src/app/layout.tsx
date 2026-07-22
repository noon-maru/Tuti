import type { Metadata, Viewport } from "next";
import { palette } from "@/styles/tokens";
import EmotionRegistry from "./EmotionRegistry";
import GlobalStyles from "./GlobalStyles";
import { pretendard } from "./fonts";

export const metadata: Metadata = {
  title: "Tuti",
  description: "오늘 가능한 만큼만, 잠깐 다른 공기로.",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/tuti-symbol.svg",
    apple: "/app-icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: palette.neutral[100],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <EmotionRegistry>
          <GlobalStyles />
          {children}
        </EmotionRegistry>
      </body>
    </html>
  );
}
