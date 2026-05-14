"use client";

import { useState } from "react";

import { Finding, StatSlotKey } from "../lib/types";

type ReviewStatus = "approved" | "flagged" | "unreviewed";

type Props = {
  finding: Finding;
  busy: boolean;
  noteDraft: string;
  onNoteChange: (next: string) => void;
  onReview: (status: ReviewStatus) => void;
};

const STATS_REQUIRED_CATEGORIES = new Set(["primary_outcome", "secondary_outcome", "safety"]);

const PRIMARY_STAT_SLOTS: { key: StatSlotKey; label: string }[] = [
  { key: "HR", label: "HR" },
  { key: "CI95", label: "CI 95%" },
  { key: "pValue", label: "p-value" },
  { key: "ARR", label: "ARR" },
  { key: "NNT", label: "NNT" },
  { key: "absoluteEvents", label: "Events" },
];

const SECONDARY_STAT_SLOTS: { key: StatSlotKey; label: string }[] = [
  { key: "RR", label: "RR" },
  { key: "OR", label: "OR" },
  { key: "NNH", label: "NNH" },
];

const CATEGORY_STYLE: Record<string, { label: string; chip: string }> = {
  primary_outcome: {
    label: "Primary outcome",
    chip: "bg-teal-100 text-teal-900 border border-teal-200",
  },
  secondary_outcome: {
    label: "Secondary outcome",
    chip: "bg-indigo-100 text-indigo-900 border border-indigo-200",
  },
  safety: {
    label: "Safety",
    chip: "bg-rose-100 text-rose-900 border border-rose-200",
  },
  bias: {
    label: "Bias",
    chip: "bg-amber-100 text-amber-900 border border-amber-200",
  },
  population: {
    label: "Population",
    chip: "bg-stone-200 text-stone-900 border border-stone-300",
  },
  methods: {
    label: "Methods",
    chip: "bg-stone-100 text-stone-900 border border-stone-200",
  },
  generalizability: {
    label: "Generalizability",
    chip: "bg-violet-100 text-violet-900 border border-violet-200",
  },
  context: {
    label: "Context",
    chip: "bg-neutral-100 text-neutral-900 border border-neutral-200",
  },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-accent-success-soft text-accent-success border border-accent-success/30",
  moderate: "bg-accent-warning-soft text-accent-warning border border-accent-warning/30",
  low: "bg-accent-danger-soft text-accent-danger border border-accent-danger/30",
};

function isReported(value: string | number | null | undefined): boolean {
  return !(value === null || value === undefined || value === "");
}

function formatStat(value: string | number | null | undefined): string {
  if (!isReported(value)) return "Not reported";
  return String(value);
}

function sectionLocationLabel(finding: Finding): string {
  const first = finding.sourcePassages[0];
  if (!first) return "Unknown section";
  const section = first.sectionName?.trim() || "Unknown section";
  const page = first.pageHint?.trim();
  return page ? `${section} · ${page}` : section;
}

