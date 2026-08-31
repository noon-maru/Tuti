import assert from "node:assert/strict";
import test from "node:test";
import { resolveAndroidBackDestination } from "../src/features/tuti/navigation/androidBack";

test("앱 최상위 화면에서만 종료 확인을 허용한다", () => {
  assert.equal(resolveAndroidBackDestination("/"), null);
  assert.equal(resolveAndroidBackDestination("/entry"), null);
});

test("메인에서 진입한 설정과 활동 화면은 메인으로 돌아간다", () => {
  for (const pathname of [
    "/inquiry",
    "/journal",
    "/location",
    "/login",
    "/notifications",
    "/legal",
    "/account-deletion",
  ]) {
    assert.equal(resolveAndroidBackDestination(pathname), "/");
  }
});

test("기록 하위 화면은 기록 목록으로 돌아간다", () => {
  for (const pathname of [
    "/journal/detail",
    "/journal/edit",
    "/journal/new",
  ]) {
    assert.equal(resolveAndroidBackDestination(pathname), "/journal");
  }
});

test("법적 문서는 상위 법적 안내로 단계적으로 돌아간다", () => {
  assert.equal(resolveAndroidBackDestination("/legal/privacy"), "/legal");
  assert.equal(
    resolveAndroidBackDestination("/legal/location-terms/"),
    "/legal",
  );
  assert.equal(
    resolveAndroidBackDestination("/legal/privacy/2026-10-01"),
    "/legal/privacy",
  );
});

test("알 수 없는 하위 경로에서도 앱을 종료하지 않고 메인으로 돌아간다", () => {
  assert.equal(resolveAndroidBackDestination("/unexpected"), "/");
});
