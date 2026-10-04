/** Test-only helper: generates a real, standards-compliant PDF (via
 *  `pdfkit`, a dev dependency) containing the given text, for exercising
 *  `pdf-extractor.ts` against actual PDF bytes rather than a mock. */
import PDFDocument from "pdfkit";

export function buildTestPdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.text(text);
    doc.end();
  });
}
