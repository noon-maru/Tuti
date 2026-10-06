import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import type { TutiPlace } from "@/lib/recommendations";

const place = {
  id: "test-place",
  name: "동네 공원",
  image: "",
  phrase: "잠깐 쉬어가기",
  note: "",
  travelTime: "",
  crowd: "",
  today: "",
  fatigue: 30,
  movementLevel: "near",
  moodTags: [],
} satisfies TutiPlace;

function faceStyles(flipped: boolean, active = true) {
  const html = renderToStaticMarkup(createElement(SwipeCard, {
    cardIndex: 0, place, offset: 0, active, flipped, travelTimeLabel: "10분",
  }));
  return (side: "front" | "back") => {
    const tag = html.match(new RegExp(`<[^>]+data-card-face="${side}"[^>]*>`))?.[0];
    const className = tag?.match(/class="([^"]+)"/)?.[1];
    assert.ok(className);
    const styles = html.match(new RegExp(`\\.${className}\\{([^}]+)\\}`))?.[1];
    assert.ok(styles);
    return styles;
  };
}

test("뒤집힌 카드 앞면은 회전 완료 후 명시적으로 숨긴다", () => {
  const styles = faceStyles(true);
  assert.match(styles("front"), /visibility:hidden/);
  assert.match(styles("front"), /transition:visibility 0s 440ms/);
  assert.match(styles("front"), /pointer-events:none/);
  assert.match(styles("back"), /visibility:visible/);
  assert.match(styles("back"), /transition:visibility 0s 0ms/);
});

test("앞면으로 돌아오거나 비활성화되면 앞면을 즉시 복원한다", () => {
  for (const styles of [faceStyles(false), faceStyles(true, false)]) {
    assert.match(styles("front"), /visibility:visible/);
    assert.match(styles("front"), /transition:visibility 0s 0ms/);
    assert.match(styles("back"), /visibility:hidden/);
    assert.match(styles("back"), /transition:visibility 0s 440ms/);
  }
});
