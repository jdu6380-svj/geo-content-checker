import assert from "node:assert/strict";

import { runWarmupModel } from "../lib/server/warmup-runtime.ts";

let lightweightCalls = 0;
const lightweightResult = await runWarmupModel(
  { NODE_ENV: "development", EVIDRA_DEV_MODEL: "false" },
  async () => {
    lightweightCalls += 1;
  },
);
assert.equal(lightweightResult, false);
assert.equal(lightweightCalls, 0);

let modelCalls = 0;
const modelResult = await runWarmupModel(
  { NODE_ENV: "development", EVIDRA_DEV_MODEL: "true" },
  async () => {
    modelCalls += 1;
  },
);
assert.equal(modelResult, true);
assert.equal(modelCalls, 1);

const failedModelResult = await runWarmupModel(
  { NODE_ENV: "production" },
  async () => {
    throw new Error("provider unavailable");
  },
);
assert.equal(failedModelResult, false);

console.log("warmup-unit: ok");
