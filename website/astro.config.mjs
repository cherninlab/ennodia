import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://ennodia.cherninlab.com",
  output: "static",
  integrations: [
    react(),
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
      components: {
        SocialIcons: "./src/components/starlight/SocialIcons.astro"
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
          label: "Start here",
          items: [
            { label: "What is Ennodia?", slug: "docs" },
            { label: "Quickstart", slug: "docs/getting-started" },
            { label: "Installation for agents", slug: "docs/install" }
          ]
        },
        {
          label: "Use Ennodia",
          items: [
            { label: "Recipes", slug: "docs/guides/recipes" },
            { label: "Understand results", slug: "docs/guides/understand-results" },
            { label: "Using Agent Skills", slug: "docs/guides/agent-skills" },
            { label: "Pragmatic mode", slug: "docs/guides/pragmatic-mode" },
            { label: "Troubleshooting", slug: "docs/guides/troubleshooting" },
            { label: "Budgets and limits", slug: "docs/guides/budgets-and-limits" },
            { label: "Running better audits", slug: "docs/guides/running-better-audits" }
          ]
        },
        {
          label: "Evidence",
          items: [
            { label: "Overview", slug: "docs/evidence" },
            { label: "Measurement plan", slug: "docs/evidence/measurement" },
            { label: "Roadmap", slug: "docs/roadmap" }
          ]
        },
        {
          label: "Concepts",
          collapsed: true,
          items: [
            { label: "How Ennodia works", slug: "docs/concepts/how-ennodia-works" },
            { label: "Interfaces and Core", slug: "docs/concepts/interfaces-and-core" },
            { label: "Compositional audits", slug: "docs/concepts/compositional-audits" },
            { label: "Second opinions", slug: "docs/concepts/second-opinions" },
            { label: "Data governance", slug: "docs/concepts/data-governance" }
          ]
        },
        {
          label: "Reference",
          collapsed: true,
          items: [
            { label: "MCP tools", slug: "docs/reference/mcp-tools" },
            { label: "Supported harnesses", slug: "docs/reference/supported-harnesses" },
            { label: "Ennodia IO", slug: "docs/reference/ennodia-io" },
            { label: "Controlled English", slug: "docs/reference/controlled-english" }
          ]
        },
        {
          label: "Comparisons",
          collapsed: true,
          items: [
            { label: "Overview", slug: "docs/comparisons" },
            { label: "Ennodia vs OpenRouter", slug: "docs/comparisons/openrouter" },
            { label: "Ennodia vs ChatHub", slug: "docs/comparisons/chathub" },
            { label: "Ennodia vs LangGraph", slug: "docs/comparisons/langgraph" },
            { label: "Ennodia vs AutoGen", slug: "docs/comparisons/autogen" },
            { label: "Ennodia vs agent frameworks", slug: "docs/comparisons/agent-frameworks" },
            { label: "Ennodia vs MoA and ensembles", slug: "docs/comparisons/mixture-of-agents" },
            { label: "Ennodia vs model merging", slug: "docs/comparisons/model-merging" }
          ]
        }
      ],
      customCss: [
        "./src/styles/starlight.css"
      ]
    })
  ]
});
