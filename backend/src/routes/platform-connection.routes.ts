import { Router } from "express";

import {
  getMyPlatformConnections,
  createPlatformConnection,
  verifyPlatformConnection,
  updatePlatformConnection,
  deletePlatformConnection,
  getPipedreamCatalog,
  createPipedreamConnectToken,
  connectViaPipedream,
} from "@/controllers/platform-connection.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { rateLimit } from "@/middlewares/rate-limit";
import {
  createPlatformConnectionSchema,
  updatePlatformConnectionSchema,
  verifyPlatformConnectionSchema,
  connectViaPipedreamSchema,
} from "@/validators/platform-connection.validator";

const router = Router();

// All platform-connection endpoints require a valid Bearer token.
router.use(authenticate);

// Abuse protection (UI-Agent.4): bound connection attempts / verification /
// reconnect / connect-token minting per user. Reads are unrestricted.
const connectLimiter = rateLimit({ windowMs: 60_000, max: 20, key: "conn" });

router.get("/", getMyPlatformConnections);
// Pipedream Connect (F9.2) — literal paths before the ":id" routes.
router.get("/catalog", getPipedreamCatalog);
router.post("/connect-token", connectLimiter, createPipedreamConnectToken);
router.post(
  "/pipedream",
  connectLimiter,
  validate(connectViaPipedreamSchema),
  connectViaPipedream
);
router.post(
  "/",
  connectLimiter,
  validate(createPlatformConnectionSchema),
  createPlatformConnection
);
router.post(
  "/:id/verify",
  connectLimiter,
  validate(verifyPlatformConnectionSchema),
  verifyPlatformConnection
);
router.patch(
  "/:id",
  validate(updatePlatformConnectionSchema),
  updatePlatformConnection
);
router.delete("/:id", deletePlatformConnection);

export default router;
