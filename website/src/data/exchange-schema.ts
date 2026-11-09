import { exchanges, teamRequests } from "./exchanges";

// Describe the editorial examples once, not the marquee's visual duplicates.
// These are not published social posts, reviews, or verbatim transcripts.
export function exchangeListSchema(site: URL) {
  const url = new URL("/examples/exchanges/", site).toString();
  const examples = [...exchanges, ...teamRequests];
  return {
    "@type": "ItemList",
    "@id": `${url}#conversations`,
    name: "Ennodia conversation examples",
    url,
    numberOfItems: examples.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement: examples.map((example, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "CreativeWork",
        "@id": `${url}#${example.id}`,
        url: `${url}#${example.id}`,
        name: `${example.app} · ${example.model}`,
        genre: example.runId ? "Edited run summary" : "Illustrative request",
        inLanguage: "en",
        text: example.response
          ? `Request summary: ${example.request}\nResponse summary: ${example.response}`
          : example.request,
        about: { "@id": new URL("/#software", site).toString() },
      },
    })),
  };
}
