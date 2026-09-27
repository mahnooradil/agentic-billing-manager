/** Zod schema for starting a credit-purchase checkout session. */
import { z } from "zod";

import { CREDIT_PACKAGES } from "@/config/credit-packages";

const PACKAGE_IDS = CREDIT_PACKAGES.map((p) => p.id) as [string, ...string[]];

export const createCreditsCheckoutSchema = z.object({
  packageId: z.enum(PACKAGE_IDS),
});

export type CreateCreditsCheckoutInput = z.infer<typeof createCreditsCheckoutSchema>;
