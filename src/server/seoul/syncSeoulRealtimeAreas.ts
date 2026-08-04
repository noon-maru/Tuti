import { inflateRawSync } from "node:zlib";
import { prisma } from "@/server/db/prisma";

const SEOUL_AREA_ARCHIVE_URL =
  "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false";
const SEOUL_AREA_DATASET_ID = "OA-21778";
const SEOUL_AREA_FILE_SEQUENCE = "16";
const EXPECTED_MINIMUM_AREA_COUNT = 100;

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: PolygonCoordinates[];
};

type SeoulRealtimeAreaSource = {
  areaCode: string;
  areaName: string;
  category: string;
  geometry: MultiPolygonGeometry;
};

type DbfField = {
  name: string;
  length: number;
};

export async function syncSeoulRealtimeAreas() {
  const archive = await downloadOfficialAreaArchive();
  const entries = readZipEntries(archive);
  const shapeFile = findEntry(entries, ".shp");
  const attributeFile = findEntry(entries, ".dbf");
  const attributes = readDbfRecords(attributeFile);
  const geometries = readShapePolygons(shapeFile);

  if (attributes.length !== geometries.length) {
    throw new Error(
      `서울 실시간 영역 도형과 속성 개수가 일치하지 않습니다. attributes=${attributes.length}, geometries=${geometries.length}`,
    );
  }

  const areas = attributes.map((record, index) => {
    const areaCode = cleanText(record.AREA_CD);
    const areaName = cleanText(record.AREA_NM);
    const category = cleanText(record.CATEGORY);

    if (!areaCode || !areaName || !category) {
      throw new Error(`서울 실시간 영역 ${index + 1}번의 속성이 비어 있습니다.`);
    }

    return {
      areaCode,
      areaName,
      category,
      geometry: geometries[index],
    } satisfies SeoulRealtimeAreaSource;
  });

  if (areas.length < EXPECTED_MINIMUM_AREA_COUNT) {
    throw new Error(
      `서울 실시간 영역이 비정상적으로 적습니다. count=${areas.length}`,
    );
  }

  const sourceJson = JSON.stringify(areas);
  const areaCodesJson = JSON.stringify(areas.map((area) => area.areaCode));

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      WITH source AS (
        SELECT value
        FROM jsonb_array_elements(${sourceJson}::jsonb) AS item(value)
      )
      INSERT INTO "seoul_realtime_areas" (
        "area_code",
        "area_name",
        "category",
        "geometry",
        "source_synced_at",
        "created_at",
        "updated_at"
      )
      SELECT
        value ->> 'areaCode',
        value ->> 'areaName',
        value ->> 'category',
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(
              ST_SetSRID(ST_GeomFromGeoJSON(value -> 'geometry'), 4326)
            ),
            3
          )
        ),
        NOW(),
        NOW(),
        NOW()
      FROM source
      ON CONFLICT ("area_code") DO UPDATE SET
        "area_name" = EXCLUDED."area_name",
        "category" = EXCLUDED."category",
        "geometry" = EXCLUDED."geometry",
        "source_synced_at" = EXCLUDED."source_synced_at",
        "updated_at" = NOW()
    `;

    await transaction.$executeRaw`
      DELETE FROM "seoul_realtime_areas"
      WHERE "area_code" NOT IN (
        SELECT jsonb_array_elements_text(${areaCodesJson}::jsonb)
      )
    `;

    await transaction.$executeRaw`
      DELETE FROM "place_seoul_realtime_areas"
      WHERE "match_method" = 'contains'
    `;

    await transaction.$executeRaw`
      INSERT INTO "place_seoul_realtime_areas" (
        "place_id",
        "area_code",
        "match_method",
        "confidence",
        "linked_at",
        "updated_at"
      )
      SELECT DISTINCT ON (place."id")
        place."id",
        area."area_code",
        'contains',
        1,
        NOW(),
        NOW()
      FROM "places" AS place
      JOIN "seoul_realtime_areas" AS area
        ON ST_Covers(area."geometry", place."location")
      WHERE
        place."location" IS NOT NULL
        AND place."source_sido_name" = '서울특별시'
      ORDER BY
        place."id",
        ST_Area(area."geometry"::geography) ASC,
        area."area_code" ASC
      ON CONFLICT ("place_id") DO UPDATE SET
        "area_code" = EXCLUDED."area_code",
        "match_method" = EXCLUDED."match_method",
        "confidence" = EXCLUDED."confidence",
        "linked_at" = EXCLUDED."linked_at",
        "updated_at" = NOW()
    `;
  });

  const linkedRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "place_seoul_realtime_areas"
  `;

  return {
    areaCount: areas.length,
    linkedPlaceCount: Number(linkedRows[0]?.count ?? 0),
  };
}

async function downloadOfficialAreaArchive() {
  const response = await fetch(SEOUL_AREA_ARCHIVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      infId: SEOUL_AREA_DATASET_ID,
      seq: SEOUL_AREA_FILE_SEQUENCE,
      infSeq: "2",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `서울 실시간 영역 파일을 받지 못했습니다. HTTP ${response.status}`,
    );
  }

  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("서울 실시간 영역 응답이 ZIP 파일이 아닙니다.");
  }
  return archive;
}

