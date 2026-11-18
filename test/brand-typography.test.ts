import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Font } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY, PDF_TITLE_FONT_FAMILY, registerPdfFonts } from "../src/server/pdf/fonts";

test("사용자 기본·포인트 서체와 관리자 서체를 분리하고 포털에도 적용한다", () => {
  const styles = readFileSync("src/app/GlobalStyles.tsx", "utf8");
  assert.match(styles, /--font-sans:\s*var\(--font-line-seed\)/);
  assert.match(styles, /--font-emotional: var\(--font-nanum-square-round\)/);
  assert.match(styles, /body:has\(\[data-admin-design-system\]\)\s*\{\s*--font-sans: var\(--font-pretendard\)/);
  assert.match(readFileSync("src/app/admin/layout.tsx", "utf8"), /<AdminDesignSystem data-admin-design-system>/);
  assert.match(readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8"), /const family = style.fontFamily/);
  for (const family of ["line-seed", "nanum-square-round"]) {
    assert.match(readFileSync(`public/fonts/${family}/LICENSE`, "utf8"), /SIL OPEN FONT LICENSE/);
  }
});

test("정적 본문·제목 서체가 PDF에서 중복 등록 없이 한글 전체 음절을 보존한다", async () => {
  registerPdfFonts();
  registerPdfFonts();
  for (const family of [PDF_FONT_FAMILY, PDF_TITLE_FONT_FAMILY]) {
    assert.equal(Font.getRegisteredFontFamilies().filter(value => value === family).length, 1);
    for (const weight of [400, 500, 600, 700]) {
      await Font.load({ fontFamily: family, fontWeight: weight });
      const font = Font.getFont({ fontFamily: family, fontWeight: weight });
      assert.ok(font.data);
      for (let code = 0xac00; code <= 0xd7a3; code++) {
        assert.ok(font.data.hasGlyphForCodePoint(code), `${family}: U+${code.toString(16)}`);
      }
    }
  }
});
