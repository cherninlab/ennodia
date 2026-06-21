import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://ennodia.cherninlab.com",
  output: "static",
  integrations: [
    starlight({
      title: "Ennodia",
      description: "A shared routing, tracing, and Compare layer for AI tools.",
      favicon: "/favicon.svg",
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
