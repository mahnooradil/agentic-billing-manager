/**
 * Global test setup — runs once before the whole suite (`beforeAll`) and
 * once after (`afterAll`), per `vitest.config.ts`'s `setupFiles`.
 *
 * Spins up an in-memory MongoDB (mongodb-memory-server) and points the
 * app's shared mongoose connection at it — tests NEVER connect to the real
 * Atlas database (`connectDatabase()` in `config/database.ts` is never
 * called here on purpose). Collections are wiped between tests
 * (`afterEach`) so one test's data can never leak into another's.
 *
 * A single-node REPLICA SET, not a standalone server — `deleteAccount`
 * (auth.controller.ts) uses a real multi-document transaction
 * (`session.withTransaction`), and MongoDB only supports transactions on a
 * replica set (even a 1-node one) or a sharded cluster, never a standalone
 * instance. Atlas itself is always a replica set, so this also makes the
 * test environment a closer match to production, not just a transaction
 * workaround.
 */
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";

let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  // A longer launch timeout than the library's default — the first run on a
  // machine downloads/extracts the MongoDB binary, and a replica set's own
  // startup (electing a primary) adds a bit more time than a standalone
  // instance needed.
  mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 120_000 }],
  });
  await mongoose.connect(mongod.getUri(), { autoIndex: true });

  // `autoIndex: true` schedules index builds in the background — it does
  // NOT wait for them to finish. Without this, a test asserting a unique
  // constraint can run before the index actually exists yet and see a
  // duplicate insert wrongly succeed. `Connection.syncIndexes()` builds
  // every currently-registered model's indexes and resolves only once
  // they're actually ready.
  await mongoose.connection.syncIndexes();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
