import type { MetadataRoute } from "next";

const SITE_URL = "https://tuti.today";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/legal/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/location-terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/account-deletion`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
