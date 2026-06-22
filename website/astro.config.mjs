import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://ennodia.cherninlab.com",
  output: "static",
  integrations: [
    starlight({
      title: "Ennodia",
      description: "MCP server that lets one AI agent ask other agents for help.",
      favicon: "/favicon.svg",
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
          label: "Documentation",
          autogenerate: {
            directory: "docs"
          }
        }
      ],
      customCss: [
        "./src/styles/starlight.css"
      ]
    })
  ]
});
