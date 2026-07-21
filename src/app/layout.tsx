import type { Metadata } from "next";
import EmotionRegistry from "./EmotionRegistry";
import GlobalStyles from "./GlobalStyles";
import { pretendard } from "./fonts";

export const metadata: Metadata = {
  title: "Tuti",
  description: "오늘 가능한 만큼만, 잠깐 다른 공기로.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/assets/icons/icon-192.png",
  },
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
