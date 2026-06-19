import { discoverHarnesses } from "../harnesses";

console.log(JSON.stringify(await discoverHarnesses(), null, 2));
