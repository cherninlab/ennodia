import assert from "node:assert/strict";
import { DEFAULT_PORT, readPort, readiness } from "./config";
assert.equal(DEFAULT_PORT, 4545);
assert.equal(readPort({ APP_PORT: "5050" }), 5050);
assert.equal(readPort({ PORT: "5050" }), 4545);
assert.deepEqual(readiness(), { ready: true });
console.log("Current behavior verified. Compare README claims with config.ts; preserve the labeled migration record.");
