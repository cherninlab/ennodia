import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema()
  }),
  // Long-form write-ups of recorded runs. Each article is canonical on this
  // site; cross-posts link back with `canonical_url`.
  articles: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      kind: z.enum(["Case study", "Field note", "Comparison"]),
      published: z.coerce.date(),
      recorded: z.coerce.date().optional(),
      // Orders articles published on the same day. Lower comes first.
      rank: z.number().default(100),
      agents: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      related: z.string().optional(),
      // Cross-posting: up to four DEV tags, and the DEV series to join.
      devtoTags: z.array(z.string()).max(4).optional(),
      series: z.string().optional(),
      draft: z.boolean().default(false)
    })
  })
};
