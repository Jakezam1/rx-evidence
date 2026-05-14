"use client";

import { ClinicalSummary, Finding, ObservabilityEvent } from "../lib/types";
import ConfidenceCoverage from "./ConfidenceCoverage";
import RedFlags from "./RedFlags";
import SectionCard, { BulletList, EmptyTab } from "./SectionCard";

type Props = {
  summary: ClinicalSummary | null;
  findings: Finding[];
  events: ObservabilityEvent[];
};

export default function SummaryTab({ summary, findings, events }: Props) {
  const hasAnyData =
    summary !== null ||
    findings.length > 0 ||
    events.length > 0;

  if (!hasAnyData) {
    return <EmptyTab title="No summary yet." hint="Run analysis on a paper to populate this tab." />;
  }

  return (
    <div className="h-full space-y-3 overflow-auto bg-surface p-4">
      <ConfidenceCoverage findings={findings} />

      <RedFlags findings={findings} events={events} />

      {summary && (
        <>
          <SectionCard label="Efficacy">
            <BulletList items={(summary.efficacy ?? []).filter((s) => s && s.trim())} />
          </SectionCard>
          <SectionCard label="Safety">
            <BulletList items={(summary.safety ?? []).filter((s) => s && s.trim())} />
          </SectionCard>
          <SectionCard label="Applicability">
            <BulletList items={(summary.applicability ?? []).filter((s) => s && s.trim())} />
          </SectionCard>
          <SectionCard label="Practice impact">
            <BulletList items={(summary.practiceImpact ?? []).filter((s) => s && s.trim())} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
