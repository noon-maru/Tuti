import type { PublicJournalEntryResponse } from "@/shared/api/journal";

export class PublicMadiUnavailable extends Error {}

/** Missing is definitive; connection/permission/server failures remain retryable. */
export async function readPublicMadi(publicId: string, request: (path: string, init?: RequestInit) => Promise<Response>, signal: AbortSignal) {
  const response = await request(`public/journal-entries/${encodeURIComponent(publicId)}`, { signal });
  if (response.status === 404 || response.status === 410) throw new PublicMadiUnavailable();
  if (!response.ok) throw new Error("PUBLIC_MADI_LOAD_FAILED");
  const { entry } = await response.json() as PublicJournalEntryResponse;
  let image: Blob | null = null;
  let imageFailed = false;
  if (entry.image) {
    try {
      const photo = await request(entry.image.replace(/^\/api\//, ""), { signal });
      if (!photo.ok) throw new Error("PUBLIC_IMAGE_LOAD_FAILED");
      image = await photo.blob();
    } catch (error) {
      if (signal.aborted) throw error;
      imageFailed = true;
    }
  }
  return { entry: { ...entry, image: null }, image, imageFailed };
}
