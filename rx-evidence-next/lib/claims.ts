import { callLLM } from "@/lib/llm";

type ClaimType = "result" | "conclusion" | "finding";

type Claim = {
  text: string;
  type: ClaimType;
};

export async function extractClaims(fullText: string): Promise<Claim[]> {
  const prompt = `You are analyzing a scientific paper.

Extract the key findings and conclusions from the text below.

Return ONLY valid JSON as an array.

Each item:
- text: string
- type: one of ['result','conclusion','finding']

Be concise and only include meaningful claims.

TEXT:
${fullText}
`;

  const raw = await callLLM(prompt);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse claims JSON from LLM response.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Claims response is not an array.");
  }

  const validTypes: ClaimType[] = ["result", "conclusion", "finding"];
  const claims: Claim[] = parsed.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.text !== "string" ||
      typeof item.type !== "string" ||
      !validTypes.includes(item.type as ClaimType)
    ) {
      throw new Error("Claims response has invalid shape.");
    }

    return {
      text: item.text,
      type: item.type as ClaimType,
    };
  });

  return claims;
}
