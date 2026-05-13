import { NextResponse } from "next/server";

import { chunkText } from "@/lib/chunk";
import { extractClaims } from "@/lib/claims";
import { mapClaimsToEvidence } from "@/lib/evidence";
import { extractTextFromPdf } from "@/lib/pdf";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A PDF file is required." },
        { status: 400 },
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fullText = await extractTextFromPdf(buffer);
    const chunks = chunkText(fullText);
    const claims = await extractClaims(fullText);
    const mappings = await mapClaimsToEvidence(claims, chunks);

    return NextResponse.json({ chunks, claims, mappings });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
