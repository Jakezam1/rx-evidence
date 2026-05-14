"use client";

import { useEffect, useRef, useState } from "react";

import FindingsTab from "./components/FindingsTab";
import LandingScreen from "./components/LandingScreen";
import PdfPane from "./components/PdfPane";
import PicoTab from "./components/PicoTab";
import RiskLimitationsTab from "./components/RiskLimitationsTab";
import SummaryTab from "./components/SummaryTab";
import TabNav from "./components/TabNav";
import WorkspaceShell from "./components/WorkspaceShell";
import {
  analyzePaper,
  getDemoPaper,
  getFindings,
  getObservability,
  getPico,
  getRiskLimitations,
  getSummary,
  retryMissingPaperSections,
  updateFindingReview,
  uploadPaper,
} from "./lib/api";
import { AnalysisProgress, computeProgress } from "./lib/progress";
import { ClinicalSummary, Finding, ObservabilityEvent, Pico, RiskLimitations } from "./lib/types";

const POLL_INTERVAL_MS = 1500;

/** Human-readable trial name for the bundled demo (API file name may still be NEJM id). */
function labelForDemoTrial(fileName: string): string {
  const stem = fileName.replace(/\.pdf$/i, "").trim();
  const compact = stem.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    stem === "NEJMoa1409077" ||
    compact === "nejmoa1409077" ||
    compact.includes("paradigmhf") ||
    compact === "paradigmhf"
  ) {
    return "Paradigm HF trial";
  }
  return `${stem} trial`;
}

type TabKey = "findings" | "pico" | "risk" | "summary";
type ViewKey = "landing" | "workspace";
type Palette = "a" | "b";

