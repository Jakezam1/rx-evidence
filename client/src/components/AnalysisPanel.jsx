import FindingCard from "./FindingCard";

export default function AnalysisPanel({
  findings,
  loadingSections,
  onSourceClick,
  cardStates,
  onCardAction,
  focusedCardId,
  setFocusedCardId
}) {
  return (
    <aside className="h-full overflow-y-auto border-l border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-3 text-lg font-semibold">Findings</h3>
      {loadingSections.length > 0 && (
        <div className="mb-3 text-xs text-gray-600">Analyzing sections: {loadingSections.join(", ")}</div>
      )}
      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          finding={finding}
          onSourceClick={onSourceClick}
          state={cardStates[finding.id]}
          onAction={onCardAction}
          isFocused={focusedCardId === finding.id}
          onFocus={() => setFocusedCardId(finding.id)}
        />
      ))}
    </aside>
  );
}
