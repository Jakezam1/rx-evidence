"use client";

import { Finding } from "../lib/types";

type Props = {
  findings: Finding[];
};

function countConfidence(findings: Finding[]) {
  const counts = { high: 0, moderate: 0, low: 0 };
  for (const f of findings) {
    const level = f.confidenceLevel as keyof typeof counts;
    if (level in counts) counts[level] += 1;
  }
  return counts;
}

function evidenceLinkedCount(findings: Finding[]): number {
  return findings.filter((f) => Array.isArray(f.sourcePassages) && f.sourcePassages.length > 0).length;
}

export default function ConfidenceCoverage({ findings }: Props) {
  const total = findings.length;
  const counts = countConfidence(findings);
  const evidenceLinked = evidenceLinkedCount(findings);

  if (total === 0) return null;

  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const evidencePct = pct(evidenceLinked);

  return (
    <section className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        Analysis confidence
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <div className="text-2xl font-semibold text-ink">{total}</div>
          <div className="text-xs text-ink-muted">findings extracted</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-ink">
            {evidenceLinked}
            <span className="text-sm font-medium text-ink-subtle"> / {total}</span>
          </div>
          <div className="text-xs text-ink-muted">cite source passages ({evidencePct}%)</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-ink">{counts.high}</div>
          <div className="text-xs text-ink-muted">high-confidence findings</div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-muted">
          <span>Confidence distribution</span>
          <span className="font-mono text-ink-subtle">
            {counts.high} · {counts.moderate} · {counts.low}
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
          {counts.high > 0 && (
            <div
              className="bg-accent-success"
              style={{ width: `${pct(counts.high)}%` }}
              title={`${counts.high} high (${pct(counts.high)}%)`}
            />
          )}
          {counts.moderate > 0 && (
            <div
              className="bg-accent-warning"
              style={{ width: `${pct(counts.moderate)}%` }}
              title={`${counts.moderate} moderate (${pct(counts.moderate)}%)`}
            />
          )}
          {counts.low > 0 && (
            <div
              className="bg-accent-danger"
              style={{ width: `${pct(counts.low)}%` }}
              title={`${counts.low} low (${pct(counts.low)}%)`}
            />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-success" />
            High
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-warning" />
            Moderate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-danger" />
            Low
          </span>
        </div>
      </div>
    </section>
  );
}
