import assert from "node:assert/strict";
import { prisma } from "../src/server/db/prisma";
import { createDogRecommendations } from "../src/server/recommendations/dogEngine";
import { matchesDogPurpose } from "../src/server/recommendations/dogDestination";

// Fixed public coordinates only. Never reads account history or writes visits/recommendation runs.
try {
  const selected = new Set<string>();
  for (const [area, latitude, longitude] of [["seoul",37.5665,126.978],["gyeongju",35.79,129.33],["jeju",33.4996,126.5312]] as const) {
    for (const purpose of ["walk", "cafe", "outing"] as const) {
      const dogOuting = { weightsKg: [8], leash: true, carrier: false, purpose };
      const result = await createDogRecommendations({ answers: { movement: "short", transport: "transit" }, location: { latitude, longitude }, dogOuting });
      const matches = result.ranked.filter(place => matchesDogPurpose(place, dogOuting));
      assert.equal(result.places.filter(place => matchesDogPurpose(place, dogOuting)).length, Math.min(6, matches.length));
      for (const place of result.places) { selected.add(place.id); assert.ok(place.dogAccess); }
      console.log(JSON.stringify({ area, purpose, eligible: result.audit.companionEligible, matching: matches.length,
        places: result.places.map(p => ({ id: p.id, name: p.name, type: p.experienceType, image: Boolean(p.image) })) }));
    }
  }
  const details = await prisma.place.findMany({ where: { id: { in: [...selected] } }, select: { sourceId: true, name: true, image: true, tourismSourceRecord: { select: { detailRecord: { select: { overview: true, openingHours: true } } } } } });
  console.log(JSON.stringify({ scope: "public-place-quality-audit-only", uniquePlaces: details.length,
    missing: details.map(p => ({ contentId: p.sourceId, name: p.name, fields: [!p.image && "image", !p.tourismSourceRecord?.detailRecord?.overview && "overview", !p.tourismSourceRecord?.detailRecord?.openingHours && "openingHours"].filter(Boolean) })).filter(p => p.fields.length),
    databaseChanged: false, accountHistoryRead: false }));
} catch { console.error(JSON.stringify({ status: "failed", privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
