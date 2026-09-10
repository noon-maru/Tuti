import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchHighSpeedRailSchedules,
  fetchTrainSchedules,
} from "@/server/transport/dataGoTransportClient";

test("열차 운행편은 추천에 사용할 날짜를 그대로 요청한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DATA_GO_KR_API_KEY;
  let requestedDate: string | null = null;
  process.env.DATA_GO_KR_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    requestedDate = new URL(String(input)).searchParams.get("depPlandTime");
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: { items: {} },
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    await fetchTrainSchedules({
      departureStationId: "NAT010000",
      arrivalStationId: "NAT011668",
      departureDate: "20260910",
    });
    assert.equal(requestedDate, "20260910");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DATA_GO_KR_API_KEY;
    else process.env.DATA_GO_KR_API_KEY = originalKey;
  }
});

test("고속철도 시간표는 한 번 조회하고 KTX와 SRT만 남긴다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DATA_GO_KR_API_KEY;
  let requestCount = 0;
  let requestedGrade: string | null = null;
  process.env.DATA_GO_KR_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    requestCount += 1;
    requestedGrade = new URL(String(input)).searchParams.get("trainGradeCode");
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: {
          items: {
            item: [
              { traingradename: "KTX" },
              { traingradename: "SRT" },
              { traingradename: "ITX-새마을" },
              { traingradename: "무궁화호" },
            ],
          },
        },
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const services = await fetchHighSpeedRailSchedules({
      departureStationId: "NAT010000",
      arrivalStationId: "NAT013271",
      departureDate: "20260910",
    });
    assert.equal(requestCount, 1);
    assert.equal(requestedGrade, null);
    assert.deepEqual(
      services.map((service) => service.traingradename),
      ["KTX", "SRT"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DATA_GO_KR_API_KEY;
    else process.env.DATA_GO_KR_API_KEY = originalKey;
  }
});
