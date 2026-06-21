const projectName = process.env.CLOUDFLARE_PAGES_PROJECT ?? "ennodia";
const productionBranch = process.env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH ?? "main";

type WranglerResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runWrangler(args: string[]): Promise<WranglerResult> {
  const child = Bun.spawn(["bunx", "wrangler", ...args], {
    stdout: "pipe",
    stderr: "pipe"
  });

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const exitCode = await child.exited;

  return { stdout, stderr, exitCode };
}

function parseProjectList(stdout: string): Array<{ name?: string; subdomain?: string }> {
  const parsed = JSON.parse(stdout) as
    | Array<{ name?: string; subdomain?: string }>
    | { result?: Array<{ name?: string; subdomain?: string }> }
    | { projects?: Array<{ name?: string; subdomain?: string }> };

  if (Array.isArray(parsed)) {
    return parsed;
  }

  return parsed.result ?? parsed.projects ?? [];
}

function isAlreadyExistsError(result: WranglerResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return output.includes("8000002") || /project with this name already exists/i.test(output);
}

const listResult = await runWrangler(["pages", "project", "list", "--json"]);

if (listResult.exitCode !== 0) {
  console.error(listResult.stderr || listResult.stdout);
  process.exit(listResult.exitCode);
}

const projects = parseProjectList(listResult.stdout);
const exists = projects.some(
  (project) => project.name === projectName || project.subdomain === projectName
);

if (exists) {
  console.log(`Cloudflare Pages project "${projectName}" already exists.`);
  process.exit(0);
}

const createResult = await runWrangler([
  "pages",
  "project",
  "create",
  projectName,
  "--production-branch",
  productionBranch
]);

if (createResult.exitCode !== 0 && isAlreadyExistsError(createResult)) {
  console.log(`Cloudflare Pages project "${projectName}" already exists.`);
  process.exit(0);
}

if (createResult.stderr) {
  console.error(createResult.stderr);
}

process.exit(createResult.exitCode);
