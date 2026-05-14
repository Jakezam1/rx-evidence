"use client";

import { Finding, ObservabilityEvent } from "../lib/types";

type Props = {
  findings: Finding[];
  events: ObservabilityEvent[];
};

const STATS_REQUIRED_CATEGORIES = new Set(["primary_outcome", "secondary_outcome", "safety"]);

type ReviewKind =
  | "sponsorship"
  | "composite"
  | "conflicting_stats"
  | "not_significant"
  | "low_confidence"
  | "reviewer_flagged"
  | "pipeline";

type ReviewRow = {
  kind: ReviewKind;
  label: string;
  detail?: string;
};

const KIND_LABEL: Record<ReviewKind, string> = {
  sponsorship: "Sponsorship",
  composite: "Composite endpoint",
  conflicting_stats: "Conflicting stats",
  not_significant: "Not significant",
  low_confidence: "Low confidence",
  reviewer_flagged: "Flagged for review",
  pipeline: "Pipeline note",
};

const KIND_ORDER: ReviewKind[] = [
  "sponsorship",
  "composite",
  "conflicting_stats",
  "not_significant",
  "low_confidence",
  "reviewer_flagged",
  "pipeline",
];

function parsePValueSignal(raw: string | number | null | undefined): "significant" | "not_significant" | number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const str = String(raw).toLowerCase().trim();
  if (/^(ns|n\.s\.|not\s*sig)/.test(str)) return "not_significant";
  if (/^<\s*0?\./.test(str)) return "significant";
  if (/^>\s*0?\./.test(str)) {
    const m = str.match(/[\d.]+/);
    if (m) return parseFloat(m[0]) + 0.0001;
    return "not_significant";
  }
  const m = str.match(/[\d.]+/);
  if (m) {
    const n = parseFloat(m[0]);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function ciCrossesNull(raw: string | number | null | undefined): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const str = String(raw);
  const matches = str.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const [lower, upper] = [parseFloat(matches[0]), parseFloat(matches[1])];
  if (Number.isNaN(lower) || Number.isNaN(upper)) return null;
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  return lo < 1.0 && hi > 1.0;
}

type SigVerdict =
  | { kind: "ok" }
  | { kind: "conflicting"; detail: string }
  | { kind: "not_significant"; detail: string };

function evaluateSignificance(finding: Finding): SigVerdict {
  if (!STATS_REQUIRED_CATEGORIES.has(finding.category)) return { kind: "ok" };

  const pSignal = parsePValueSignal(finding.statistics.pValue);
  const crosses = ciCrossesNull(finding.statistics.CI95);

  const pSaysNotSig = pSignal === "not_significant" || (typeof pSignal === "number" && pSignal >= 0.05);
  const pSaysSig = pSignal === "significant" || (typeof pSignal === "number" && pSignal < 0.05);

  if (pSaysSig && crosses === true) {
    return {
      kind: "conflicting",
      detail: `p = ${finding.statistics.pValue} suggests significance, but 95% CI ${finding.statistics.CI95} crosses 1.0.`,
    };
  }
  if (pSaysNotSig && crosses === false) {
    return { kind: "not_significant", detail: `p = ${finding.statistics.pValue} (\u2265 0.05).` };
  }
  if (pSaysNotSig) {
    return { kind: "not_significant", detail: `p = ${finding.statistics.pValue} (\u2265 0.05).` };
  }
  if (crosses === true) {
    return {
      kind: "not_significant",
      detail: `95% CI ${finding.statistics.CI95} crosses 1.0.`,
    };
  }
  return { kind: "ok" };
}

function buildReviewRows(findings: Finding[], events: ObservabilityEvent[]): ReviewRow[] {
  const rows: ReviewRow[] = [];

  for (const f of findings) {
    if (f.category === "bias") {
      rows.push({
        kind: "sponsorship",
        label: f.title,
        detail: f.summary || f.clinicalImplication,
      });
    }
  }

  for (const f of findings) {
    if (!f.isCompositeEndpoint) continue;
    rows.push({
      kind: "composite",
      label: f.title,
      detail:
        f.compositeComponents.length > 0
          ? `Combines: ${f.compositeComponents.join(", ")}`
          : "Components were not enumerated in the paper.",
    });
  }

  for (const f of findings) {
    const verdict = evaluateSignificance(f);
    if (verdict.kind === "conflicting") {
      rows.push({ kind: "conflicting_stats", label: f.title, detail: verdict.detail });
    } else if (verdict.kind === "not_significant") {
      rows.push({ kind: "not_significant", label: f.title, detail: verdict.detail });
    }
  }

  for (const f of findings) {
    if (f.confidenceLevel === "low") {
      rows.push({
        kind: "low_confidence",
        label: f.title,
        detail:
          f.confidenceRationale ||
          "AI rated this finding as low confidence based on the source passage strength.",
      });
    }
  }

  for (const f of findings) {
    if (f.reviewStatus === "flagged") {
      rows.push({
        kind: "reviewer_flagged",
        label: f.title,
        detail: f.reviewNote || "No reviewer note provided.",
      });
    }
  }

  for (const ev of events) {
    if (ev.level !== "warn" && ev.level !== "error") continue;
    const errText = typeof ev.metadata?.error === "string" ? ev.metadata.error : "";
    rows.push({
      kind: "pipeline",
      label: `${ev.stage}: ${ev.message}`,
      detail: errText || undefined,
    });
  }

  rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return rows;
}

function CautionIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ReviewRowItem({ row }: { row: ReviewRow }) {
  return (
    <li className="rounded-md border border-surface-border bg-surface px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <CautionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-warning" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent-warning/30 bg-accent-warning-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-warning">
              {KIND_LABEL[row.kind]}
            </span>
            <span className="font-medium text-ink">{row.label}</span>
          </div>
          {row.detail && <p className="text-ink-muted">{row.detail}</p>}
        </div>
      </div>
    </li>
  );
}

export default function RedFlags({ findings, events }: Props) {
  const rows = buildReviewRows(findings, events);

  return (
    <section className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <CautionIcon className="h-3.5 w-3.5 text-accent-warning" />
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Findings to review
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-subtle">
          Nothing flagged for additional review on this run.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, idx) => (
            <ReviewRowItem key={`${row.kind}-${idx}`} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}
