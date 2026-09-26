import { getCollection, type CollectionEntry } from "astro:content";

export type Article = CollectionEntry<"articles">;

export async function publishedArticles(): Promise<Article[]> {
  const entries = await getCollection("articles", (entry) => !entry.data.draft);
  return entries.sort((a, b) =>
    b.data.published.getTime() - a.data.published.getTime() || a.data.rank - b.data.rank);
}

export function readingMinutes(article: Article): number {
  const words = article.body?.match(/[A-Za-z0-9’']+/g)?.length ?? 0;
  return Math.max(1, Math.round(words / 220));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
