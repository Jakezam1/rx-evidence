import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AnalysisPanel from "../components/AnalysisPanel";
import BiasAssessment from "../components/BiasAssessment";
import DemoBanner from "../components/DemoBanner";
import ObservabilityLog from "../components/ObservabilityLog";
import PDFViewer from "../components/PDFViewer";
import PICOExtractor from "../components/PICOExtractor";
import SettingsModal from "../components/SettingsModal";
import SummaryExport from "../components/SummaryExport";
import { useApiKey } from "../hooks/useApiKey";
import { useHighlightSync } from "../hooks/useHighlightSync";
import { usePDFAnalysis } from "../hooks/usePDFAnalysis";
import { demoData } from "../utils/demoData";

export default function AppPage() {
  const models = [
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-latest" },
    { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
    { label: "Claude 3 Haiku", value: "claude-3-haiku-20240307" }
  ];

  const [params] = useSearchParams();
  const { apiKey, hasApiKey, saveApiKey, removeApiKey } = useApiKey();
  const { findings, setFindings, loadingSections, logs, error, analyzePdf } = usePDFAnalysis();
  const [pdfFile, setPdfFile] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showObservability, setShowObservability] = useState(false);
  const [showDemoBanner, setShowDemoBanner] = useState(params.get("demo") === "1");
  const [activeTab, setActiveTab] = useState("findings");
  const [cardStates, setCardStates] = useState({});
  const [focusedCardId, setFocusedCardId] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [highlightMode, setHighlightMode] = useState(true);
  const [pico, setPico] = useState(demoData.pico);
  const [bias, setBias] = useState(demoData.bias);
  const [summary, setSummary] = useState(demoData.summary);
  const [selectedModel, setSelectedModel] = useState("claude-3-5-sonnet-latest");
  const [analysisRemaining, setAnalysisRemaining] = useState(() => {
    const stored = localStorage.getItem("rxevidence_free_analyses_remaining");
    return stored ? Number(stored) : 3;
  });
  const [rightPaneWidth, setRightPaneWidth] = useState(560);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem("rxevidence_visited", "true");
    if (params.get("openSettings") === "1" && !localStorage.getItem("rxevidence_api_key")) {
      setShowSettings(true);
    }
    if (params.get("demo") === "1") {
      setFindings(demoData.findings);
      setSelectedFindingId(demoData.findings[0]?.id || "");
      setPdfFile("/demo/NEJMoa1409077.pdf");
    }
  }, [params, setFindings]);

  useEffect(() => {
    localStorage.setItem("rxevidence_free_analyses_remaining", String(analysisRemaining));
  }, [analysisRemaining]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const onMouseMove = (e) => {
      const minWidth = 420;
      const maxWidth = Math.min(900, window.innerWidth - 380);
      const desired = window.innerWidth - e.clientX;
      const clamped = Math.min(maxWidth, Math.max(minWidth, desired));
      setRightPaneWidth(clamped);
    };
    const onMouseUp = () => setIsResizing(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handler = (e) => {
      if (!focusedCardId) return;
      if (e.key.toLowerCase() === "a") handleCardAction(focusedCardId, "approve");
      if (e.key.toLowerCase() === "f") handleCardAction(focusedCardId, "flag");
      if (e.key.toLowerCase() === "n") handleCardAction(focusedCardId, "note");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const ids = findings.map((f) => f.id);
        const idx = ids.indexOf(focusedCardId);
        if (idx >= 0) {
          const next = e.key === "ArrowDown" ? ids[idx + 1] : ids[idx - 1];
          if (next) {
            setFocusedCardId(next);
            document.getElementById(`card-${next}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedCardId, findings]);

  const { findingToHighlights } = useHighlightSync(findings, pdfFile);
  const allHighlights = useMemo(() => Object.values(findingToHighlights).flat(), [findingToHighlights]);
  const totalSourcePassages = useMemo(
    () => findings.reduce((acc, f) => acc + (f.sourcePassages?.length || 0), 0),
    [findings]
  );
  const matchedFindingPassages = useMemo(
    () =>
      findings.reduce((acc, f) => {
        const matched = (findingToHighlights[f.id] || []).length > 0 ? 1 : 0;
        return acc + matched;
      }, 0),
    [findings, findingToHighlights]
  );

  const handleUpload = async (file) => {
    setPdfFile(file);
    if (!hasApiKey) return;
    if (analysisRemaining > 0) {
      setAnalysisRemaining((v) => Math.max(0, v - 1));
    }
    await analyzePdf({ file, apiKey, model: selectedModel });
  };

  const handleCardAction = (findingId, action, value) => {
    setCardStates((prev) => {
      const current = prev[findingId] || {};
      if (action === "approve") return { ...prev, [findingId]: { ...current, status: "approved", initials: "CP" } };
      if (action === "flag") return { ...prev, [findingId]: { ...current, status: "flagged" } };
      if (action === "note") return { ...prev, [findingId]: { ...current, showNote: true } };
      if (action === "saveNote") return { ...prev, [findingId]: { ...current, note: value, showNote: true } };
      return prev;
    });
  };

  const openFinding = (findingId) => {
    setSelectedFindingId(findingId);
    setFocusedCardId(findingId);
    document.getElementById(`card-${findingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="h-screen overflow-hidden bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs">Rx</span>
            <span>RxEvidence</span>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {models.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {analysisRemaining} free analyses remaining
          </span>
          <button onClick={() => setShowObservability(true)} className="rounded border px-3 py-1 text-sm">
            Observability
          </button>
          <button onClick={() => setShowSettings(true)} className="rounded border px-3 py-1 text-sm">
            ⚙
          </button>
        </div>
      </header>

      <main className="flex h-[calc(100%-57px)]">
        <section className="flex h-full flex-1 flex-col">
          <div className="border-b border-gray-200 p-3">
            <DemoBanner visible={showDemoBanner} onDismiss={() => setShowDemoBanner(false)} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="rounded border px-3 py-1.5 text-sm">
                Upload PDF
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              </label>
              <button
                onClick={() => {
                  setFindings(demoData.findings);
                  setPico(demoData.pico);
                  setBias(demoData.bias);
                  setSummary(demoData.summary);
                  setPdfFile("/demo/NEJMoa1409077.pdf");
                  setShowDemoBanner(true);
                }}
                className="rounded border px-3 py-1.5 text-sm"
              >
                Load Demo
              </button>
              <button onClick={() => setHighlightMode((v) => !v)} className="rounded border px-3 py-1.5 text-sm">
                Highlight mode: {highlightMode ? "ON" : "OFF"}
              </button>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                Debug: matched findings {matchedFindingPassages}/{findings.length || 0}
              </span>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                Source passages {totalSourcePassages} · highlight rects {allHighlights.length}
              </span>
              {!hasApiKey && (
                <p className="text-sm text-amber-700">
                  Add your Anthropic API key in Settings to analyze your own papers{" "}
                  <button onClick={() => setShowSettings(true)} className="underline">Open Settings</button>
                </p>
              )}
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
          </div>
          <div className="flex h-full">
            <div className="h-full flex-1">
              <PDFViewer
                file={pdfFile}
                highlights={allHighlights}
                selectedFindingId={selectedFindingId}
                highlightMode={highlightMode}
                onHighlightClick={(h) => openFinding(h.findingId)}
              />
            </div>
            <div
              className="w-2 cursor-col-resize border-l border-r border-gray-200 bg-gray-50 hover:bg-gray-100"
              onMouseDown={() => setIsResizing(true)}
            />
            <div className="h-full border-l border-gray-200 bg-white" style={{ width: rightPaneWidth }}>
              <div className="border-b border-gray-200 px-3 py-2">
                <div className="flex gap-2">
                  {["findings", "pico", "bias", "summary"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`rounded px-2.5 py-1 text-xs ${
                        activeTab === tab ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"
                      }`}
                    >
                      {tab === "pico" ? "PICO" : tab === "bias" ? "RoB 2.0" : tab[0].toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[calc(100%-45px)]">
                {activeTab === "findings" && (
                  <AnalysisPanel
                    findings={findings}
                    loadingSections={loadingSections}
                    onSourceClick={(findingId) => openFinding(findingId)}
                    cardStates={cardStates}
                    onCardAction={handleCardAction}
                    focusedCardId={focusedCardId}
                    setFocusedCardId={setFocusedCardId}
                  />
                )}
                {activeTab === "pico" && <PICOExtractor pico={pico} setPico={setPico} />}
                {activeTab === "bias" && <BiasAssessment bias={bias} setBias={setBias} />}
                {activeTab === "summary" && <SummaryExport summary={summary} />}
              </div>
            </div>
          </div>
        </section>
      </main>

      <ObservabilityLog open={showObservability} onClose={() => setShowObservability(false)} logs={logs} findings={findings} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} apiKey={apiKey} saveApiKey={saveApiKey} removeApiKey={removeApiKey} />
    </div>
  );
}
