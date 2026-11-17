import { useQuery } from "@tanstack/react-query";
import { notificationRequest } from "@/lib/notificationSettings";
import type { PetProfile } from "@/shared/pets/profile";

export const petProfilesKey = (owner: string) => ["pet-profiles", owner] as const;
export function usePetProfiles(owner: string, enabled = true) {
  return useQuery({
    queryKey: petProfilesKey(owner),
    queryFn: () => notificationRequest<{ pets: PetProfile[] }>("pets", undefined, owner),
    enabled: Boolean(owner) && enabled, retry: false,
  });
}
