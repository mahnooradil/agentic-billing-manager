import { describe, expect, it } from "vitest";

import {
  parseAuthenticationResults,
  hasReplyToMismatch,
  applySenderTrustPenalty,
  findPdfAttachmentParts,
} from "@/services/email-sync/parser";
import type { GmailMessage } from "@/services/email-sync/gmail-client";

describe("findPdfAttachmentParts (WP-6 attachment recall)", () => {
  function message(payload: GmailMessage["payload"]): GmailMessage {
    return { id: "m1", threadId: "t1", payload };
  }

  it("finds a PDF part by mimeType, with its attachmentId", () => {
    const msg = message({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: "aGk", size: 2 } },
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: { attachmentId: "att-1", size: 50000 },
        },
      ],
    });
    const found = findPdfAttachmentParts(msg);
    expect(found).toEqual([{ filename: "invoice.pdf", inlineData: undefined, attachmentId: "att-1" }]);
  });

  it("finds a PDF by filename even when mislabeled as application/octet-stream", () => {
    const msg = message({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/octet-stream",
          filename: "Receipt-2026.pdf",
          body: { attachmentId: "att-2" },
        },
      ],
    });
    const found = findPdfAttachmentParts(msg);
    expect(found).toHaveLength(1);
    expect(found[0].filename).toBe("Receipt-2026.pdf");
  });

  it("ignores a non-PDF attachment (e.g. an embedded logo image)", () => {
    const msg = message({
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "image/png", filename: "logo.png", body: { attachmentId: "att-3" } }],
    });
    expect(findPdfAttachmentParts(msg)).toEqual([]);
  });

  it("returns an empty array for a message with no attachments", () => {
    const msg = message({ mimeType: "text/plain", body: { data: "aGk" } });
    expect(findPdfAttachmentParts(msg)).toEqual([]);
  });

  it("caps at 3 PDF attachments for one pathological message", () => {
    const msg = message({
      mimeType: "multipart/mixed",
      parts: Array.from({ length: 10 }, (_, i) => ({
        mimeType: "application/pdf",
        filename: `file-${i}.pdf`,
        body: { attachmentId: `att-${i}` },
      })),
    });
    expect(findPdfAttachmentParts(msg)).toHaveLength(3);
  });
});

describe("parseAuthenticationResults (Task 9, S-08)", () => {
  it("parses a real Gmail-style Authentication-Results header", () => {
    const header =
      "mx.google.com; dkim=pass header.i=@netflix.com header.s=k1 header.b=abc; " +
      "spf=pass (google.com: domain of billing@netflix.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=billing@netflix.com; " +
      "dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=netflix.com";
    const result = parseAuthenticationResults(header);
    expect(result).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" });
  });

  it("parses a DMARC failure", () => {
    const header = "mx.google.com; spf=pass smtp.mailfrom=x; dkim=fail; dmarc=fail (p=REJECT) header.from=aws.amazon.com";
    const result = parseAuthenticationResults(header);
    expect(result.dmarc).toBe("fail");
  });

  it("normalizes softfail/neutral/temperror to none, not fail", () => {
    const header = "mx.example.com; spf=softfail; dkim=neutral; dmarc=temperror";
    const result = parseAuthenticationResults(header);
    expect(result).toEqual({ spf: "none", dkim: "none", dmarc: "none" });
  });

  it("returns all-none for a missing header", () => {
    expect(parseAuthenticationResults(null)).toEqual({ spf: "none", dkim: "none", dmarc: "none" });
    expect(parseAuthenticationResults(undefined)).toEqual({ spf: "none", dkim: "none", dmarc: "none" });
  });
});

describe("hasReplyToMismatch (Task 9, S-08)", () => {
  it("flags a Reply-To domain that differs from From", () => {
    expect(
      hasReplyToMismatch(
        '"AWS Billing" <billing@aws.amazon.com>',
        '"Support" <support@attacker-domain.com>'
      )
    ).toBe(true);
  });

  it("does not flag a matching domain", () => {
    expect(
      hasReplyToMismatch(
        '"AWS Billing" <billing@aws.amazon.com>',
        '"AWS Support" <support@aws.amazon.com>'
      )
    ).toBe(false);
  });

  it("does not flag when Reply-To is absent (most real emails)", () => {
    expect(hasReplyToMismatch('"AWS Billing" <billing@aws.amazon.com>', undefined)).toBe(false);
  });
});

describe("applySenderTrustPenalty (Task 9)", () => {
  it("leaves confidence untouched when the sender looks legitimate", () => {
    expect(
      applySenderTrustPenalty(0.9, { spf: "pass", dkim: "pass", dmarc: "pass" }, false)
    ).toBe(0.9);
  });

  it("downgrades confidence on a DMARC failure", () => {
    const result = applySenderTrustPenalty(
      0.9,
      { spf: "fail", dkim: "fail", dmarc: "fail" },
      false
    );
    expect(result).toBeCloseTo(0.5, 5);
  });

  it("downgrades confidence on a Reply-To mismatch alone, even with DMARC passing", () => {
    const result = applySenderTrustPenalty(0.9, { spf: "pass", dkim: "pass", dmarc: "pass" }, true);
    expect(result).toBeCloseTo(0.5, 5);
  });

  it("never goes below 0", () => {
    const result = applySenderTrustPenalty(0.2, { spf: "fail", dkim: "fail", dmarc: "fail" }, true);
    expect(result).toBe(0);
  });

  it("passes through null unchanged", () => {
    expect(applySenderTrustPenalty(null, { spf: "none", dkim: "none", dmarc: "none" }, false)).toBeNull();
  });

  it("a DMARC result of none (no record at all) is NOT itself treated as suspicious", () => {
    const result = applySenderTrustPenalty(0.9, { spf: "none", dkim: "none", dmarc: "none" }, false);
    expect(result).toBe(0.9);
  });
});
