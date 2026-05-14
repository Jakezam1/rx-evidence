"use client";

type TabKey = "findings" | "pico" | "risk" | "summary";

export default function TabNav({
  activeTab,
  onSelect,
}: {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
}) {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "findings", label: "Findings" },
    { key: "pico", label: "PICO" },
    { key: "risk", label: "RoB 2.0" },
    { key: "summary", label: "Summary" },
  ];

  return (
    <div className="flex shrink-0 items-center border-b border-surface-border bg-surface-raised px-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={`relative px-4 py-3 text-sm transition ${
              isActive ? "font-semibold text-brand" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            <span
              className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full transition ${
                isActive ? "bg-brand" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
