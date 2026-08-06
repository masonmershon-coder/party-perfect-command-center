import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/app-url";

/** Public URLs for Safari/Google indexing — especially Party Perfect Jobs. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const app = getPublicAppUrl();
  return [
    {
      url: "https://partyperfectjobs.com/",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://partyperfectjobs.com/jobs",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${app}/jobs`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${app}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${app}/legal/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${app}/legal/sms-opt-in`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
