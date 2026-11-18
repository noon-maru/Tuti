import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import { BaseButton, PrimaryButton, readerActionButtonStyles } from "@/shared/ui/buttons";

test("파랑·연두 하단 버튼은 같은 최종 높이·패딩·행간을 사용한다", () => {
  const Primary = styled(PrimaryButton)`${readerActionButtonStyles}`;
  const Secondary = styled(BaseButton)`${readerActionButtonStyles}`;
  for (const Component of [Primary, Secondary]) {
    const html = renderToStaticMarkup(createElement(Component, null, "실물로 소장하기"));
    const last = (property: string) => [...html.matchAll(new RegExp(`${property}:([^;]+);`, "g"))].at(-1)?.[1];
    assert.equal(last("min-height"), "var(--ui-action-height)");
    assert.equal(last("padding"), "10px 12px");
    assert.equal(last("line-height"), "1.6");
    assert.equal(last("font-size"), "var(--ui-body-size)");
    assert.equal(last("white-space"), "normal");
  }
});

test("작성·함께 채우기·PDF·실물 소장은 같은 하단 치수를 공유한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  for (const name of ["TogetherEntry", "PdfSaveButton", "WriteButton"]) assert.match(flow, new RegExp(`const ${name} = styled[^\x60]+\x60\\$\\{readerActionButtonStyles\\}`));
  const purchase = readFileSync("src/features/tuti/components/HarumadiPurchaseButton.tsx", "utf8");
  assert.match(purchase, /\$compact && readerActionButtonStyles/);
});
