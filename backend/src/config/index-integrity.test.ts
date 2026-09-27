import mongoose, { Schema } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";

import { assertIndexesInSync } from "@/config/index-integrity";

describe("assertIndexesInSync", () => {
  afterEach(() => {
    // Each test registers its own throwaway model — deregister so later
    // tests (and other suites sharing this mongoose instance) never see it.
    if (mongoose.modelNames().includes("__IndexIntegrityProbe")) {
      mongoose.deleteModel("__IndexIntegrityProbe");
    }
  });

  it("passes when every registered model's declared indexes actually exist", async () => {
    // The real app models are already registered on this connection by the
    // time any test runs (imported transitively by other test files), and
    // setup.ts's syncIndexes() already built them — so this should be a
    // clean pass with no setup needed here.
    await expect(assertIndexesInSync()).resolves.toBeUndefined();
  });

  it("throws, naming the model and the missing index, when a declared unique index was never built", async () => {
    const schema = new Schema({ probe: { type: String, unique: true } });
    mongoose.model("__IndexIntegrityProbe", schema, "__index_integrity_probe_scratch");
    // Deliberately NOT calling syncIndexes for this model — the collection
    // has no indexes at all yet, simulating exactly the S-01 bug this
    // function exists to catch.

    await expect(assertIndexesInSync()).rejects.toThrow(/__IndexIntegrityProbe.*missing/s);
  });

  it("recovers once the missing model's indexes are actually synced", async () => {
    const schema = new Schema({ probe: { type: String, unique: true } });
    const Model = mongoose.model(
      "__IndexIntegrityProbe",
      schema,
      "__index_integrity_probe_scratch2"
    );

    await expect(assertIndexesInSync()).rejects.toThrow();

    await Model.syncIndexes();
    await expect(assertIndexesInSync()).resolves.toBeUndefined();
  });
});
