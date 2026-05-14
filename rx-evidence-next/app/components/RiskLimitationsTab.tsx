"use client";

import { RiskLimitations } from "../lib/types";
import SectionCard, { EmptyTab, NotReported } from "./SectionCard";

function TextField({ value }: { value: string | null | undefined }) {
  if (!value || !value.trim()) return <NotReported />;
  return <p>{value}</p>;
}

export default function RiskLimitationsTab({ risk }: { risk: RiskLimitations | null }) {
  if (!risk) {
    return <EmptyTab title="No risk assessment yet." hint="Run analysis on a paper to populate this tab." />;
  }

  return (
    <div className="h-full space-y-3 overflow-auto bg-surface p-4">
      <SectionCard label="Internal validity">
        <TextField value={risk.internalValidity} />
      </SectionCard>
      <SectionCard label="External validity">
        <TextField value={risk.externalValidity} />
      </SectionCard>
      <SectionCard label="Sponsorship & conflicts">
        <TextField value={risk.sponsorshipConflict} />
      </SectionCard>
      <SectionCard label="Composite endpoints">
        <TextField value={risk.compositeEndpointAssessment} />
      </SectionCard>
      <SectionCard label="Subgroup analysis">
        <TextField value={risk.subgroupAssessment} />
      </SectionCard>
    </div>
  );
}
