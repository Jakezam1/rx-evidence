import { ClinicalSummary, Finding, ObservabilityEvent, Pico, RiskLimitations } from "./types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type RecentPaper = {
  paperId: string;
  fileName: string;
  status: string;
  totalPages: number | null;
  uploadedAt: string | null;
  processedAt: string | null;
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error((body as { detail?: string; error?: string }).detail ?? (body as { error?: string }).error ?? "Request failed");
  }
  return body as T;
}

export async function uploadPaper(file: File): Promise<{ paperId: string; fileName: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return jsonRequest<{ paperId: string; fileName: string; status: string }>("/papers", {
    method: "POST",
    body: formData,
  });
}

export async function analyzePaper(paperId: string): Promise<void> {
  await jsonRequest(`/papers/${paperId}/analyze`, { method: "POST" });
}

export async function retryMissingPaperSections(paperId: string): Promise<void> {
  await jsonRequest(`/papers/${paperId}/retry-missing`, { method: "POST" });
}

export async function getFindings(paperId: string): Promise<Finding[]> {
  const payload = await jsonRequest<{ findings: Finding[] }>(`/papers/${paperId}/findings`);
  return payload.findings;
}

export async function updateFindingReview(findingId: string, reviewStatus: "approved" | "flagged" | "unreviewed", reviewNote?: string): Promise<void> {
  await jsonRequest(`/findings/${findingId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewStatus, reviewNote: reviewNote || null }),
  });
}

export async function getPico(paperId: string): Promise<Pico> {
  const payload = await jsonRequest<{ pico: Pico }>(`/papers/${paperId}/pico`);
  return payload.pico;
}

export async function getRiskLimitations(paperId: string): Promise<RiskLimitations> {
  const payload = await jsonRequest<{ riskLimitations: RiskLimitations }>(`/papers/${paperId}/risk-limitations`);
  return payload.riskLimitations;
}

export async function getSummary(paperId: string): Promise<ClinicalSummary> {
  const payload = await jsonRequest<{ summary: ClinicalSummary }>(`/papers/${paperId}/summary`);
  return payload.summary;
}

export async function getObservability(paperId: string): Promise<ObservabilityEvent[]> {
  const payload = await jsonRequest<{ events: ObservabilityEvent[] }>(`/papers/${paperId}/observability`);
  return payload.events;
}

export async function getConfig(): Promise<{ provider: string; model: string }> {
  return jsonRequest<{ provider: string; model: string }>("/config");
}

export async function getRecentPaper(): Promise<RecentPaper> {
  return jsonRequest<RecentPaper>("/papers/recent");
}

export async function getDemoPaper(): Promise<RecentPaper> {
  return jsonRequest<RecentPaper>("/papers/demo");
}

export function paperPdfUrl(paperId: string): string {
  return `${API_BASE_URL}/papers/${paperId}/pdf`;
}
