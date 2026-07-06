import { createDefaultEnnodiaCore, ENNODIA_VERSION } from "ennodia";
import { startEnnodiaIoServer } from "../io";

const core = createDefaultEnnodiaCore();
const server = startEnnodiaIoServer(core, {
  host: "127.0.0.1",
  port: 0,
});

try {
  const baseUrl = `http://${server.hostname}:${server.port}`;
  const health = await fetchJson(`${baseUrl}/health`) as {
    status?: string;
    version?: string;
  };
  const providerOptions = await fetchJson(`${baseUrl}/v1/provider-options`) as {
    object?: string;
    defaultModel?: string;
    options?: unknown[];
  };
  const models = await fetchJson(`${baseUrl}/v1/models`) as {
    object?: string;
    data?: { id?: string }[];
  };

  if (health.status !== "ok" || health.version !== ENNODIA_VERSION) {
    throw new Error("IO health response did not include expected status/version.");
  }

  if (
    providerOptions.object !== "list" ||
    providerOptions.defaultModel !== "local/auto" ||
    !Array.isArray(providerOptions.options)
  ) {
    throw new Error("IO provider options response did not include expected shape.");
  }

  const modelIds = models.data?.map((model) => model.id) ?? [];
  if (
    models.object !== "list" ||
    !modelIds.includes("local/auto") ||
    !modelIds.includes("local/compare")
  ) {
    throw new Error("IO models response did not include expected local models.");
  }

  console.log(
    JSON.stringify(
      {
        health,
        providerOptions: providerOptions.options.length,
        models: modelIds,
      },
      null,
      2,
    ),
  );
} finally {
  server.stop(true);
  await core.shutdown();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  return response.json();
}
