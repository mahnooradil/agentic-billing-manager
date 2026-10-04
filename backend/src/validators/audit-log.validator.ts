import { z } from "zod";

/** GET /audit-log query params — a safety cap, same convention as
 *  billing.validator.ts's `listBillingQuerySchema`. */
export const listAuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
