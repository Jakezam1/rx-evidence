"use client";

import { useEffect, useMemo, useState } from "react";

import { paperPdfUrl } from "../lib/api";

type Props = {
  file: File | null;
  paperId?: string | null;
  fileName?: string | null;
};

export default function PdfPane({ file, paperId, fileName }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const remoteUrl = useMemo(() => (paperId ? paperPdfUrl(paperId) : null), [paperId]);
  const pdfUrl = blobUrl ?? remoteUrl;
  const displayName = file?.name ?? fileName ?? null;

  if (!pdfUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-surface px-6 text-center">
        <div className="rounded-full bg-brand-subtle p-3 text-brand-muted">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6M9 11h6M9 15h3" />
          </svg>
        </div>
        <p className="mt-3 text-sm font-medium text-ink">No PDF loaded</p>
        <p className="mt-1 text-xs text-ink-subtle">
          Upload a trial PDF to start analysis, or click <span className="font-medium text-ink-muted">Try the demo</span> to load a pre-analyzed paper.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">PDF</span>
          <span className="truncate text-xs font-medium text-ink" title={displayName ?? undefined}>
            {displayName ?? "Trial PDF"}
          </span>
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded border border-surface-border bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted transition hover:bg-surface-border/40"
        >
          Open in new tab
        </a>
      </div>
      <iframe
        title={displayName ?? "Trial PDF"}
        src={pdfUrl}
        className="h-full w-full flex-1 bg-white"
      />
    </div>
  );
}
