"use client";

import { ReactNode, useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { getConfig } from "../lib/api";

type WorkspaceShellProps = {
  demoMode: boolean;
  demoLabel?: string;
  onGoHome: () => void;
  pdfPane: ReactNode;
  tabsPane: ReactNode;
};

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-surface-border/40 focus:outline-none focus:ring-2 focus:ring-brand/30"
      aria-label="Return to home"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-fg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight text-brand">RxEvidence</span>
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function prettyModelLabel(provider: string, model: string): string {
  if (!provider && !model) return "Loading model…";
  const providerLabel = (() => {
    switch (provider) {
      case "gemini":
        return "Gemini";
      case "anthropic":
        return "Claude";
      case "openai":
        return "OpenAI";
      default:
        return provider;
    }
  })();
  return `${providerLabel} · ${model}`;
}

export default function WorkspaceShell({
  demoMode,
  demoLabel,
  onGoHome,
  pdfPane,
  tabsPane,
}: WorkspaceShellProps) {
  const [model, setModel] = useState<{ provider: string; model: string }>({ provider: "", model: "" });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    getConfig()
      .then(setModel)
      .catch(() => setModel({ provider: "unknown", model: "offline" }));
  }, []);

  const showBanner = demoMode && !bannerDismissed;

  return (
    <div className="flex h-screen flex-col bg-surface text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-4">
        <div className="flex items-center gap-4">
          <Logo onClick={onGoHome} />
          <div className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
            {prettyModelLabel(model.provider, model.model)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demoMode && (
            <span className="rounded-full bg-accent-warning-soft px-3 py-1 text-xs font-medium text-accent-warning">
              Demo mode
            </span>
          )}
        </div>
      </header>

      {showBanner && (
        <div className="flex shrink-0 items-center justify-between border-b border-accent-warning-soft bg-accent-warning-soft/60 px-4 py-2 text-sm">
          <div className="flex items-center gap-2 text-accent-warning">
            <WarningIcon />
            <span className="font-medium">
              Viewing demo analysis{demoLabel ? ` — ${demoLabel}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-accent-warning transition hover:bg-accent-warning/10"
            aria-label="Dismiss banner"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={60} minSize={25}>
          <div className="h-full overflow-auto bg-surface">{pdfPane}</div>
        </Panel>
        <PanelResizeHandle className="group relative w-1.5 cursor-col-resize bg-surface-border transition hover:bg-brand/40 data-[resize-handle-state=drag]:bg-brand">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-surface-border group-hover:bg-transparent" />
        </PanelResizeHandle>
        <Panel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col bg-surface-raised">{tabsPane}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
