export default function PICOExtractor({ pico, setPico }) {
  const fields = [
    ["population", "Population"],
    ["intervention", "Intervention"],
    ["comparator", "Comparator"],
    ["outcomes", "Outcomes"],
    ["studyDesign", "Study design summary"]
  ];

  return (
    <div className="space-y-3 p-4">
      {fields.map(([key, label]) => (
        <label key={key} className="block">
          <span className="mb-1 block text-sm font-medium">{label}</span>
          <textarea
            value={pico[key] || ""}
            onChange={(e) => setPico((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full rounded border border-gray-300 p-2 text-sm"
            rows={3}
          />
        </label>
      ))}
    </div>
  );
}
