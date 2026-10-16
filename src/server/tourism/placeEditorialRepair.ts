export type RepairableEditorialFields = {
  overview: string | null;
  homepage: string | null;
  phone: string | null;
  openingHours: string | null;
  restDate: string | null;
  admissionFee: string | null;
  parking: string | null;
  reservation: string | null;
  usageDuration: string | null;
  experienceGuide: string | null;
};

/** Restore only missing fields from the stored source; never replace edited text. */
export function createEditorialFieldRepairs(
  current: RepairableEditorialFields,
  normalized: RepairableEditorialFields,
): Partial<RepairableEditorialFields> {
  const repairs: Partial<RepairableEditorialFields> = {};
  for (const key of Object.keys(normalized) as (keyof RepairableEditorialFields)[]) {
    if (!current[key]?.trim() && normalized[key]?.trim()) {
      repairs[key] = normalized[key];
    }
  }
  return repairs;
}
