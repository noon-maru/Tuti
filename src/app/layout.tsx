import type { Metadata, Viewport } from "next";
import { palette } from "@/styles/tokens";
import EmotionRegistry from "./EmotionRegistry";
import GlobalStyles from "./GlobalStyles";
import { pretendard } from "./fonts";
import { AndroidBackButtonHandler } from "@/features/tuti/components/AndroidBackButtonHandler";
import { Suspense } from "react";
import { FeedbackHost } from "@/shared/ui/FeedbackHost";

export const metadata: Metadata = {
  metadataBase: new URL("https://tuti.today"),
  title: "Tuti | 일상을 추억으로, 추억을 한 권으로",
  description:
    "반려동물과 함께한 순간도, 나만의 하루도. 사진과 짧은 이야기로 일상을 기록하고 한 권의 하루마디로 모으는 라이프로그 서비스예요.",
  applicationName: "Tuti",
  category: "lifestyle",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Tuti",
    title: "Tuti | 일상을 추억으로, 추억을 한 권으로",
    description:
      "반려견과의 산책, 반려묘와의 집 안 일상, 나만의 하루까지. 소중한 순간을 남기고 한 권의 하루마디로 모아보세요.",
  },
  twitter: {
    card: "summary",
    title: "Tuti | 일상을 추억으로, 추억을 한 권으로",
    description:
      "반려견과의 산책, 반려묘와의 집 안 일상, 나만의 하루까지. 소중한 순간을 남기고 한 권의 하루마디로 모아보세요.",
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
          <Suspense fallback={null}><FeedbackHost /></Suspense>
        </EmotionRegistry>
      </body>
    </html>
  );
}
