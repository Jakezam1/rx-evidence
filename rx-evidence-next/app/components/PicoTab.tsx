"use client";

import { Pico } from "../lib/types";
import SectionCard, { BulletList, EmptyTab, NotReported } from "./SectionCard";

function TextField({ value }: { value: string | null | undefined }) {
  if (!value || !value.trim()) return <NotReported />;
  return <p>{value}</p>;
}

export default function PicoTab({ pico }: { pico: Pico | null }) {
  if (!pico) {
    return <EmptyTab title="No PICO data yet." hint="Run analysis on a paper to populate this tab." />;
  }

  return (
    <div className="h-full space-y-3 overflow-auto bg-surface p-4">
      <SectionCard label="Population">
        <TextField value={pico.population} />
      </SectionCard>
      <SectionCard label="Intervention">
        <TextField value={pico.intervention} />
      </SectionCard>
      <SectionCard label="Comparator">
        <TextField value={pico.comparator} />
      </SectionCard>
      <SectionCard label="Outcomes">
        <BulletList items={(pico.outcomes ?? []).filter((o) => o && o.trim())} />
      </SectionCard>
    </div>
  );
}