export default function FindingCard({ finding, busy, noteDraft, onNoteChange, onReview }: Props) {
  const [showPassages, setShowPassages] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const categoryStyle = CATEGORY_STYLE[finding.category] ?? {
    label: finding.category,
    chip: "bg-stone-100 text-stone-900 border border-stone-200",
  };
  const confidenceStyle = CONFIDENCE_STYLE[finding.confidenceLevel] ?? CONFIDENCE_STYLE.moderate;

  const showStatGrid = STATS_REQUIRED_CATEGORIES.has(finding.category);
  const secondaryChips = SECONDARY_STAT_SLOTS.filter(({ key }) => isReported(finding.statistics[key]));
  const extraStatChips = !showStatGrid
    ? Object.entries(finding.statistics).filter(([, v]) => isReported(v as string | number | null | undefined))
    : [];

  const reviewBorderClass =
    finding.reviewStatus === "approved"
      ? "border-l-4 border-l-accent-success"
      : finding.reviewStatus === "flagged"
        ? "border-l-4 border-l-accent-danger"
        : "border-l-4 border-l-transparent";

  return (
    <article
      className={`rounded-lg border border-surface-border bg-surface-raised shadow-sm ${reviewBorderClass}`}
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryStyle.chip}`}>
              {categoryStyle.label}
            </span>
            {finding.isCompositeEndpoint && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                Composite endpoint
              </span>
            )}
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceStyle}`}>
            {finding.confidenceLevel} confidence
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-snug text-ink">{finding.title}</h3>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink">
            <svg className="h-3 w-3 text-ink-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a1 1 0 0 1-.7-.29l-4.6-4.6a7.5 7.5 0 1 1 10.6 0l-4.6 4.6A1 1 0 0 1 10 18Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                clipRule="evenodd"
              />
            </svg>
            {sectionLocationLabel(finding)}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">{finding.summary}</p>

        {showStatGrid && (
          <div className="grid grid-cols-3 gap-2 rounded-md bg-surface p-2.5">
            {PRIMARY_STAT_SLOTS.map(({ key, label }) => {
              const value = finding.statistics[key];
              const reported = isReported(value);
              return (
                <div
                  key={key}
                  className={`rounded border px-2 py-1.5 text-xs ${
                    reported
                      ? "border-surface-border bg-surface-raised"
                      : "border-dashed border-surface-border bg-transparent"
                  }`}
                >
                  <div className={`text-[10px] font-medium uppercase tracking-wide ${reported ? "text-ink-subtle" : "text-ink-subtle"}`}>
                    {label}
                  </div>
                  <div className={reported ? "font-medium text-ink" : "italic text-ink-subtle"}>
                    {formatStat(value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showStatGrid && secondaryChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {secondaryChips.map(({ key, label }) => (
              <span
                key={key}
                className="rounded-full border border-surface-border bg-surface-raised px-2.5 py-0.5 text-xs text-ink-muted"
              >
                <span className="font-medium text-ink">{label}:</span> {String(finding.statistics[key])}
              </span>
            ))}
          </div>
        )}

        {!showStatGrid && extraStatChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extraStatChips.map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-surface-border bg-surface-raised px-2.5 py-0.5 text-xs text-ink-muted"
              >
                <span className="font-medium text-ink">{key}:</span> {String(value)}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-md border border-ink/25 bg-surface-raised px-3 py-2 text-sm text-ink">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Clinical implication
          </div>
          {finding.clinicalImplication}
        </div>

        {finding.isCompositeEndpoint && finding.compositeComponents.length > 0 && (
          <p className="text-xs text-amber-900">
            <span className="font-semibold">Composite components: </span>
            {finding.compositeComponents.join(", ")}
          </p>
        )}

        <div className="space-y-2 text-xs">
          <button
            type="button"
            onClick={() => setShowPassages((prev) => !prev)}
            className="inline-flex items-center gap-1 font-medium text-brand-muted hover:text-brand"
          >
            <svg
              className={`h-3 w-3 transition-transform ${showPassages ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.3 14.7a1 1 0 0 1 0-1.4L10.6 10 7.3 6.7a1 1 0 1 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
            {showPassages ? "Hide source passages" : `Show source passages (${finding.sourcePassages.length})`}
          </button>
          {showPassages && (
            <div className="space-y-2 rounded-md bg-surface p-3">
              {finding.sourcePassages.map((source, idx) => (
                <div key={`${finding.id}-passage-${idx}`} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-subtle">
                    <span className="rounded bg-surface-raised px-1.5 py-0.5 font-medium text-ink-muted">
                      {source.sectionName || "Unknown section"}
                    </span>
                    {source.pageHint && <span>{source.pageHint}</span>}
                  </div>
                  <p className="text-xs italic leading-relaxed text-ink-muted">
                    &ldquo;{source.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <button
            type="button"
            onClick={() => setShowDetail((prev) => !prev)}
            className="inline-flex items-center gap-1 font-medium text-brand-muted hover:text-brand"
          >
            <svg
              className={`h-3 w-3 transition-transform ${showDetail ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.3 14.7a1 1 0 0 1 0-1.4L10.6 10 7.3 6.7a1 1 0 1 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
            {showDetail ? "Hide reviewer detail" : "More detail"}
          </button>
          {showDetail && (
            <div className="space-y-1.5 rounded-md bg-surface p-3 text-xs text-ink-muted">
              <p>
                <span className="font-semibold text-ink">Why it matters: </span>
                {finding.whyItMatters || "Not provided"}
              </p>
              <p>
                <span className="font-semibold text-ink">Practice change signal: </span>
                {finding.practiceChangeSignal}
                {"  ·  "}
                <span className="font-semibold text-ink">Clinical relevance: </span>
                {finding.clinicalRelevance}
              </p>
              <p>
                <span className="font-semibold text-ink">Confidence rationale: </span>
                {finding.confidenceRationale || "Not provided"}
              </p>
              <p className="text-ink-subtle">
                Evidence score: {finding.evidenceStrengthScore ?? "n/a"} · Review status: {finding.reviewStatus}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-b-lg border-t border-surface-border bg-surface px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview("approved")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              finding.reviewStatus === "approved"
                ? "bg-accent-success text-white shadow-sm"
                : "border border-accent-success text-accent-success hover:bg-accent-success-soft"
            }`}
          >
            ✓ Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview("flagged")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              finding.reviewStatus === "flagged"
                ? "bg-accent-danger text-white shadow-sm"
                : "border border-accent-danger text-accent-danger hover:bg-accent-danger-soft"
            }`}
          >
            ⚑ Flag
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview("unreviewed")}
            className="rounded-md border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-border/40 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        <textarea
          value={noteDraft}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={2}
          className="w-full resize-none rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="Reviewer note (saved with your review)"
        />
      </div>
    </article>
  );
}
