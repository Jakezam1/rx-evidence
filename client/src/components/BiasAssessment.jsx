const domains = [
  ["randomization", "Randomization process"],
  ["deviations", "Deviations from intended interventions"],
  ["missingData", "Missing outcome data"],
  ["measurement", "Measurement of the outcome"],
  ["selection", "Selection of the reported result"]
];

export default function BiasAssessment({ bias, setBias }) {
  return (
    <div className="space-y-3 p-4">
      {domains.map(([key, label]) => (
        <details key={key} className="rounded border border-gray-200 bg-white p-3">
          <summary className="cursor-pointer font-medium">{label}</summary>
          <div className="mt-3 space-y-2">
            <label className="text-sm">
              AI assessment
              <select
                className="mt-1 block w-full rounded border border-gray-300 p-2"
                value={bias[key]?.override || bias[key]?.ai || "Some concerns"}
                onChange={(e) =>
                  setBias((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], override: e.target.value }
                  }))
                }
              >
                <option>Low</option>
                <option>Some concerns</option>
                <option>High risk</option>
              </select>
            </label>
            <p className="rounded bg-gray-50 p-2 text-sm">{bias[key]?.support || ""}</p>
            <textarea
              className="w-full rounded border border-gray-300 p-2 text-sm"
              placeholder="Rationale..."
              value={bias[key]?.rationale || ""}
              onChange={(e) =>
                setBias((prev) => ({
                  ...prev,
                  [key]: { ...prev[key], rationale: e.target.value }
                }))
              }
            />
          </div>
        </details>
      ))}
      <div className="rounded bg-gray-100 p-3 text-sm">Overall bias: {bias.overall || "Some concerns"}</div>
    </div>
  );
}
