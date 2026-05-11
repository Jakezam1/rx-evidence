export default function SummaryExport({ summary }) {
  const exportText = `Evidence grade: ${summary.grade}

Bottom line:
${summary.bottomLine}

Efficacy:
${summary.efficacy}

Safety:
${summary.safety}

Applicability:
${summary.applicability}`;

  return (
    <div className="space-y-3 p-4">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="text-sm text-gray-600">Evidence grade</div>
        <div className="text-2xl font-semibold">{summary.grade}</div>
      </div>
      <p><span className="font-medium">Bottom line:</span> {summary.bottomLine}</p>
      <p><span className="font-medium">Efficacy:</span> {summary.efficacy}</p>
      <p><span className="font-medium">Safety:</span> {summary.safety}</p>
      <p><span className="font-medium">Applicability:</span> {summary.applicability}</p>
      <button
        onClick={() => navigator.clipboard.writeText(exportText)}
        className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
      >
        Copy summary to clipboard
      </button>
    </div>
  );
}
