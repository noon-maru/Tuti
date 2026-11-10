import assert from "node:assert/strict";
import test from "node:test";
import { cropAspectRatio, cropOutputSize, fitHarumadiPhoto, imageAspectRatio } from "../src/shared/harumadi/imageGeometry";

test("사진 비율 선택과 원본 비율은 방향을 보존하고 출력의 긴 변을 제한한다", () => {
  assert.equal(cropAspectRatio("landscape", 100, 200), 4 / 3);
  assert.equal(cropAspectRatio("square", 100, 200), 1);
  assert.equal(cropAspectRatio("portrait", 100, 200), 3 / 4);
  assert.equal(cropAspectRatio("original", 900, 1600), 9 / 16);
  assert.equal(imageAspectRatio({}), 4 / 3);
  assert.equal(imageAspectRatio({ imageWidth: -1, imageHeight: 0 }), 4 / 3);
  for (const [width, height] of [[4000, 3000], [3000, 4000], [900, 1600], [8000, 200], [30, 40]]) {
    const output = cropOutputSize(width, height);
    assert.ok(output.width <= 1200 && output.height <= 1200);
    assert.ok(Math.abs(output.width / output.height - width / height) < .1);
  }
});
test("지면 안의 사진은 세로·가로·정방형 모두 비율을 보존하고 높이 제한 안에 들어간다", () => {
  for (const ratio of [4 / 3, 1, 3 / 4, 9 / 16, 4, .1]) {
    const size = fitHarumadiPhoto({ imageWidth: ratio * 1000, imageHeight: 1000 }, 335, 320);
    assert.ok(size.width <= 335 && size.height <= 320);
    assert.ok(Math.abs(size.width / size.height - ratio) < 1e-8);
  }
});
