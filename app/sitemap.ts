import type { MetadataRoute } from "next";

const BASE = "https://options.bolurian.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/pricer`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/strategies`, lastModified, changeFrequency: "weekly", priority: 0.9 },
  ];
}
