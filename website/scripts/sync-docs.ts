import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const websiteRoot = path.resolve(import.meta.dir, "..");
const repoRoot = path.resolve(websiteRoot, "..");
const sourceRoot = path.join(repoRoot, "docs");
const targetRoot = path.join(websiteRoot, "src", "content", "docs", "docs");

const markdownExtensions = new Set([".md", ".mdx"]);
const junkFiles = new Set([".DS_Store", "Thumbs.db"]);

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }

      if (entry.isFile() && !junkFiles.has(entry.name)) {
        return [fullPath];
      }

      return [];
    })
  );

  return files.flat().sort();
}

function hasFrontmatter(content: string): boolean {
  return content.startsWith("---\n");
}

function hasTitleFrontmatter(content: string): boolean {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  return frontmatter ? /^title\s*:/m.test(frontmatter) : false;
}

function normalizeFrontmatterStart(content: string): string {
  return content.replace(/^\uFEFF/, "").replace(/^\s+(?=---\n)/, "");
}

function titleFromContent(content: string, filePath: string): string {
  const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading.replace(/`/g, "");
  }

  const baseName = path.basename(filePath, path.extname(filePath));
  return baseName
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ensureFrontmatter(content: string, filePath: string): string {
  const title = titleFromContent(content, filePath).replace(/"/g, '\\"');

  if (hasFrontmatter(content)) {
    if (hasTitleFrontmatter(content)) {
      return content;
    }

    return content.replace(/^---\n/, `---\ntitle: "${title}"\n`);
  }

  return `---\ntitle: "${title}"\n---\n\n${content}`;
}

function rewriteMarkdownLinksForWebsite(content: string): string {
  return content.replace(
    /\]\(((?:\.{1,2}\/|\/)[^)\s#?]+)\.md(#[^)]+)?\)/g,
    (_match, href: string, hash = "") => `](${href}/${hash})`,
  );
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

const sourceFiles = await collectFiles(sourceRoot);

for (const sourceFile of sourceFiles) {
  const relativePath = path.relative(sourceRoot, sourceFile);
  const targetFile = path.join(targetRoot, relativePath);

  await mkdir(path.dirname(targetFile), { recursive: true });

  if (markdownExtensions.has(path.extname(sourceFile))) {
    const content = normalizeFrontmatterStart(await readFile(sourceFile, "utf8"));
    await writeFile(
      targetFile,
      rewriteMarkdownLinksForWebsite(ensureFrontmatter(content, sourceFile)),
    );
  } else {
    await copyFile(sourceFile, targetFile);
  }
}

console.log(`Synced ${sourceFiles.length} docs file(s) from docs/ into website content.`);
