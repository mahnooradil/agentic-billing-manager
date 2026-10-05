/**
 * Zod schema for vendor request bodies. flow/extra-02 Part A1 — rating a
 * vendor's usage frequency is the only vendor mutation that takes a body
 * (confirm/reject are bare POSTs).
 */
import { z } from "zod";

import { UTILITY_RATINGS } from "@/models/vendor.model";

export const rateVendorSchema = z.object({
  utilityRating: z.enum(UTILITY_RATINGS),
});

export type RateVendorInput = z.infer<typeof rateVendorSchema>;
