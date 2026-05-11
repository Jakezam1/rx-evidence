export default function FindingCard({
  finding,
  onSourceClick,
  onAction,
  state,
  isFocused,
  onFocus
}) {
  return (
    <div
      id={`card-${finding.id}`}
      onClick={onFocus}
      className={`mb-3 rounded-lg border bg-white p-4 shadow-sm ${isFocused ? "ring-2 ring-indigo-300" : "border-gray-200"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{finding.category}</span>
        <span className="text-xs uppercase text-gray-500">{finding.confidenceLevel}</span>
      </div>
      <h4 className="font-semibold">{finding.title}</h4>
      <p className="mt-1 text-sm text-gray-700">{finding.summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {Object.entries(finding.statistics || {}).map(([k, v]) => (
          <div key={k} className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
            <span className="font-medium">{k}: </span>{v}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{finding.clinicalImplication}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(finding.sourcePassages || []).map((source, idx) => (
          <button
            key={`${finding.id}-${idx}`}
            onClick={(e) => {
              e.stopPropagation();
              onSourceClick(finding.id, idx);
            }}
            className="rounded-full border border-gray-300 px-2 py-1 text-xs"
          >
            {source.sectionName}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-xs">
        <button onClick={() => onAction(finding.id, "approve")} className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">✓ Approve</button>
        <button onClick={() => onAction(finding.id, "flag")} className="rounded bg-amber-100 px-2 py-1 text-amber-700">⚑ Flag</button>
        <button onClick={() => onAction(finding.id, "note")} className="rounded bg-gray-100 px-2 py-1">+ Note</button>
      </div>
      {state?.status === "approved" && <div className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">Approved by {state.initials || "CP"}</div>}
      {state?.status === "flagged" && <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">Flagged for review</div>}
      {state?.showNote && (
        <textarea
          value={state.note || ""}
          onChange={(e) => onAction(finding.id, "saveNote", e.target.value)}
          className="mt-2 w-full rounded border border-gray-300 p-2 text-sm"
          placeholder="Add annotation..."
        />
      )}
    </div>
  );
}
