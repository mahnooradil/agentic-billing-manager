import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandler } from "@/middlewares/errorHandler";

function fakeResponse() {
  const res: { statusCode?: number; body?: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } =
    {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
    };
  return res;
}

/**
 * WP-3 — a raw ZodError (thrown by a controller's own `schema.parse(req.query)`,
 * the established pattern for GET query validation) used to fall through to
 * the catch-all 500 branch. Now mapped to 400 with field-level messages, the
 * same shape the `validate` middleware already produces for body validation.
 */
describe("errorHandler — ZodError", () => {
  it("maps a ZodError to 400 with field-level messages, not a 500", () => {
    const schema = z.object({ limit: z.coerce.number().int().max(10) });
    const result = schema.safeParse({ limit: 999 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = fakeResponse();
    errorHandler(result.error, {} as never, res as never, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: "Validation failed" });
    expect((res.body as { errors: string[] }).errors[0]).toContain("limit");
  });
});