function readZipEntries(archive: Buffer) {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("서울 실시간 영역 ZIP 중앙 디렉터리가 손상되었습니다.");
    }

    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileName = archive
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    if (!fileName.endsWith("/")) {
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("서울 실시간 영역 ZIP 로컬 헤더가 손상되었습니다.");
      }
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
      const content =
        compressionMethod === 0
          ? Buffer.from(compressed)
          : compressionMethod === 8
            ? inflateRawSync(compressed)
            : null;

      if (!content) {
        throw new Error(
          `지원하지 않는 서울 영역 ZIP 압축 방식입니다. method=${compressionMethod}`,
        );
      }
      entries.set(fileName, content);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(archive: Buffer) {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("서울 실시간 영역 ZIP의 끝 레코드를 찾지 못했습니다.");
}

function findEntry(entries: Map<string, Buffer>, extension: string) {
  const entry = [...entries.entries()].find(([name]) =>
    name.toLowerCase().endsWith(extension),
  );
  if (!entry) {
    throw new Error(`서울 실시간 영역 ${extension} 파일을 찾지 못했습니다.`);
  }
  return entry[1];
}

function readDbfRecords(file: Buffer) {
  const recordCount = file.readUInt32LE(4);
  const headerLength = file.readUInt16LE(8);
  const recordLength = file.readUInt16LE(10);
  const fields: DbfField[] = [];

  for (let offset = 32; offset < headerLength && file[offset] !== 0x0d; offset += 32) {
    fields.push({
      name: file
        .subarray(offset, offset + 11)
        .toString("ascii")
        .replace(/\0.*$/, "")
        .trim(),
      length: file[offset + 16],
    });
  }

  const records: Array<Record<string, string>> = [];
  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = headerLength + index * recordLength;
    if (file[recordOffset] === 0x2a) continue;
    let fieldOffset = recordOffset + 1;
    const record: Record<string, string> = {};

    for (const field of fields) {
      record[field.name] = file
        .subarray(fieldOffset, fieldOffset + field.length)
        .toString("utf8")
        .trim();
      fieldOffset += field.length;
    }
    records.push(record);
  }

  return records;
}

function readShapePolygons(file: Buffer) {
  if (file.readInt32LE(32) !== 5) {
    throw new Error("서울 실시간 영역 Shapefile이 Polygon 형식이 아닙니다.");
  }

  const geometries: MultiPolygonGeometry[] = [];
  let offset = 100;

  while (offset + 8 <= file.length) {
    const contentLength = file.readInt32BE(offset + 4) * 2;
    const contentOffset = offset + 8;
    const shapeType = file.readInt32LE(contentOffset);

    if (shapeType === 5) {
      const partCount = file.readInt32LE(contentOffset + 36);
      const pointCount = file.readInt32LE(contentOffset + 40);
      const partsOffset = contentOffset + 44;
      const pointsOffset = partsOffset + partCount * 4;
      const partStarts = Array.from({ length: partCount }, (_, index) =>
        file.readInt32LE(partsOffset + index * 4),
      );
      const points = Array.from({ length: pointCount }, (_, index) => {
        const pointOffset = pointsOffset + index * 16;
        return [
          file.readDoubleLE(pointOffset),
          file.readDoubleLE(pointOffset + 8),
        ] as Coordinate;
      });
      const rings = partStarts.map((start, index) =>
        ensureClosedRing(points.slice(start, partStarts[index + 1] ?? pointCount)),
      );

      geometries.push({
        type: "MultiPolygon",
        coordinates: groupRingsIntoPolygons(rings),
      });
    }

    offset = contentOffset + contentLength;
  }

  return geometries;
}

function groupRingsIntoPolygons(rings: Coordinate[][]) {
  const polygons: PolygonCoordinates[] = [];

  for (const ring of [...rings].sort((left, right) =>
    Math.abs(signedArea(right)) - Math.abs(signedArea(left)),
  )) {
    const owner = [...polygons]
      .filter((polygon) => pointInRing(ring[0], polygon[0]))
      .sort(
        (left, right) =>
          Math.abs(signedArea(left[0])) - Math.abs(signedArea(right[0])),
      )[0];

    if (owner) {
      owner.push(orientRing(ring, false));
    } else {
      polygons.push([orientRing(ring, true)]);
    }
  }

  return polygons;
}

function ensureClosedRing(ring: Coordinate[]) {
  if (ring.length < 4) throw new Error("서울 실시간 영역 도형이 비어 있습니다.");
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? ring
    : [...ring, first];
}

function orientRing(ring: Coordinate[], outer: boolean) {
  const counterClockwise = signedArea(ring) > 0;
  return counterClockwise === outer ? ring : [...ring].reverse();
}

function signedArea(ring: Coordinate[]) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area +=
      ring[index][0] * ring[index + 1][1] -
      ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function pointInRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const intersects =
      y > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function cleanText(value: string | undefined) {
  return value?.trim() || null;
}
