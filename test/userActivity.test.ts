import assert from "node:assert/strict";
import test from "node:test";
import {
  isMeaningfulActivityStage,
  resolveUserActivityStage,
} from "../src/server/admin/userActivity";

test("계정 생성과 실제 방문 단계를 구분한다", () => {
  assert.equal(
    resolveUserActivityStage({
      productActions: [],
      recommendationRuns: 0,
      recommendationActions: [],
      journalCount: 0,
    }),
    "created",
  );
  assert.equal(
    resolveUserActivityStage({
      productActions: ["main_viewed"],
      recommendationRuns: 0,
      recommendationActions: [],
      journalCount: 0,
    }),
    "visited",
  );
});

test("추천과 후속 행동 및 전환 단계를 순서대로 판정한다", () => {
  assert.equal(
    resolveUserActivityStage({
      productActions: ["main_viewed"],
      recommendationRuns: 1,
      recommendationActions: [],
      journalCount: 0,
    }),
    "recommended",
  );
  assert.equal(
    resolveUserActivityStage({
      productActions: [],
      recommendationRuns: 1,
      recommendationActions: ["place_selected"],
      journalCount: 0,
    }),
    "engaged",
  );
  assert.equal(
    resolveUserActivityStage({
      productActions: [],
      recommendationRuns: 1,
      recommendationActions: ["navigation_started"],
      journalCount: 0,
    }),
    "converted",
  );
  assert.equal(
    resolveUserActivityStage({
      productActions: [],
      recommendationRuns: 0,
      recommendationActions: [],
      journalCount: 1,
    }),
    "converted",
  );
});

test("추천 도달 이상만 의미 있는 이용으로 집계한다", () => {
  assert.equal(isMeaningfulActivityStage("created"), false);
  assert.equal(isMeaningfulActivityStage("visited"), false);
  assert.equal(isMeaningfulActivityStage("recommended"), true);
  assert.equal(isMeaningfulActivityStage("engaged"), true);
  assert.equal(isMeaningfulActivityStage("converted"), true);
});
