import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `
You are a clinical pharmacist and evidence-based medicine expert specializing in evaluating randomized controlled trials. You are analyzing a scientific paper section by section.

For each section, extract findings and return them as a structured JSON array. Each finding must include:
- id: unique string
- category: one of "primary_outcome", "secondary_outcome", "population", "methods", "bias", "safety", "generalizability", "context"
- title: short label (3-5 words)
- summary: 1-3 sentence plain-language interpretation written for a clinical pharmacist
- clinicalImplication: 1 sentence on what this means for practice
- statistics: object containing any of: ARR, RRR, NNT, NNH, HR, OR, RR, CI95, pValue, absoluteEvents — only include fields explicitly stated in the paper
- confidenceLevel: "high" | "moderate" | "low"
- sourcePassages: array of objects with text, sectionName, pageHint

Return ONLY a valid JSON array. No preamble. No markdown fences.

Pharmacist-specific analysis priorities:
- Always calculate NNT and NNH when event rates are available
- Flag industry sponsorship and potential conflicts of interest
- Evaluate whether the study population matches real-world patients
- Note subgroup analyses and whether they were pre-specified
- Assess internal vs external validity separately
- Compare outcomes to current standard of care, not just placebo
- Flag composite endpoints and determine if all components are equally clinically meaningful
- Assess whether statistical significance aligns with clinical significance
`;

export async function analyzeSection({ sectionName, sectionText, userApiKey, internalApiKey, model }) {
  const apiKey = userApiKey || null;
  if (!apiKey) {
    throw new Error("MISSING_USER_API_KEY");
  }

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 1800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Section: ${sectionName}\n\nText:\n${sectionText}`
        }
      ]
    });
    const raw = msg.content?.[0]?.text || "[]";
    const findings = JSON.parse(raw);
    return { findings, tokenCount: msg.usage?.input_tokens + msg.usage?.output_tokens || "n/a" };
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      const authErr = new Error("INVALID_USER_API_KEY");
      authErr.status = 401;
      throw authErr;
    }
    if (!userApiKey && internalApiKey) {
      throw new Error("INTERNAL_ONLY_FALLBACK_BLOCKED");
    }
    throw error;
  }
}
