export type FindingCategory =
  | "primary_outcome"
  | "secondary_outcome"
  | "population"
  | "methods"
  | "bias"
  | "safety"
  | "generalizability"
  | "context";

export type ConfidenceLevel = "high" | "moderate" | "low";
export type ReviewStatus = "unreviewed" | "approved" | "flagged";

export type SourcePassage = {
  text: string;
  sectionName: string;
  pageHint: string;
  paragraphHint?: string | null;
  anchorType?: "verbatim" | "paraphrase";
  anchorMatchScore?: number | null;
};

export type StatSlotKey =
  | "HR"
  | "RR"
  | "OR"
  | "CI95"
  | "pValue"
  | "ARR"
  | "RRR"
  | "NNT"
  | "NNH"
  | "absoluteEvents";

export type Finding = {
  id: string;
  category: FindingCategory;
  title: string;
  summary: string;
  clinicalImplication: string;
  statistics: Partial<Record<StatSlotKey, string | number | null>>;
  confidenceLevel: ConfidenceLevel;
  clinicalRelevance: "high" | "medium" | "low";
  practiceChangeSignal: "change" | "consider" | "no_change";
  confidenceRationale: string;
  whyItMatters: string;
  isCompositeEndpoint: boolean;
  compositeComponents: string[];
  sourcePassages: SourcePassage[];
  reviewStatus: ReviewStatus;
  reviewNote?: string | null;
  evidenceStrengthScore?: number | null;
};

export type Pico = {
  population?: string | null;
  intervention?: string | null;
  comparator?: string | null;
  outcomes: string[];
};

export type RiskLimitations = {
  internalValidity?: string | null;
  externalValidity?: string | null;
  sponsorshipConflict?: string | null;
  compositeEndpointAssessment?: string | null;
  subgroupAssessment?: string | null;
};

export type ClinicalSummary = {
  efficacy: string[];
  safety: string[];
  applicability: string[];
  practiceImpact: string[];
};

export type ObservabilityEvent = {
  stage: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};
