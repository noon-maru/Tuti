import { notificationRequest } from "@/lib/notificationSettings";
import type { PetProfile } from "@/shared/pets/profile";

export const petPhotoKey = (owner: string, pet: PetProfile) => ["pet-photo", owner, pet.id, pet.revision ?? 0] as const;
export function petPhotoQuery(owner: string, pet: PetProfile) {
  return {
    queryKey: petPhotoKey(owner, pet),
    queryFn: ({ signal }: { signal: AbortSignal }) => notificationRequest<{ photo: string | null }>(`pets/${encodeURIComponent(pet.id)}/photo`, { signal }, owner),
    enabled: Boolean(owner && pet.hasPhoto), staleTime: 5 * 60_000, retry: false as const,
  };
}
