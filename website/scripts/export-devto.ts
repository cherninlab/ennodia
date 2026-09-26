// Prints an article as DEV Community Markdown, with a canonical link back to
// the website. The draft stays unpublished until someone publishes it on DEV.
//
//   bun run --cwd website export:devto can-gemini-hear-this-file > post.md

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const site = "https://ennodia.cherninlab.com";
const slug = process.argv[2];
if (!slug) {
  console.error("Usage: bun run scripts/export-devto.ts <article-slug>");
  process.exit(1);
}

const file = path.resolve(import.meta.dir, "..", "src", "content", "articles", `${slug}.md`);
const source = await readFile(file, "utf8");
const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!match) throw new Error(`${file} has no front matter.`);

const data = parseFrontMatter(match[1]!);
const canonical = `${site}/articles/${slug}/`;
// DEV allows four lowercase alphanumeric tags. An article's own devtoTags
// win, because a topic tag such as "audio" reaches far fewer readers.
const tags = [...(data.devtoTags as string[] ?? data.tags as string[] ?? []), "ai", "mcp", "opensource"]
  .map((tag) => tag.toLowerCase().replace(/[^a-z0-9]/g, ""))
  .filter((tag, index, all) => tag && all.indexOf(tag) === index)
  .slice(0, 4);
// DEV shows covers at 1000 by 420. make-cover.ts renders one per article.
const cover = existsSync(path.resolve(import.meta.dir, "..", "public", "covers", `${slug}.png`))
  ? `${site}/covers/${slug}.png`
  : `${site}/og.png`;

const body = convertFigures(absoluteLinks(match[2]!)).trim();
const header = [
  "---",
  `title: ${JSON.stringify(data.title)}`,
  "published: false",
  `description: ${JSON.stringify(data.description)}`,
  `tags: ${tags.join(", ")}`,
  `canonical_url: ${canonical}`,
  `cover_image: ${cover}`,
  ...(data.series ? [`series: ${JSON.stringify(data.series)}`] : []),
  "---",
].join("\n");

console.log(`${header}\n\n${body}\n\n---\n\n*Ennodia is free, open source, and runs on your computer. [Read this article on the Ennodia website](${canonical}), or try it from [GitHub](https://github.com/cherninlab/ennodia).*\n`);

function parseFrontMatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const pair = line.match(/^(\w+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, raw] = pair;
    try {
      result[key!] = JSON.parse(raw!);
    } catch {
      result[key!] = raw;
    }
  }
  return result;
}

function absoluteLinks(text: string): string {
  return text
    .replace(/\]\((\/[^)\s]*)\)/g, (_match, href: string) => `](${site}${href})`)
    .replace(/(src|poster)="(\/[^"]*)"/g, (_match, attribute: string, href: string) => `${attribute}="${site}${href}"`);
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// DEV removes custom figure markup, so each figure becomes plain Markdown.
function convertFigures(text: string): string {
  return text.replace(/<figure class="data-figure">([\s\S]*?)<\/figure>/g, (_match, inner: string) => {
    const lines: string[] = [];
    const label = inner.match(/<span class="label">(?:<span class="figure-number">([\s\S]*?)<\/span>)?([\s\S]*?)<\/span>/);
    if (label) lines.push(`**${[label[1], label[2]].map((part) => strip(part ?? "")).filter(Boolean).join(": ")}**`, "");

    const receipt = [...inner.matchAll(/<dt>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)];
    if (receipt.length) {
      lines.push("| Field | Value |", "| --- | --- |", ...receipt.map(([, key, value]) => `| ${strip(key!)} | ${strip(value!)} |`), "");
    }

    const events = [...inner.matchAll(/<li><time>([\s\S]*?)<\/time><span>([\s\S]*?)<\/span><\/li>/g)];
    if (events.length) lines.push(...events.map(([, time, event]) => `- \`${strip(time!)}\` ${strip(event!)}`), "");

    const outcomes = [...inner.matchAll(/<li><span class="format">([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><span class="outcome[^"]*">([\s\S]*?)<\/span><\/li>/g)];
    if (outcomes.length) {
      lines.push("| Item | Observation | Outcome |", "| --- | --- | --- |", ...outcomes.map(([, item, note, outcome]) => `| ${strip(item!)} | ${strip(note!)} | ${strip(outcome!)} |`), "");
    }

    const video = inner.match(/<video[^>]*poster="([^"]+)"[^>]*src="([^"]+)"[^>]*>/);
    if (video) lines.push(`[![Recorded run](${video[1]})](${video[2]})`, "");

    const caption = inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/);
    if (caption) lines.push(`*${strip(caption[1]!)}*`);
    return lines.join("\n").trim();
  });
}
