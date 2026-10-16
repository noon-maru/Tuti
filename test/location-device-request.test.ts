import assert from "node:assert/strict";
import test from "node:test";
import { requestDeviceLocation } from "@/features/tuti/location/locationAccess";

test("위치 확인 불가를 권한 거부와 구분하고 재시도에서 위치를 받을 수 있다", async (t) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => {
    if (previousNavigator) {
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  let calls = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) {
          calls += 1;
          if (calls === 1) {
            failure({
              code: 2,
              message: "Position update is unavailable",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          } else {
            success({ coords: { latitude: 37.5, longitude: 127 } } as GeolocationPosition);
          }
        },
      },
    },
  });

  assert.deepEqual(await requestDeviceLocation(), { status: "unavailable" });
  assert.deepEqual(await requestDeviceLocation(), {
    status: "ready",
    location: { latitude: 37.5, longitude: 127 },
  });
  assert.equal(calls, 2);
});

test("브라우저의 권한 거부와 시간 초과를 각각 구분한다", async (t) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => {
    if (previousNavigator) {
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  for (const [code, status] of [[1, "denied"], [3, "timeout"]] as const) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        geolocation: {
          getCurrentPosition(_success: PositionCallback, failure: PositionErrorCallback) {
            failure({ code, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          },
        },
      },
    });
    assert.deepEqual(await requestDeviceLocation(), { status });
  }
});
