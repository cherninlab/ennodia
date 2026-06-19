import { discoverHarnesses } from "../harnesses";
import { planRoute } from "../planner";

const harnesses = await discoverHarnesses();
const plan = planRoute("Review this TypeScript repo and compare tradeoffs.", harnesses);

console.log(JSON.stringify({ harnesses, plan }, null, 2));
