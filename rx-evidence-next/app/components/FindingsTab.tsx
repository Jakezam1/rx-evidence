"use client";

import { useState } from "react";

import { Finding } from "../lib/types";
import FindingCard from "./FindingCard";

type Props = {
  findings: Finding[];
  onReview: (findingId: string, reviewStatus: "approved" | "flagged" | "unreviewed", note?: string) => Promise<void>;
};

export default function FindingsTab({ findings, onReview }: Props) {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const commit = async (id: string, status: "approved" | "flagged" | "unreviewed") => {
    setBusyId(id);
    try {
      await onReview(id, status, noteDrafts[id]);
    } finally {
      setBusyId(null);
    }
  };

  if (!findings.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-ink-muted">No findings yet.</p>
        <p className="mt-1 text-xs text-ink-subtle">Upload a PDF and run analysis to see findings here.</p>
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-auto bg-surface p-4">
      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          finding={finding}
          busy={busyId === finding.id}
          noteDraft={noteDrafts[finding.id] ?? finding.reviewNote ?? ""}
          onNoteChange={(next) => setNoteDrafts((prev) => ({ ...prev, [finding.id]: next }))}
          onReview={(status) => void commit(finding.id, status)}
        />
      ))}
    </div>
  );
}
