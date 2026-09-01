import type { Metadata, Viewport } from "next";
import { palette } from "@/styles/tokens";
import EmotionRegistry from "./EmotionRegistry";
import GlobalStyles from "./GlobalStyles";
import { pretendard } from "./fonts";
import { AndroidBackButtonHandler } from "@/features/tuti/components/AndroidBackButtonHandler";

export const metadata: Metadata = {
  metadataBase: new URL("https://tuti.today"),
  title: "Tuti | 오늘 가능한 만큼만, 잠깐 다른 공기로",
  description:
    "현재 위치와 낼 수 있는 시간, 이동 부담을 바탕으로 지금 실행하기 좋은 공간을 조용히 골라주는 저부담 상태 전환 서비스입니다.",
  applicationName: "Tuti",
  category: "travel",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Tuti",
    title: "Tuti | 오늘 가능한 만큼만, 잠깐 다른 공기로",
    description:
      "현재 위치와 낼 수 있는 시간, 이동 부담을 바탕으로 지금 실행하기 좋은 공간을 조용히 골라드려요.",
  },
  twitter: {
    card: "summary",
    title: "Tuti | 오늘 가능한 만큼만, 잠깐 다른 공기로",
    description:
      "현재 위치와 낼 수 있는 시간, 이동 부담을 바탕으로 지금 실행하기 좋은 공간을 조용히 골라드려요.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tuti",
  },
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
          <AndroidBackButtonHandler />
          {children}
        </EmotionRegistry>
      </body>
    </html>
  );
}
