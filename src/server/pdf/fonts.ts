import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "LINE Seed KR";
export const PDF_TITLE_FONT_FAMILY = "NanumSquareRound";

/** Register local, static fonts before rendering a PDF on the server. */
export function registerPdfFonts() {
  if (!Font.getRegisteredFontFamilies().includes(PDF_FONT_FAMILY)) Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(process.cwd(), "public/fonts/line-seed/LINESeedKR-Rg.woff"), fontWeight: 400 },
      { src: path.join(process.cwd(), "public/fonts/line-seed/LINESeedKR-Bd.woff"), fontWeight: 700 },
    ],
  });
  if (!Font.getRegisteredFontFamilies().includes(PDF_TITLE_FONT_FAMILY)) Font.register({
    family: PDF_TITLE_FONT_FAMILY,
    fonts: [
      { src: path.join(process.cwd(), "public/fonts/nanum-square-round/NanumSquareRoundR.ttf"), fontWeight: 400 },
      { src: path.join(process.cwd(), "public/fonts/nanum-square-round/NanumSquareRoundB.ttf"), fontWeight: 700 },
    ],
  });
}
