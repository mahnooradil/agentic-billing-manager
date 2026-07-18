/**
 * Authentication controllers: register, login, and the protected "me" route.
 *
 * Input is already validated by the `validate` middleware, so these handlers
 * focus on business logic. Errors are thrown as `AppError`s and formatted
 * centrally; async rejections are forwarded via `asyncHandler`.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { generateToken } from "@/utils/jwt";
import { toPublicUser } from "@/utils/user.serializer";
import { User } from "@/models/user.model";
import type { RegisterInput, LoginInput } from "@/validators/auth.validator";

/** POST /api/auth/register — create a new account. */
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, profilePicture } = req.body as RegisterInput;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }

  // Password hashing happens in the model's pre-save hook.
  const user = await User.create({ fullName, email, password, profilePicture });

  sendSuccess(res, 201, "Registration successful", {
    user: toPublicUser(user),
  });
});

/** POST /api/auth/login — verify credentials and issue a JWT. */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as LoginInput;

  // `password` is `select: false`, so explicitly opt it in for comparison.
  const user = await User.findOne({ email }).select("+password");

  // Use one identical message for "no such user" and "wrong password" so the
  // endpoint never reveals which emails are registered.
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = generateToken({ id: user._id.toString() });

  sendSuccess(res, 200, "Login successful", {
    token,
    user: toPublicUser(user),
  });
});

/** GET /api/auth/me — return the authenticated user (guarded by `authenticate`). */
export const getMe = asyncHandler(async (req, res) => {
  // `authenticate` guarantees `req.user` is set before this handler runs.
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  sendSuccess(res, 200, "Authenticated user retrieved", {
    user: toPublicUser(user),
  });
});
