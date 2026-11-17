import type { PetProfile } from "./profile";

/** Never silently drop a selected dog with an unknown weight, or use a cat as a dog. */
export function selectedDogWeights(pets: PetProfile[], selected: string[]): number[] | null {
  if (!selected.length || selected.length > 20 || new Set(selected).size !== selected.length) return null;
  const dogs = selected.map(id => pets.find(pet => pet.id === id && pet.species === "dog"));
  if (dogs.some(pet => !pet || pet.weightKg === null || !Number.isFinite(pet.weightKg) || pet.weightKg <= 0 || pet.weightKg > 150)) return null;
  return dogs.map(pet => pet!.weightKg!);
}
