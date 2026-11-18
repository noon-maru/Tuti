import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { palette } from "../src/styles/tokens";

test("책장만 웜 화이트를 쓰고 공용 내비게이션의 기본 바탕은 유지한다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const navigation = readFileSync("src/features/tuti/components/MainNavigation.tsx", "utf8");
  assert.match(home, /background: var\(--library-background\)/);
  assert.match(home, /--library-background: \$\{palette.surface.library\}/);
  assert.match(home, /--main-navigation-background: var\(--library-background\)/);
  assert.match(navigation, /background: var\(--main-navigation-background, var\(--color-surface\)\)/);
  assert.doesNotMatch(home, /--color-surface:/);
  const rgb = palette.surface.library.slice(1).match(/../g)!.map(value => parseInt(value, 16));
  assert.ok(rgb[0] > rgb[1] && rgb[1] > rgb[2] && rgb[2] >= 245);
});

test("웜 화이트에서도 책장 본문과 보조 문구의 대비를 유지한다", () => {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const text of [palette.neutral[1200], palette.neutral[900]]) {
    assert.ok((luminance(palette.surface.library) + .05) / (luminance(text) + .05) >= 4.5);
  }
});
