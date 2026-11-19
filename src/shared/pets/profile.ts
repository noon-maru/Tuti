export type PetProfile = { id: string; name: string; species: "dog" | "cat"; weightKg: number | null; revision?: number; hasPhoto?: boolean };
export function parsePetProfile(value: unknown): Omit<PetProfile, "id"> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || !v.name.trim() || v.name.trim().length > 60 || /[\u0000-\u001f\u007f]/u.test(v.name) || !["dog", "cat"].includes(String(v.species))) return null;
  const weightKg = v.weightKg ?? null;
  if (weightKg !== null && (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 150)) return null;
  return { name: v.name.trim(), species: v.species as "dog" | "cat", weightKg: weightKg as number | null };
}
export function validPetIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 && new Set(value).size === value.length && value.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id));
}
