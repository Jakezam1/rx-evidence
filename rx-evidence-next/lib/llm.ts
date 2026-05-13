import OpenAI from "openai";

export async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    input: prompt,
  });

  return response.output_text;
}
