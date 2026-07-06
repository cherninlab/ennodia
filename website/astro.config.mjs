import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://ennodia.cherninlab.com",
  output: "static",
  integrations: [
    starlight({
      title: "Ennodia",
      description: "MCP server for multi-agent review with Compare and traceable receipts.",
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
          label: "Guides",
          items: [
            { label: "Budgets and Limits", slug: "docs/guides/budgets-and-limits" },
            { label: "Using Agent Skills", slug: "docs/guides/agent-skills" },
            { label: "Running Better Audits", slug: "docs/guides/running-better-audits" }
          ]
        },
        {
          label: "Concepts",
          items: [
            { label: "How Ennodia Works", slug: "docs/concepts/how-ennodia-works" },
            { label: "Interfaces and Core", slug: "docs/concepts/interfaces-and-core" },
            { label: "Compositional Audits", slug: "docs/concepts/compositional-audits" }
          ]
        },
        {
          label: "Reference",
          items: [
            { label: "MCP Tools", slug: "docs/reference/mcp-tools" },
            { label: "Supported Harnesses", slug: "docs/reference/supported-harnesses" }
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
