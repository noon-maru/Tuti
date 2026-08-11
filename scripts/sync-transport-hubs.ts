import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { searchKakaoPlaces } from "../src/server/maps/kakaoMapClient";
import {
  fetchExpressBusTerminals,
  fetchTrainCities,
  fetchTrainStations,
} from "../src/server/transport/dataGoTransportClient";

const STATION_LOCATION_PATH = resolve(
  process.cwd(),
  "data/transport/korail-station-locations-20240401.csv",
);

type StationLocation = {
  region: string;
  name: string;
  latitude: number;
  longitude: number;
};

async function main() {
  const stationLocations = await readStationLocations();
  const syncedAt = new Date();
  const trainCount = await syncTrainHubs(stationLocations, syncedAt);
  const busCount = await syncExpressBusHubs(syncedAt);

  console.log(
    JSON.stringify(
      { trainHubs: trainCount, expressBusHubs: busCount, syncedAt },
      null,
      2,
    ),
  );
}

async function syncTrainHubs(
  locations: StationLocation[],
  syncedAt: Date,
) {
  const cities = await fetchTrainCities();
  let synced = 0;

  for (const city of cities) {
    const cityCode = clean(city.citycode ?? city.cityCode);
    const cityName = clean(city.cityname ?? city.cityName);
    if (!cityCode) continue;
    const stations = await fetchTrainStations(cityCode);

    for (const station of stations) {
      const externalId = clean(station.nodeid);
      const name = clean(station.nodename);
      if (!externalId || !name) continue;

      const csvLocation = findStationLocation(name, locations);
      const searched = csvLocation
        ? null
        : await geocodeHub(`${cityName ?? ""} ${name}역`.trim());
      const location = csvLocation ?? searched;
      if (!location) {
        console.warn(`좌표를 찾지 못한 철도역 건너뜀: ${name} (${externalId})`);
        continue;
      }

      await prisma.transportHub.upsert({
        where: { source_externalId: { source: "tago_train", externalId } },
        create: {
          source: "tago_train",
          externalId,
          mode: "rail",
          name,
          aliases: unique([name, `${name}역`]),
          cityCode,
          regionName: cityName ?? csvLocation?.region ?? searched?.region,
          latitude: location.latitude,
          longitude: location.longitude,
          rawPayload: station,
          sourceSyncedAt: syncedAt,
        },
        update: {
          name,
          aliases: unique([name, `${name}역`]),
          cityCode,
          regionName: cityName ?? csvLocation?.region ?? searched?.region,
          latitude: location.latitude,
          longitude: location.longitude,
          rawPayload: station,
          isActive: true,
          sourceSyncedAt: syncedAt,
        },
      });
      synced += 1;
    }
  }

  await prisma.transportHub.updateMany({
    where: {
      source: "tago_train",
      sourceSyncedAt: { lt: syncedAt },
      isActive: true,
    },
    data: { isActive: false },
  });

  return synced;
}

async function syncExpressBusHubs(syncedAt: Date) {
  const uniqueTerminals = new Map<
    string,
    { externalId: string; name: string }
  >();

  const terminals = await fetchExpressBusTerminals();
  for (const terminal of terminals) {
    const externalId = clean(terminal.nodeid ?? terminal.terminalId);
    const name = clean(terminal.nodename ?? terminal.terminalNm);
    if (!externalId || !name || uniqueTerminals.has(externalId)) continue;
    uniqueTerminals.set(externalId, { externalId, name });
  }

  let synced = 0;
  for (const terminal of uniqueTerminals.values()) {
    const existing = await prisma.transportHub.findUnique({
      where: {
        source_externalId: {
          source: "tago_express_bus",
          externalId: terminal.externalId,
        },
      },
      select: {
        latitude: true,
        longitude: true,
        regionName: true,
        rawPayload: true,
      },
    });
    const hasCurrentGeocode =
      existing &&
      isRecord(existing.rawPayload) &&
      existing.rawPayload.geocodeVersion === 3;
    const searched = hasCurrentGeocode
      ? null
      : await geocodeTerminal(terminal.name);
    const location = hasCurrentGeocode
      ? {
          latitude: Number(existing!.latitude),
          longitude: Number(existing!.longitude),
          region: existing!.regionName ?? undefined,
        }
      : searched;
    if (!location) {
      console.warn(
        `좌표를 찾지 못한 고속버스터미널 건너뜀: ${terminal.name} (${terminal.externalId})`,
      );
      continue;
    }

    await prisma.transportHub.upsert({
      where: {
        source_externalId: {
          source: "tago_express_bus",
          externalId: terminal.externalId,
        },
      },
      create: {
        source: "tago_express_bus",
        externalId: terminal.externalId,
        mode: "express_bus",
        name: terminal.name,
        aliases: unique([terminal.name, `${terminal.name} 터미널`]),
        regionName: location.region,
        latitude: location.latitude,
        longitude: location.longitude,
        rawPayload: { ...terminal, geocodeVersion: 3 },
        sourceSyncedAt: syncedAt,
      },
      update: {
        name: terminal.name,
        aliases: unique([terminal.name, `${terminal.name} 터미널`]),
        cityCode: null,
        regionName: location.region,
        latitude: location.latitude,
        longitude: location.longitude,
        rawPayload: { ...terminal, geocodeVersion: 3 },
        isActive: true,
        sourceSyncedAt: syncedAt,
      },
    });
    synced += 1;
  }

  await prisma.transportHub.updateMany({
    where: {
      source: "tago_express_bus",
      sourceSyncedAt: { lt: syncedAt },
      isActive: true,
    },
    data: { isActive: false },
  });

  return synced;
}

async function geocodeTerminal(name: string) {
  for (const query of [`${name} 고속버스터미널`, `${name} 버스터미널`]) {
    const results = await searchKakaoPlaces(query, 5);
    const result = results.find((candidate) =>
      /터미널|정류장|정류소|버스/.test(
        `${candidate.name} ${candidate.categoryName ?? ""}`,
      ),
    );
    if (!result) continue;
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      region:
        result.address?.split(/\s+/).slice(0, 2).join(" ") || undefined,
    };
  }
  return null;
}

async function readStationLocations(): Promise<StationLocation[]> {
  const text = await readFile(STATION_LOCATION_PATH, "utf8");
  return text
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [region, name, latitudeText, longitudeText] = parseCsvLine(line);
      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);
      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }
      return [{ region, name, latitude, longitude }];
    });
}

function findStationLocation(name: string, locations: StationLocation[]) {
  const normalized = normalizeHubName(name);
  return locations.find(
    (location) => normalizeHubName(location.name) === normalized,
  );
}

async function geocodeHub(query: string) {
  const result = (await searchKakaoPlaces(query, 3))[0];
  if (!result) return null;
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    region: result.address?.split(/\s+/).slice(0, 2).join(" ") || undefined,
  };
}

function normalizeHubName(value: string) {
  return value.normalize("NFC").replace(/[()\s·.역]/g, "").toLowerCase();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
