import { retryDelaySeconds } from "./retry";
const cases: [string | null, number][] = [
  [null, 30], ["0", 0], ["12", 12], ["120", 120], ["", 30], [" ", 30],
  ["1.5", 30], ["-1", 30], ["121", 30], ["1e2", 30], ["0x10", 30],
];
let failures = 0;
for (const [input, expected] of cases) {
  const actual = retryDelaySeconds(input);
  if (actual !== expected) {
    failures += 1;
    console.log(`${JSON.stringify(input)}: expected ${expected}, received ${actual}`);
  }
}
console.log(`${cases.length - failures}/${cases.length} contract cases passed.`);
process.exitCode = failures ? 1 : 0;
