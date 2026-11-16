import { fetchPetTourPage, type PetSource } from "../src/server/tourism/petTourClient";
import { TourApiError } from "../src/server/tourism/tourApiClient";
for (const source of ["kor", "pet"] as PetSource[]) {
  try {
    const list = await fetchPetTourPage(source, 1, 1);
    const id = list.items[0]?.contentid;
    const details = source === "pet" && typeof id === "string" ? (await fetchPetTourPage(source, 1, 1, id)).items : list.items;
    const item = details[0] ?? {};
    const fields = Object.fromEntries(Object.entries(item).filter(([key]) => /^(acmpy|rela|etcAcmpy)/i.test(key)));
    console.log(JSON.stringify({ source, listReceived: list.items.length, totalAvailable: list.totalCount, detailReceived: details.length, fieldNames: Object.keys(item), companionFields: fields }));
  } catch (error) {
    console.log(JSON.stringify({ source, status: "failed", code: error instanceof TourApiError ? error.code : "PROBE_FAILED" }));
    process.exitCode = 1;
  }
}
