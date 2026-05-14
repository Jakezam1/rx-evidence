"use client";

import { ReactNode } from "react";

type LandingScreenProps = {
  onTryDemo: () => void;
  onAnalyzePaper: () => void;
};

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-border/40 text-brand">
      {children}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    </svg>
  );
}

export default function LandingScreen({ onTryDemo, onAnalyzePaper }: LandingScreenProps) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="flex h-14 items-center px-8">
        <span className="text-sm font-semibold tracking-tight text-brand">RxEvidence</span>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-24 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-brand md:text-6xl">
          Evidence that explains itself
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-muted md:text-lg">
          RxEvidence analyzes randomized controlled trials and drug comparison studies, then
          visually links every conclusion back to the exact passage in the paper that supports
          it. Built for clinical pharmacists evaluating new therapies against the standard of
          care.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={onTryDemo}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg shadow-sm transition hover:opacity-90"
          >
            Try the demo
          </button>
          <button
            type="button"
            onClick={onAnalyzePaper}
            className="rounded-md border border-surface-border bg-surface-raised px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-border/30"
          >
            Analyze a paper
          </button>
        </div>

        <div className="mt-20 grid w-full grid-cols-1 gap-10 text-left sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <FeatureIcon>
              <SearchIcon />
            </FeatureIcon>
            <h3 className="text-sm font-semibold text-ink">Visual source tracing</h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              Highlights color-coded by finding type. Click any claim to see the exact text.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <FeatureIcon>
              <CheckIcon />
            </FeatureIcon>
            <h3 className="text-sm font-semibold text-ink">Human-in-the-loop review</h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              Approve, flag, and annotate findings. You remain the final authority.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <FeatureIcon>
              <StackIcon />
            </FeatureIcon>
            <h3 className="text-sm font-semibold text-ink">Structured analysis</h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              PICO extraction, Cochrane RoB 2.0 bias assessment, and synthesized clinical summary.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
