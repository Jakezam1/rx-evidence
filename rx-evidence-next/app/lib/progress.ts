import { ObservabilityEvent } from "./types";

export type AnalysisProgress = {
  stageLabel: string;
  substep: string | null;
  stepLabel: string;
  percent: number;
  hasWarning: boolean;
  isComplete: boolean;
  message: string;
};

type Stage = {
  key: string;
  label: string;
  percent: number;
};

/**
 * Pipeline stages emitted by the backend as observability events with
 * stage="pipeline_stage". The label here mirrors the `message` field on the
 * event. Percent is the bar fill when this stage is the active one (before
 * substep adjustment).
 */
const STAGES: Stage[] = [
  { key: "Reading paper", label: "Reading paper", percent: 10 },
  { key: "Analyzing findings", label: "Analyzing findings", percent: 60 },
  { key: "Extracting PICO", label: "Extracting PICO", percent: 78 },
  { key: "Assessing risk of bias", label: "Assessing risk of bias", percent: 86 },
  { key: "Building clinical summary", label: "Building clinical summary", percent: 93 },
  { key: "Cleaning up duplicates", label: "Cleaning up duplicates", percent: 97 },
];

const TOTAL_STAGES = STAGES.length;

const HIDDEN_MESSAGES = new Set<string>([
  "Skipping low-utility finding",
  "Skipping invalid finding payload",
  "Skipping non-object finding payload",
  "Skipped finding save batch due to duplicate IDs",
]);

function isMeaningfulEvent(ev: ObservabilityEvent): boolean {
  if (HIDDEN_MESSAGES.has(ev.message)) return false;
  if (ev.message.startsWith("Trimmed ")) return false;
  return true;
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

/** Extract `(done, total, detail)` from a "Section complete (3 of 5): Methods" event. */
function parseSectionComplete(message: string): { done: number; total: number; detail: string } | null {
  const m = message.match(/^Section complete \((\d+) of (\d+)\): (.+)$/);
  if (!m) return null;
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10), detail: m[3] };
}

function activeSubstep(events: ObservabilityEvent[], stageKey: string): string | null {
  if (stageKey === "Analyzing findings") {
    const sectionCompleteIdx = findLastIndex(events, (ev) =>
      ev.message.startsWith("Section complete ("),
    );
    if (sectionCompleteIdx >= 0) {
      const parsed = parseSectionComplete(events[sectionCompleteIdx].message);
      if (parsed) return `Completed ${parsed.done} of ${parsed.total} sections \u2014 ${parsed.detail}`;
    }
    const inProgressIdx = findLastIndex(events, (ev) => ev.message.startsWith("Analyzing section "));
    if (inProgressIdx >= 0) {
      const section = events[inProgressIdx].message.replace("Analyzing section ", "");
      return `Reading ${section} section\u2026`;
    }
    return null;
  }
  if (stageKey === "Cleaning up duplicates") {
    const dedupeIdx = findLastIndex(events, (ev) => ev.message.startsWith("Dedupe pass removed "));
    if (dedupeIdx >= 0) {
      return events[dedupeIdx].message.replace(
        "Dedupe pass removed ",
        "Removed ",
      ).concat(" near-duplicate findings");
    }
    return null;
  }
  if (stageKey === "Extracting PICO" || stageKey === "Assessing risk of bias") {
    return "Running model\u2026";
  }
  return null;
}

export function computeProgress(events: ObservabilityEvent[]): AnalysisProgress | null {
  const meaningful = events.filter(isMeaningfulEvent);
  if (meaningful.length === 0) return null;

  const isComplete = meaningful.some((ev) => ev.message === "Analysis completed");
  const hasWarning = meaningful.some((ev) => ev.level === "warn" || ev.level === "error");

  // Find the most recent pipeline_stage event to determine where we are.
  const lastStageIdx = findLastIndex(
    meaningful,
    (ev) => ev.stage === "pipeline_stage",
  );
  const activeStage =
    lastStageIdx >= 0
      ? STAGES.find((s) => s.key === meaningful[lastStageIdx].message) ?? null
      : null;

  if (isComplete) {
    return {
      stageLabel: "Analysis complete",
      substep: `${meaningful.length} pipeline events recorded`,
      stepLabel: `Stage ${TOTAL_STAGES} of ${TOTAL_STAGES}`,
      percent: 100,
      hasWarning,
      isComplete: true,
      message: "Analysis complete",
    };
  }

  if (!activeStage) {
    // No stage markers yet — fall back to a generic 'starting' state until the
    // first pipeline_stage event arrives.
    return {
      stageLabel: "Starting analysis",
      substep: "Initializing pipeline\u2026",
      stepLabel: `Stage 1 of ${TOTAL_STAGES}`,
      percent: 5,
      hasWarning,
      isComplete: false,
      message: "Starting analysis",
    };
  }

  const stageIndex = STAGES.indexOf(activeStage);
  const substep = activeSubstep(meaningful, activeStage.key);

  // For the section-analysis stage, refine the percent based on sections done
  // so the bar moves smoothly through the longest stage.
  let percent = activeStage.percent;
  if (activeStage.key === "Analyzing findings") {
    const lastSectionComplete = findLastIndex(meaningful, (ev) =>
      ev.message.startsWith("Section complete ("),
    );
    if (lastSectionComplete >= 0) {
      const parsed = parseSectionComplete(meaningful[lastSectionComplete].message);
      if (parsed && parsed.total > 0) {
        const previousStagePercent = stageIndex > 0 ? STAGES[stageIndex - 1].percent : 10;
        const span = activeStage.percent - previousStagePercent;
        const ratio = Math.min(parsed.done / parsed.total, 1);
        percent = previousStagePercent + Math.round(span * ratio);
      }
    } else {
      // Stage just started, no sections done yet — keep bar at previous stage's percent.
      const previousStagePercent = stageIndex > 0 ? STAGES[stageIndex - 1].percent : 10;
      percent = previousStagePercent + 2;
    }
  }

  return {
    stageLabel: activeStage.label,
    substep,
    stepLabel: `Stage ${stageIndex + 1} of ${TOTAL_STAGES}`,
    percent,
    hasWarning,
    isComplete: false,
    message: activeStage.label,
  };
}
