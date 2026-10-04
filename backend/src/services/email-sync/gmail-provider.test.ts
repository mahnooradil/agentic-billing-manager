import { describe, expect, it, vi, beforeEach } from "vitest";

import { buildTestPdf } from "@/services/email-sync/test-helpers/build-test-pdf";

vi.mock("@/services/email-sync/gmail-client", () => ({
  listCandidateMessageIds: vi.fn(),
  getMessage: vi.fn(),
  getAttachment: vi.fn(),
}));

import { getMessage, getAttachment } from "@/services/email-sync/gmail-client";
import { GMAIL_PROVIDER } from "@/services/email-sync/gmail-provider";

/**
 * WP-6 attachment recall, integration-level: proves the full chain —
 * `getMessage()` → find the PDF part → `getAttachment()` → real text
 * extraction → appended onto `plainText` — actually works end to end
 * through `GMAIL_PROVIDER.getMessage`, not just each piece in isolation.
 */
describe("GMAIL_PROVIDER.getMessage — PDF attachment text gets appended to plainText", () => {
  beforeEach(() => {
    vi.mocked(getMessage).mockReset();
    vi.mocked(getAttachment).mockReset();
  });

  it("appends the PDF's extracted text to a thin body when an attachment needs a separate fetch", async () => {
    const pdfBuffer = await buildTestPdf("Invoice INV-9001\nTotal: 88.00 EUR");

    vi.mocked(getMessage).mockResolvedValue({
      id: "msg-1",
      threadId: "thread-1",
      internalDate: String(Date.now()),
      payload: {
        headers: [
          { name: "from", value: "Acme <billing@acme.test>" },
          { name: "subject", value: "Your invoice is attached" },
        ],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "text/plain",
            body: { data: Buffer.from("Please see the attached invoice.").toString("base64url") },
          },
          {
            mimeType: "application/pdf",
            filename: "invoice.pdf",
            body: { attachmentId: "att-123", size: 50000 },
          },
        ],
      },
    });
    vi.mocked(getAttachment).mockResolvedValue(pdfBuffer);

    const result = await GMAIL_PROVIDER.getMessage("user-1", "apn_test", "msg-1");

    expect(result).not.toBeNull();
    expect(result?.plainText).toContain("Please see the attached invoice");
    expect(result?.plainText).toContain("INV-9001");
    expect(result?.plainText).toContain("88.00");
    expect(getAttachment).toHaveBeenCalledWith("user-1", "apn_test", "msg-1", "att-123");
  });

  it("uses inline attachment data directly when Gmail already embedded it (no extra fetch)", async () => {
    const pdfBuffer = await buildTestPdf("Receipt RCPT-1\nAmount: 5.00 USD");

    vi.mocked(getMessage).mockResolvedValue({
      id: "msg-2",
      threadId: "thread-2",
      internalDate: String(Date.now()),
      payload: {
        headers: [],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "application/pdf",
            filename: "receipt.pdf",
            body: { data: pdfBuffer.toString("base64url"), size: pdfBuffer.length },
          },
        ],
      },
    });

    const result = await GMAIL_PROVIDER.getMessage("user-1", "apn_test", "msg-2");

    expect(result?.plainText).toContain("RCPT-1");
    expect(getAttachment).not.toHaveBeenCalled();
  });

  it("leaves plainText untouched when there's no PDF attachment", async () => {
    vi.mocked(getMessage).mockResolvedValue({
      id: "msg-3",
      threadId: "thread-3",
      internalDate: String(Date.now()),
      payload: {
        headers: [],
        mimeType: "text/plain",
        body: { data: Buffer.from("Just a plain receipt, no attachment.").toString("base64url") },
      },
    });

    const result = await GMAIL_PROVIDER.getMessage("user-1", "apn_test", "msg-3");

    expect(result?.plainText).toBe("Just a plain receipt, no attachment.");
    expect(getAttachment).not.toHaveBeenCalled();
  });

  it("skips a PDF attachment whose bytes can't be fetched, without crashing the whole message", async () => {
    vi.mocked(getMessage).mockResolvedValue({
      id: "msg-4",
      threadId: "thread-4",
      internalDate: String(Date.now()),
      payload: {
        headers: [],
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Invoice attached.").toString("base64url") } },
          { mimeType: "application/pdf", filename: "bad.pdf", body: { attachmentId: "att-dead" } },
        ],
      },
    });
    vi.mocked(getAttachment).mockResolvedValue(null);

    const result = await GMAIL_PROVIDER.getMessage("user-1", "apn_test", "msg-4");

    expect(result?.plainText).toBe("Invoice attached.");
  });
});
