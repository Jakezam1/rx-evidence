import { callLLM } from "@/lib/llm";

type ClaimInput = { text: string };
type ChunkInput = { id: string; text: string };
type Mapping = { claim: string; evidence_chunk_ids: string[] };

export async function mapClaimsToEvidence(
  claims: ClaimInput[],
  chunks: ChunkInput[],
): Promise<Mapping[]> {
  const prompt = `You are given claims and text chunks from the same scientific paper.

Map each claim to the chunks that directly support it.

Return ONLY valid JSON:

[
  {
    "claim": "...",
    "evidence_chunk_ids": ["chunk_1","chunk_4"]
  }
]

Be strict. Only include strong matches.

CLAIMS:
${JSON.stringify(claims)}

CHUNKS:
${JSON.stringify(chunks)}
`;

  const raw = await callLLM(prompt);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse evidence mapping JSON from LLM response.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Evidence mapping response is not an array.");
  }

  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));

  return parsed.map((item) => {
    const evidenceIds = (item as { evidence_chunk_ids?: unknown }).evidence_chunk_ids;

    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.claim !== "string" ||
      !Array.isArray(evidenceIds) ||
      !evidenceIds.every((id: unknown) => typeof id === "string")
    ) {
      throw new Error("Evidence mapping response has invalid shape.");
    }

    const filteredIds = evidenceIds.filter((id: string) =>
      validChunkIds.has(id),
    );

    return {
      claim: item.claim,
      evidence_chunk_ids: filteredIds,
    };
  });
}
