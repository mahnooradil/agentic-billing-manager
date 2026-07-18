import { Router } from "express";

import { register, login, getMe } from "@/controllers/auth.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { registerSchema, loginSchema } from "@/validators/auth.validator";

const router = Router();

// Public endpoints
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

// Protected endpoint — requires a valid Bearer token
router.get("/me", authenticate, getMe);

export default router;
