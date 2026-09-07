import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Pretendard";

/** Register local, static fonts before rendering a PDF on the server. */
export function registerPdfFonts() {
  if (Font.getRegisteredFontFamilies().includes(PDF_FONT_FAMILY)) return;

  const fontDirectory = path.join(process.cwd(), "public/fonts/pretendard");

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(fontDirectory, "Pretendard-Light.woff"), fontWeight: 300 },
      { src: path.join(fontDirectory, "Pretendard-Regular.woff"), fontWeight: 400 },
      { src: path.join(fontDirectory, "Pretendard-Medium.woff"), fontWeight: 500 },
      { src: path.join(fontDirectory, "Pretendard-Bold.woff"), fontWeight: 700 },
    ],
  });
}
