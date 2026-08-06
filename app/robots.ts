import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/app-url";

/** Crawl rules for Jobs + public legal pages; keep Command Center private. */
export default function robots(): MetadataRoute.Robots {
  const app = getPublicAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/jobs", "/legal/"],
        disallow: ["/api/", "/login/"],
      },
    ],
    sitemap: [
      "https://partyperfectjobs.com/sitemap.xml",
      `${app}/sitemap.xml`,
    ],
    host: "https://partyperfectjobs.com",
  };
}
