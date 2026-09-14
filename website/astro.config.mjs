import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://ennodia.cherninlab.com",
  output: "static",
  integrations: [
    starlight({
      title: "Ennodia",
      description: "Try other agents and skills from your familiar workflow.",
      favicon: "/favicon.svg",
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://ennodia.cherninlab.com/og.png"
          }
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" }
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "628" }
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" }
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://ennodia.cherninlab.com/og.png"
          }
        }
      ],
      logo: {
        src: "./src/content/docs/docs/assets/logo.svg",
        alt: "Ennodia",
        replacesTitle: true
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/cherninlab/ennodia"
        }
      ],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "What is Ennodia?", slug: "docs" },
            { label: "Quickstart", slug: "docs/getting-started" },
            { label: "Installation for Agents", slug: "docs/install" }
          ]
        },
        {
          label: "Use Ennodia",
          items: [
            { label: "Recipes", slug: "docs/guides/recipes" },
            { label: "Understand Results", slug: "docs/guides/understand-results" },
            { label: "Using Agent Skills", slug: "docs/guides/agent-skills" },
            { label: "Pragmatic mode", slug: "docs/guides/pragmatic-mode" },
            { label: "Troubleshooting", slug: "docs/guides/troubleshooting" },
            { label: "Budgets and Limits", slug: "docs/guides/budgets-and-limits" },
            { label: "Running Better Audits", slug: "docs/guides/running-better-audits" }
          ]
        },
        {
          label: "Examples and Evidence",
          items: [
            { label: "Overview", slug: "docs/evidence" },
            { label: "Building Ennodia with Ennodia", slug: "docs/evidence/building-ennodia" },
            { label: "Find Stale Documentation", slug: "docs/evidence/docs-drift" },
            { label: "Try a Skill Separately", slug: "docs/evidence/skill-trial" },
            { label: "Measurement Plan", slug: "docs/evidence/measurement" },
            { label: "Roadmap", slug: "docs/roadmap" }
          ]
        },
        {
          label: "Concepts",
          items: [
            { label: "How Ennodia Works", slug: "docs/concepts/how-ennodia-works" },
            { label: "Interfaces and Core", slug: "docs/concepts/interfaces-and-core" },
            { label: "Compositional Audits", slug: "docs/concepts/compositional-audits" },
            { label: "Second Opinions", slug: "docs/concepts/second-opinions" },
            { label: "Data Governance", slug: "docs/concepts/data-governance" }
          ]
        },
        {
          label: "Reference",
          items: [
            { label: "MCP Tools", slug: "docs/reference/mcp-tools" },
            { label: "Supported Harnesses", slug: "docs/reference/supported-harnesses" },
            { label: "Ennodia IO", slug: "docs/reference/ennodia-io" },
            { label: "Benchmarks", slug: "docs/reference/benchmarks" },
            { label: "Controlled English", slug: "docs/reference/controlled-english" }
          ]
        },
        {
          label: "Comparisons",
          items: [
            { label: "Overview", slug: "docs/comparisons" },
            { label: "Ennodia vs OpenRouter", slug: "docs/comparisons/openrouter" },
            { label: "Ennodia vs ChatHub", slug: "docs/comparisons/chathub" },
            { label: "Ennodia vs LangGraph", slug: "docs/comparisons/langgraph" },
            { label: "Ennodia vs AutoGen", slug: "docs/comparisons/autogen" },
            { label: "Ennodia vs Agent Frameworks", slug: "docs/comparisons/agent-frameworks" },
            { label: "Ennodia vs MoA and Ensembles", slug: "docs/comparisons/mixture-of-agents" },
            { label: "Ennodia vs Model Merging", slug: "docs/comparisons/model-merging" }
          ]
        }
      ],
      customCss: [
        "./src/styles/starlight.css"
      ]
    })
  ]
});
