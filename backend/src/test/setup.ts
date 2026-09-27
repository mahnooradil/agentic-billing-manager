/**
 * Global test setup — runs once before the whole suite (`beforeAll`) and
 * once after (`afterAll`), per `vitest.config.ts`'s `setupFiles`.
 *
 * Spins up an in-memory MongoDB (mongodb-memory-server) and points the
 * app's shared mongoose connection at it — tests NEVER connect to the real
 * Atlas database (`connectDatabase()` in `config/database.ts` is never
 * called here on purpose). Collections are wiped between tests
 * (`afterEach`) so one test's data can never leak into another's.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // A longer launch timeout than the library's 10s default — the first run
  // on a machine downloads/extracts the MongoDB binary, which can take
  // longer than that alone.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 120_000 } });
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
