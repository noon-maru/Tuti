import assert from "node:assert/strict";
import { prisma } from "../src/server/db/prisma";
import { createDogRecommendations, dogDistancePolicy } from "../src/server/recommendations/dogEngine";
import { matchesDogPurpose } from "../src/server/recommendations/dogDestination";
import { dogAccessStatus } from "../src/shared/pets/dogAccess";
import { tourApiDogAccessStatus } from "../src/shared/pets/tourApiDogAccess";
import type { DogOuting } from "../src/shared/pets/dogAccess";
import type { IntakeAnswers } from "../src/shared/tuti/types";
import { outingMovement } from "../src/shared/tuti/movementTimeBudget";

// Fixed public coordinates only. Never reads account history or writes visits/recommendation runs.
try {
  const selected = new Set<string>();
  for (const [area, latitude, longitude] of [["seoul",37.5665,126.978],["gyeongju",35.79,129.33],["jeju",33.4996,126.5312]] as const) {
    for (const purpose of ["walk", "cafe", "outing"] as const) {
      const dogOuting = { weightsKg: [8], leash: true, carrier: false, purpose };
      const result = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "short", transport: "transit" }, location: { latitude, longitude }, dogOuting });
      const matches = result.ranked.filter(place => matchesDogPurpose(place, dogOuting));
      assert.equal(result.places.filter(place => matchesDogPurpose(place, dogOuting)).length, Math.min(6, matches.length));
      for (const place of result.places) { selected.add(place.id); assert.ok(place.dogAccess); }
      console.log(JSON.stringify({ area, purpose, eligible: result.audit.companionEligible, matching: matches.length,
        places: result.places.map(p => ({ id: p.id, name: p.name, type: p.experienceType, image: Boolean(p.image) })) }));
    }
  }
  const baseline: DogOuting = { weightsKg: [8], leash: true, carrier: false };
  const scenarios: Array<{ label: string; answers: IntakeAnswers; dogOuting?: DogOuting }> = [
    { label: "near-no-conditions", answers: { movement: "near", transport: "transit" } },
    { label: "car-short-walk", answers: { movement: "short", transport: "car" }, dogOuting: { ...baseline, purpose: "walk" } },
    { label: "car-half", answers: { movement: "half", transport: "car" }, dogOuting: baseline },
    { label: "far-unspecified-timing", answers: { movement: "far", transport: "car" }, dogOuting: baseline },
    ...(["tomorrow_day_trip", "overnight_trip"] as const).map(longDistanceTiming => ({ label: longDistanceTiming, answers: { movement: "far" as const, transport: "car" as const, longDistanceTiming }, dogOuting: baseline })),
    { label: "large-dog", answers: { movement: "short", transport: "transit" }, dogOuting: { ...baseline, weightsKg: [30] } },
    { label: "multiple-dogs", answers: { movement: "short", transport: "transit" }, dogOuting: { ...baseline, weightsKg: [5, 30] } },
    { label: "no-leash", answers: { movement: "short", transport: "transit" }, dogOuting: { ...baseline, leash: false } },
    { label: "with-carrier", answers: { movement: "short", transport: "transit" }, dogOuting: { ...baseline, carrier: true } },
  ];
  const originalFetch = globalThis.fetch;
  let externalRequests = 0, verifiedScenarios = 0;
  globalThis.fetch = async () => { externalRequests++; throw Error("UNEXPECTED_EXTERNAL_REQUEST"); };
  try {
    for (const [latitude, longitude] of [[37.5665,126.978],[35.79,129.33],[33.4996,126.5312]]) for (const scenario of scenarios) {
      const answers = { ...scenario.answers, petCompanion: "dog" as const };
      const result = await createDogRecommendations({ ...scenario, answers, location: { latitude, longitude } });
      assert.ok(result.places.length <= 6);
      for (const place of result.places) {
        assert.ok(place.distanceMeters! <= dogDistancePolicy[outingMovement(answers)]);
        if (scenario.answers.transport === "car") assert.ok(place.distanceMeters! >= 2000);
        assert.ok(scenario.answers.longDistanceTiming === "overnight_trip" || place.sourceContentType !== "32");
        const access = place.dogAccess!;
        if (access.kind === "tourapi") { assert.equal(access.needsConfirmation, true); assert.equal(tourApiDogAccessStatus(access, scenario.dogOuting), "needs-confirmation"); }
        else if (scenario.dogOuting) assert.equal(dogAccessStatus(access, scenario.dogOuting), "eligible");
      }
      verifiedScenarios++;
    }
    assert.equal(externalRequests, 0);
  } finally { globalThis.fetch = originalFetch; }
  console.log(JSON.stringify({ conditionMatrixVerified: verifiedScenarios, externalRequests }));
  const details = await prisma.place.findMany({ where: { id: { in: [...selected] } }, select: { sourceId: true, name: true, image: true, tourismSourceRecord: { select: { detailRecord: { select: { overview: true, openingHours: true } } } } } });
  console.log(JSON.stringify({ scope: "public-place-quality-audit-only", uniquePlaces: details.length,
    missing: details.map(p => ({ contentId: p.sourceId, name: p.name, fields: [!p.image && "image", !p.tourismSourceRecord?.detailRecord?.overview && "overview", !p.tourismSourceRecord?.detailRecord?.openingHours && "openingHours"].filter(Boolean) })).filter(p => p.fields.length),
    databaseChanged: false, accountHistoryRead: false }));
} catch { console.error(JSON.stringify({ status: "failed", privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
