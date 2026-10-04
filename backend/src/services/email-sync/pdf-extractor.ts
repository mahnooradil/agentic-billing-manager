/**
 * PDF text extraction — WP-6's attachment-recall fix (CLAUDE.md §10.3 "no
 * PDF/attachment parsing... a near-empty email with a PDF invoice attached
 * is invisible"). `gmail-client.ts`/`outlook-client.ts` already fetch the
 * attachment bytes through the Pipedream proxy; this is the piece that
 * turns those bytes into plain text the AI extractor can actually read —
 * previously fetched and discarded unused.
 *
 * `unpdf` — a modern, zero-native-dependency wrapper around Mozilla's own
 * pdfjs-dist, built specifically for serverless/Node text extraction (no
 * rendering/canvas needed, which is the only thing this ever does). The
 * older, lighter-looking `pdf-parse@1.x` was tried first and rejected: it
 * bundles a vendored pdf.js from 2016 that failed to parse even a plain
 * `pdfkit`-generated test PDF ("bad XRef entry") — a parser that can't read
 * a normal, standards-compliant PDF is worse than no PDF support at all for
 * a feature whose whole point is not silently missing real invoices.
 */
import { extractText, getDocumentProxy } from "unpdf";

/** Caps how much of one PDF's extracted text is kept — a multi-page invoice
 *  rarely needs more than this to find its key fields, and the combined
 *  body+attachment text is truncated again at the AI call boundary anyway
 *  (`ai-invoice-extractor.ts`'s `MAX_BODY_CHARS`) — this just avoids doing
 *  wasted extraction work on a huge document before that happens. */
const MAX_EXTRACTED_CHARS = 4000;

/**
 * Extracts plain text from a PDF's raw bytes. Best-effort: a corrupt file,
 * a scanned-image-only PDF with no text layer, or any parse failure returns
 * an empty string rather than throwing — one bad attachment must never
 * abort the whole message the way one bad email must never abort a sync run.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const document = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(document, { mergePages: true });
    return text.trim().slice(0, MAX_EXTRACTED_CHARS);
  } catch {
    return "";
  }
}