/** If LLM calls failed on credentials, explain that instead of blaming "filters". */
function getLlmCredentialFailureMessage(events: ObservabilityEvent[]): string | null {
  let hasNotConfigured = false;
  let hasExpiredOrInvalid = false;
  for (const ev of events) {
    if (ev.stage !== "llm" || ev.level !== "warn") continue;
    const err = typeof ev.metadata?.error === "string" ? ev.metadata.error : "";
    if (!err) continue;
    const lower = err.toLowerCase();
    if (lower.includes("not configured")) hasNotConfigured = true;
    if (
      lower.includes("api key expired") ||
      lower.includes("api_key_invalid") ||
      (lower.includes("invalid_argument") && lower.includes("api key"))
    ) {
      hasExpiredOrInvalid = true;
    }
  }
  if (hasNotConfigured) {
    return "No API key for the active LLM provider. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) to rx-evidence/api/.env, restart uvicorn, then try again.";
  }
  if (hasExpiredOrInvalid) {
    return "The model provider rejected your API key (expired or invalid). Create a new key in Google AI Studio, update rx-evidence/api/.env, restart the backend, then analyze again.";
  }
  return null;
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("landing");
  const [palette] = useState<Palette>("b");
  const [demoMode, setDemoMode] = useState(false);
  const [demoLabel, setDemoLabel] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabKey>("findings");
  const [file, setFile] = useState<File | null>(null);
  const [paperId, setPaperId] = useState<string>("");
  const [paperFileName, setPaperFileName] = useState<string>("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pico, setPico] = useState<Pico | null>(null);
  const [risk, setRisk] = useState<RiskLimitations | null>(null);
  const [summary, setSummary] = useState<ClinicalSummary | null>(null);
  const [events, setEvents] = useState<ObservabilityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [partialWarning, setPartialWarning] = useState<string>("");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisStartRef = useRef<Date | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    analysisStartRef.current = new Date();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const allEvents = await getObservability(id);
        const startTime = analysisStartRef.current;
        const recent = startTime
          ? allEvents.filter((ev) => ev.createdAt && new Date(ev.createdAt) >= startTime)
          : allEvents;
        const next = computeProgress(recent);
        if (next) setProgress(next);
      } catch {
        // Swallow polling errors — they should not surface to the user.
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const refreshPaperData = async (id: string) => {
    const [nextFindings, nextPico, nextRisk, nextSummary, nextEvents] = await Promise.allSettled([
      getFindings(id),
      getPico(id),
      getRiskLimitations(id),
      getSummary(id),
      getObservability(id),
    ]);
    const failedSections: string[] = [];

    if (nextFindings.status === "fulfilled") {
      setFindings(nextFindings.value);
    } else {
      failedSections.push("findings");
    }

    if (nextPico.status === "fulfilled") {
      setPico(nextPico.value);
    } else {
      failedSections.push("pico");
      setPico(null);
    }

    if (nextRisk.status === "fulfilled") {
      setRisk(nextRisk.value);
    } else {
      failedSections.push("risk & limitations");
      setRisk(null);
    }

    if (nextSummary.status === "fulfilled") {
      setSummary(nextSummary.value);
    } else {
      failedSections.push("summary");
      setSummary(null);
    }

    if (nextEvents.status === "fulfilled") {
      setEvents(nextEvents.value);
    } else {
      failedSections.push("observability");
      setEvents([]);
    }

    let warning = "";
    const eventsList = nextEvents.status === "fulfilled" ? nextEvents.value : [];
    const credentialMsg = eventsList.length ? getLlmCredentialFailureMessage(eventsList) : null;
    const findingsEmpty =
      nextFindings.status === "fulfilled" && nextFindings.value.length === 0;

    if (credentialMsg) {
      setError(credentialMsg);
      warning = findingsEmpty
        ? ""
        : "Older findings from a previous run may still be shown. Fix your API key and run Analyze again to refresh.";
    } else {
      setError("");
      if (failedSections.length) {
        warning = `Partial results loaded. Unavailable sections: ${failedSections.join(", ")}.`;
      } else if (findingsEmpty) {
        warning =
          "Analysis completed but no high-utility findings passed filters. This usually means model responses were sparse or low quality for this run.";
      }
    }

    if (nextEvents.status === "fulfilled") {
      const warnCount = nextEvents.value.filter((event) => event.level === "warn").length;
      if (warnCount > 0 && !credentialMsg) {
        warning = warning
          ? `${warning} Observability captured ${warnCount} warning events.`
          : `Observability captured ${warnCount} warning events; results may be partial.`;
      }
    }

    setPartialWarning(warning);
  };

  const loadDemo = async () => {
    setLoading(true);
    setError("");
    setPartialWarning("");
    setProgress(null);
    try {
      const demo = await getDemoPaper();
      setPaperId(demo.paperId);
      setPaperFileName(demo.fileName);
      setDemoLabel(labelForDemoTrial(demo.fileName));
      await refreshPaperData(demo.paperId);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} On a new server there are no papers yet—use “Analyze a paper” first, or set DEMO_PAPER_ID in the API environment to pin a paper UUID.`
          : "Failed to load demo paper",
      );
    } finally {
      setLoading(false);
    }
  };

  const onAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setPartialWarning("");
    setProgress(null);
    try {
      const upload = await uploadPaper(file);
      setPaperId(upload.paperId);
      setPaperFileName(upload.fileName ?? file.name);
      startPolling(upload.paperId);
      await analyzePaper(upload.paperId);
      stopPolling();
      await refreshPaperData(upload.paperId);
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Failed to analyze PDF");
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(null), 2500);
    }
  };

  const onReview = async (findingId: string, reviewStatus: "approved" | "flagged" | "unreviewed", reviewNote?: string) => {
    await updateFindingReview(findingId, reviewStatus, reviewNote);
    if (paperId) await refreshPaperData(paperId);
  };

  const goHome = () => {
    stopPolling();
    setView("landing");
    setDemoMode(false);
    setDemoLabel("");
    setActiveTab("findings");
    setFile(null);
    setPaperId("");
    setPaperFileName("");
    setFindings([]);
    setPico(null);
    setRisk(null);
    setSummary(null);
    setEvents([]);
    setLoading(false);
    setError("");
    setPartialWarning("");
    setProgress(null);
  };

  const onRetryMissing = async () => {
    if (!paperId) return;
    setLoading(true);
    setError("");
    setProgress(null);
    try {
      startPolling(paperId);
      await retryMissingPaperSections(paperId);
      stopPolling();
      await refreshPaperData(paperId);
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Failed to retry missing sections");
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(null), 2500);
    }
  };

  if (view === "landing") {
    return (
      <div data-palette={palette}>
        <LandingScreen
          onTryDemo={() => {
            setDemoMode(true);
            setView("workspace");
            void loadDemo();
          }}
          onAnalyzePaper={() => {
            setDemoMode(false);
            setDemoLabel("");
            setView("workspace");
          }}
        />
      </div>
    );
  }

  const pdfPane = <PdfPane file={file} paperId={paperId || null} fileName={paperFileName || null} />;

  const tabsPane = (
    <>
      <TabNav activeTab={activeTab} onSelect={setActiveTab} />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-border bg-surface-raised px-4 py-2 text-xs">
        <label className="cursor-pointer rounded-md border border-surface-border bg-surface px-3 py-1.5 font-medium text-ink-muted transition hover:bg-surface-border/40">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? `📄 ${file.name.slice(0, 24)}${file.name.length > 24 ? "…" : ""}` : "Choose PDF"}
        </label>
        <button
          type="button"
          onClick={() => void onAnalyze()}
          disabled={loading || !file}
          className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-fg shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        {paperId && (
          <button
            type="button"
            onClick={() => void onRetryMissing()}
            disabled={loading}
            className="rounded-md border border-surface-border px-3 py-1.5 font-medium text-ink-muted transition hover:bg-surface-border/40 disabled:opacity-50"
          >
            Retry missing
          </button>
        )}
        {error && <span className="text-accent-danger">{error}</span>}
        {partialWarning && <span className="text-accent-warning">{partialWarning}</span>}
      </div>
      {progress && (
        <div className="shrink-0 border-b border-surface-border bg-surface-raised px-4 py-2.5">
          <div className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {progress.hasWarning && !progress.isComplete && (
                  <svg
                    className="h-3 w-3 shrink-0 text-accent-warning"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                )}
                <span className={`font-medium ${progress.hasWarning && !progress.isComplete ? "text-accent-warning" : "text-ink"}`}>
                  {progress.stageLabel}
                </span>
              </div>
              {progress.substep && (
                <div className="mt-0.5 text-ink-muted">{progress.substep}</div>
              )}
            </div>
            <span className="shrink-0 text-[11px] font-medium text-ink-subtle">{progress.stepLabel}</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-border">
            <div
              className={`h-full transition-all duration-500 ${
                progress.isComplete
                  ? "bg-accent-success"
                  : progress.hasWarning
                    ? "bg-accent-warning"
                    : "bg-brand"
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {activeTab === "findings" && <FindingsTab findings={findings} onReview={onReview} />}
        {activeTab === "pico" && <PicoTab pico={pico} />}
        {activeTab === "risk" && <RiskLimitationsTab risk={risk} />}
        {activeTab === "summary" && <SummaryTab summary={summary} findings={findings} events={events} />}
      </div>
    </>
  );

  return (
    <div data-palette={palette}>
      <WorkspaceShell
        demoMode={demoMode}
        demoLabel={demoLabel}
        onGoHome={goHome}
        pdfPane={pdfPane}
        tabsPane={tabsPane}
      />
    </div>
  );
}
