import assert from "node:assert/strict";
import test from "node:test";
import { dragOrderScale, dragOrderTarget, dragOrderTop, dragScrollDelta, orderLocalTop, orderFlipOffset, projectOrderSlots, ORDER_MOVE_TIMING } from "../src/shared/harumadi/dragOrder";

test("들고 있는 마디의 중앙이 이웃 마디의 중앙을 지날 때만 자리를 바꾼다", () => {
  const slots = [{ id: "a", top: 100, height: 80 }, { id: "b", top: 190, height: 120 }, { id: "c", top: 320, height: 100 }];
  assert.equal(dragOrderTarget(slots, "a", 249), 0);
  assert.equal(dragOrderTarget(slots, "a", 251), 1);
  assert.equal(dragOrderTarget(slots, "a", 371), 2);
  assert.equal(dragOrderTarget(slots, "c", 139), 0);
  assert.equal(dragOrderTarget(slots, "c", 141), 1);
});

test("행 높이가 달라도 손을 잡은 지점을 유지하고 스크롤 영역 밖으로 사라지지 않는다", () => {
  assert.equal(dragOrderTop(230, 30, 100, 100, 500), 200);
  assert.equal(dragOrderTop(80, 30, 100, 100, 500), 100);
  assert.equal(dragOrderTop(600, 30, 100, 100, 500), 400);
  assert.equal(dragOrderTop(300, 30, 600, 100, 500), 100);
  // 스크롤·DOM 재배치로 원래 행의 top이 바뀌어도 포인터의 목표 위치는 변하지 않는다.
  const desired = dragOrderTop(330, 25, 110, 100, 500);
  for (const layoutTop of [100, 220, -40]) assert.equal(layoutTop + (desired - layoutTop), 305);
});

test("목록 가운데서는 스크롤하지 않고 가장자리에서만 자동으로 이어 움직인다", () => {
  assert.equal(dragScrollDelta(250, 100, 500), 0);
  assert.ok(dragScrollDelta(110, 100, 500) < 0);
  assert.ok(dragScrollDelta(490, 100, 500) > 0);
  assert.equal(dragScrollDelta(600, 100, 500), 12);
  assert.equal(dragScrollDelta(0, 100, 500), -12);
});

test("PC 목업이 축소돼도 레이아웃 좌표를 화면 좌표로 환산한다", () => {
  assert.equal(dragOrderScale(800, 1000), .8);
  assert.equal(dragOrderScale(0, 0), 1);
  const scale = dragOrderScale(800, 1000);
  const layoutTop = 100, desiredTop = 260;
  const cssShift = (desiredTop - layoutTop) / scale;
  assert.equal(layoutTop + cssShift * scale, desiredTop);
});

test("자리 이동은 스크롤 보정·목업 배율과 무관하게 양방향 같은 거리를 움직인다", () => {
  for (const scale of [1, .8]) {
    for (const listTop of [140, -80]) {
      const upper = orderLocalTop(listTop, listTop, scale);
      const lower = orderLocalTop(listTop + 120 * scale, listTop, scale);
      assert.equal(orderFlipOffset(upper, 120), -120, "위 행이 아래로 밀릴 때 음수 위치에서 시작한다");
      assert.equal(orderFlipOffset(lower, 0), 120, "아래 행이 위로 올라올 때 양수 위치에서 시작한다");
      // 새 목록의 화면 위치는 애니메이션 이동량에 포함하지 않는다.
      assert.equal(orderFlipOffset(orderLocalTop(listTop + 30 * scale, listTop, scale), 120), -90);
    }
  }
  assert.equal(ORDER_MOVE_TIMING.duration, 420);
  assert.equal(ORDER_MOVE_TIMING.easing, "cubic-bezier(.22,.68,.24,1)");
});

test("DOM을 옮기지 않은 미리보기에서도 실제 행 높이와 행 간격을 유지한다", () => {
  const original = [{ id: "a", top: 0, height: 80 }, { id: "b", top: 92, height: 120 }, { id: "c", top: 224, height: 60 }];
  assert.deepEqual(projectOrderSlots(["c", "a", "b"], original), [
    { id: "c", top: 0, height: 60 }, { id: "a", top: 72, height: 80 }, { id: "b", top: 164, height: 120 },
  ]);
  assert.deepEqual(projectOrderSlots([], []), []);
  assert.deepEqual(projectOrderSlots(["a"], [original[0]]), [original[0]]);
});
