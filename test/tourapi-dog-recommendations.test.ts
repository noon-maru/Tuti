import assert from "node:assert/strict";
import test from "node:test";
import { tourApiDogAccess, tourApiDogAccessStatus, TOUR_API_PET_FRESHNESS_MS } from "../src/shared/pets/tourApiDogAccess";
import { petTourRecord } from "../src/server/tourism/petTourRecord";
import { parsePetTourArtifact } from "../src/server/tourism/petTourArtifact";

const now = Date.parse("2026-11-17T06:00:00Z"), fetched = new Date(now - 1000);
const outing = { weightsKg: [5, 8], leash: true, carrier: false };
test("공식 등록은 세부 조건 미확인으로 유지하며 수집일을 시설 확인일로 바꾸지 않는다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능" }, fetched, now)!;
  assert.equal(access.needsConfirmation, true); assert.equal(access.animals, null);
  assert.equal(access.maxWeightKg, null); assert.equal(access.carrierRequired, null); assert.equal(access.leashRequired, null);
  assert.equal("checkedAt" in access, false);
  assert.equal(tourApiDogAccessStatus(access, outing, now), "needs-confirmation");
  assert.equal(tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능" }, new Date(now + 1000), now), null);
  assert.equal(tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능" }, new Date(now - TOUR_API_PET_FRESHNESS_MS), now), null);
  assert.equal(tourApiDogAccess({ title: "애견 카페" }, fetched, now), null);
  assert.equal(tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능", acmpyPsblCpam: "반려견 동반 불가" }, fetched, now), null);
});
test("알려진 몸무게와 준비물 불충족은 제외하되 복잡한 추가 조건은 원문으로 남긴다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", acmpyPsblCpam: "9kg 이하 동반 가능", acmpyNeedMtr: "목줄 착용", etcAcmpyInfo: "맹견 제외 · 매장별 사전 문의" }, fetched, now)!;
  assert.equal(tourApiDogAccessStatus(access, { ...outing, weightsKg: [5, 10] }, now), "blocked");
  assert.equal(tourApiDogAccessStatus(access, { ...outing, leash: false }, now), "blocked");
  assert.equal(tourApiDogAccessStatus(access, { ...outing, weightsKg: [] }, now), "needs-confirmation");
  assert.match(access.rules, /맹견 제외/);
  const exclusive = tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능", acmpyPsblCpam: "9kg 미만 동반 가능", acmpyNeedMtr: "이동장(켄넬)사용" }, fetched, now)!;
  assert.equal(tourApiDogAccessStatus(exclusive, { ...outing, carrier: true, weightsKg: [9] }, now), "blocked");
  assert.equal(tourApiDogAccessStatus(exclusive, outing, now), "blocked");
});
test("파일 전체를 선검증하고 중복·출처·날짜·ID 조작을 DB 적용 전에 거절한다", () => {
  const record = petTourRecord("kor", { contentid: "1", acmpyTypeCd: "전구역 동반가능" }, fetched);
  const raw = JSON.stringify(record) + "\n", parsed = parsePetTourArtifact(raw, "kor", now);
  assert.equal(parsed.records.length, 1); assert.equal(parsed.officialListings, 1);
  assert.match(parsed.sha256, /^[a-f0-9]{64}$/);
  for (const content of [raw + raw, "", JSON.stringify({ ...record, contentId: "2" }), JSON.stringify({ ...record, sourceUrl: "https://other.example" }), JSON.stringify({ ...record, facilityVerifiedAt: fetched.toISOString() }), JSON.stringify({ ...record, fetchedAt: new Date(now + 1000).toISOString() })]) assert.throws(() => parsePetTourArtifact(content, "kor", now));
  assert.throws(() => parsePetTourArtifact(JSON.stringify(record), "pet", now));
});
