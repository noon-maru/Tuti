import { prisma } from "../src/server/db/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import {
  searchKakaoPlaces,
  type KakaoPlaceSearchResult,
} from "../src/server/maps/kakaoMapClient";
import {
  createRailHubDefinition,
  EXPRESS_BUS_HUB_DEFINITIONS,
  findExpressBusHubDefinition,
  isSupportedHighSpeedRailHub,
  normalizeTransportHubName,
  selectKakaoHubCandidate,
  type TransportHubDefinition,
} from "../src/server/transport/transportHubCatalog";
import {
  fetchExpressBusTerminals,
  fetchTrainCities,
  fetchTrainStations,
} from "../src/server/transport/dataGoTransportClient";

const KAKAO_COORDINATE_SOURCE = "kakao_map" as const;

async function main() {
  const syncedAt = new Date();
  const train = await syncTrainHubs(syncedAt);
  const expressBus = await syncExpressBusHubs(syncedAt);

  console.log(JSON.stringify({ train, expressBus, syncedAt }, null, 2));
}

async function syncTrainHubs(syncedAt: Date) {
  const cities = await fetchTrainCities();
  let discovered = 0;
  let synced = 0;
  const skipped: string[] = [];

  for (const city of cities) {
    const cityCode = clean(city.citycode ?? city.cityCode);
    const cityName = clean(city.cityname ?? city.cityName);
    if (!cityCode || !cityName) continue;

    const stations = await fetchTrainStations(cityCode);
    for (const station of stations) {
      const externalId = clean(station.nodeid);
      const sourceName = clean(station.nodename);
      if (
        !externalId ||
        !sourceName ||
        !isSupportedHighSpeedRailHub(sourceName)
      ) {
        continue;
      }
      discovered += 1;

      const definition = createRailHubDefinition(sourceName, cityName);
      const verified = await findVerifiedKakaoHub(definition);
      if (!verified) {
        skipped.push(`${sourceName} (${externalId})`);
        continue;
      }

      await upsertVerifiedHub({
        source: "tago_train",
        externalId,
        sourceName,
        cityCode,
        definition,
        verified,
        rawPayload: station,
        syncedAt,
      });
      synced += 1;
    }
  }

  await deactivateStaleHubs("tago_train", syncedAt);
  reportSkipped("고속철도역", skipped);
  return { discovered, synced, skipped: skipped.length };
}

async function syncExpressBusHubs(syncedAt: Date) {
  const terminals = await fetchExpressBusTerminals();
  const selected = new Map<
    TransportHubDefinition,
    { externalId: string; sourceName: string; rawPayload: unknown }
  >();

  for (const terminal of terminals) {
    const externalId = clean(terminal.nodeid ?? terminal.terminalId);
    const sourceName = clean(terminal.nodename ?? terminal.terminalNm);
    if (!externalId || !sourceName) continue;

    const definition = findExpressBusHubDefinition(sourceName);
    if (!definition || selected.has(definition)) continue;
    selected.set(definition, { externalId, sourceName, rawPayload: terminal });
  }

  let synced = 0;
  const skipped: string[] = [];
  for (const definition of EXPRESS_BUS_HUB_DEFINITIONS) {
    const terminal = selected.get(definition);
    if (!terminal) {
      skipped.push(`${definition.sourceNames[0]} (TAGO 미발견)`);
      continue;
    }

    const verified = await findVerifiedKakaoHub(definition);
    if (!verified) {
      skipped.push(`${terminal.sourceName} (${terminal.externalId})`);
      continue;
    }

    await upsertVerifiedHub({
      source: "tago_express_bus",
      externalId: terminal.externalId,
      sourceName: terminal.sourceName,
      definition,
      verified,
      rawPayload: terminal.rawPayload,
      syncedAt,
    });
    synced += 1;
  }

  await deactivateStaleHubs("tago_express_bus", syncedAt);
  reportSkipped("고속버스터미널", skipped);
  return {
    configured: EXPRESS_BUS_HUB_DEFINITIONS.length,
    discovered: selected.size,
    synced,
    skipped: skipped.length,
  };
}

async function findVerifiedKakaoHub(definition: TransportHubDefinition) {
  const candidates = await searchKakaoPlaces(definition.query, 10);
  const place = selectKakaoHubCandidate(definition, candidates);
  if (!place) return null;

  return {
    place,
    regionName:
      place.address?.split(/\s+/).slice(0, 2).join(" ") || undefined,
  };
}

async function upsertVerifiedHub(input: {
  source: "tago_train" | "tago_express_bus";
  externalId: string;
  sourceName: string;
  cityCode?: string;
  definition: TransportHubDefinition;
  verified: { place: KakaoPlaceSearchResult; regionName?: string };
  rawPayload: unknown;
  syncedAt: Date;
}) {
  const { place } = input.verified;
  const data = {
    sourceName: input.sourceName,
    mode: input.definition.mode,
    name: place.name,
    aliases: unique([
      input.sourceName,
      place.name,
      ...input.definition.sourceNames,
      ...(input.definition.acceptedNames ?? []),
    ]),
    cityCode: input.cityCode ?? null,
    regionName: input.verified.regionName,
    kakaoPlaceId: place.id,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    coordinateSource: KAKAO_COORDINATE_SOURCE,
    coordinateVerifiedAt: input.syncedAt,
    rawPayload: input.rawPayload as Prisma.InputJsonValue,
    isActive: true,
    sourceSyncedAt: input.syncedAt,
  };

  await prisma.transportHub.upsert({
    where: {
      source_externalId: {
        source: input.source,
        externalId: input.externalId,
      },
    },
    create: {
      source: input.source,
      externalId: input.externalId,
      ...data,
    },
    update: data,
  });
}

async function deactivateStaleHubs(source: string, syncedAt: Date) {
  await prisma.transportHub.updateMany({
    where: {
      source,
      sourceSyncedAt: { lt: syncedAt },
      isActive: true,
    },
    data: { isActive: false },
  });
}

function reportSkipped(label: string, skipped: string[]) {
  if (skipped.length === 0) return;
  console.warn(
    `${label} ${skipped.length}곳은 카카오 장소 검증에 실패해 비활성화합니다.`,
  );
  skipped.forEach((item) => console.warn(`- ${item}`));
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: readonly string[]) {
  const result = new Map<string, string>();
  values.filter(Boolean).forEach((value) => {
    const normalized = normalizeTransportHubName(value);
    if (!result.has(normalized)) result.set(normalized, value);
  });
  return [...result.values()];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
