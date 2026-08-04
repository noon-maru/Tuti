"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchPlaceDetail } from "@/lib/tutiApi";

const DETAIL_CACHE_TIME = 6 * 60 * 60 * 1_000;
const MAX_PRELOADED_IMAGES = 24;
const preloadedImages = new Map<string, HTMLImageElement>();

export function usePlaceDetail(placeId: string, enabled = true) {
  const query = useQuery({
    queryKey: ["place-detail", placeId],
    queryFn: () => fetchPlaceDetail(placeId),
    enabled,
    staleTime: 30 * 60 * 1_000,
    gcTime: DETAIL_CACHE_TIME,
    retry: 1,
  });

  useEffect(() => {
    const images = query.data?.detail?.images;
    if (!images) return;

    for (const image of images.slice(0, 4)) {
      preloadImage(image.url);
    }
  }, [query.data]);

  return query;
}

function preloadImage(url: string) {
  if (typeof window === "undefined" || preloadedImages.has(url)) return;

  const image = new window.Image();
  image.decoding = "async";
  image.onload = () => trimImageCache();
  image.onerror = () => preloadedImages.delete(url);
  preloadedImages.set(url, image);
  image.src = url;
}

function trimImageCache() {
  while (preloadedImages.size > MAX_PRELOADED_IMAGES) {
    const oldestUrl = preloadedImages.keys().next().value;
    if (typeof oldestUrl !== "string") return;
    preloadedImages.delete(oldestUrl);
  }
}
