import { ConfidenceLevel, Finding } from "./types";

export function confidenceCounts(findings: Finding[]): Record<ConfidenceLevel, number> {
  return findings.reduce(
    (acc, finding) => {
      acc[finding.confidenceLevel] += 1;
      return acc;
    },
    { high: 0, moderate: 0, low: 0 },
  );
}

export function confidenceClass(confidence: ConfidenceLevel): string {
  if (confidence === "high") return "text-emerald-700";
  if (confidence === "moderate") return "text-amber-700";
  return "text-rose-700";
}
