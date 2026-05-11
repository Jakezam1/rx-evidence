export default function ObservabilityLog({ open, onClose, logs, findings }) {
  if (!open) return null;
  const high = findings.filter((f) => f.confidenceLevel === "high").length;
  const moderate = findings.filter((f) => f.confidenceLevel === "moderate").length;
  const low = findings.filter((f) => f.confidenceLevel === "low").length;

  return (
    <aside className="fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Observability</h3>
        <button onClick={onClose} className="text-sm text-gray-500">Close</button>
      </div>
      <div className="mb-4 rounded bg-gray-50 p-3 text-sm">
        Confidence distribution: high {high}, moderate {moderate}, low {low}
      </div>
      <details className="mb-3 rounded border border-gray-200 p-2">
        <summary className="cursor-pointer text-sm font-medium">Raw findings JSON</summary>
        <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(findings, null, 2)}</pre>
      </details>
      <div className="space-y-2">
        {logs.map((log, idx) => (
          <div key={idx} className="rounded border border-gray-200 p-2 text-xs">
            {log.type === "api" ? (
              <>
                <div className="font-medium">Section {log.section}</div>
                <div>Token count: {log.tokenCount}</div>
                <div>
                  {log.startedAt} to {log.completedAt}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium text-rose-700">Error in {log.section}</div>
                <div>{log.message}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
