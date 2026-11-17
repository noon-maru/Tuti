import { prisma } from "../src/server/db/prisma";
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--require-data")) throw Error("INVALID_ARGUMENT");
  const schema = await prisma.$queryRaw<Array<{ catalog: boolean; sources: boolean }>>`SELECT to_regclass('public.dog_place_catalog') IS NOT NULL AS catalog,to_regclass('public.tourism_pet_source_records') IS NOT NULL AS sources`;
  const schemaReady = Boolean(schema[0]?.catalog && schema[0]?.sources);
  const ready = schemaReady ? await prisma.dogPlaceCatalog.count({ where: { status: "ready" } }) : 0;
  console.log(JSON.stringify({ scope: "dog-recommendation-readiness", schemaReady, ready, recommendationReady: schemaReady && ready > 0, writes: false, networkRequests: 0 }));
  if (args.includes("--require-data") && !ready) process.exitCode = 1;
} catch { console.error(JSON.stringify({ status: "failed", privateDetailsSuppressed: true })); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
