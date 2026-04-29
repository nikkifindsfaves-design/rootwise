import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.deadgossip.app/",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://www.deadgossip.app/learn-more",
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
