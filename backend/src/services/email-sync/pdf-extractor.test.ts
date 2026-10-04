import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/services/email-sync/pdf-extractor";
import { buildTestPdf } from "@/services/email-sync/test-helpers/build-test-pdf";

describe("extractPdfText", () => {
  it("extracts text from a real PDF's text layer", async () => {
    const pdf = await buildTestPdf("Invoice INV-1001\nAmount Due: 123.45 USD\nVendor: Acme Cloud");
    const text = await extractPdfText(pdf);
    expect(text).toContain("INV-1001");
    expect(text).toContain("123.45");
    expect(text).toContain("Acme Cloud");
  });

  it("returns an empty string for bytes that aren't a real PDF, never throws", async () => {
    const text = await extractPdfText(Buffer.from("this is not a pdf file at all"));
    expect(text).toBe("");
  });

  it("returns an empty string for an empty buffer", async () => {
    const text = await extractPdfText(Buffer.alloc(0));
    expect(text).toBe("");
  });
});
