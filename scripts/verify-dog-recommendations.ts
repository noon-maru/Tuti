import assert from "node:assert/strict";
import { prisma } from "../src/server/db/prisma";
import { createDogRecommendations, dogDistancePolicy } from "../src/server/recommendations/dogEngine";
try {
  assert.ok(await prisma.dogPlaceCatalog.count({ where: { status: "ready" } }), "CATALOG_REGISTRATION_REQUIRED");
  for (const [area, latitude, longitude] of [["seoul",37.5665,126.978],["busan",35.1796,129.0756],["gyeongju",35.79,129.33],["jeju",33.4996,126.5312]] as const) {
    for (const movement of ["near", "short", "half"] as const) {
      const start = performance.now();
      const result = await createDogRecommendations({ answers: { movement, transport: "transit" }, location: { latitude, longitude }, dogOuting: { weightsKg: [8], leash: true, carrier: false } });
      assert.ok(result.places.length <= 6);
      assert.equal(new Set(result.places.map(p => p.id)).size, result.places.length);
      if (result.audit.budgetEligible >= 6) assert.equal(result.places.length, 6);
      for (const place of result.places) {
        assert.ok(place.dogAccess && place.dogRecommendationScore);
        assert.ok(place.distanceMeters! <= dogDistancePolicy[movement]);
        assert.ok(Number.isFinite(place.dogRecommendationScore.total));
        assert.equal(place.fatigueScore, undefined);
      }
      console.log(JSON.stringify({ area, movement, elapsedMs: Math.round(performance.now() - start), audit: result.audit }));
    }
  }
} catch { console.error(JSON.stringify({ status: "failed", privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
