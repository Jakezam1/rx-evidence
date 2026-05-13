import { PDFParse } from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to extract text from PDF: ${message}`);
  }
}
