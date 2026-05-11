export default function DemoBanner({ visible, onDismiss }) {
  if (!visible) return null;
  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">
      <span>Viewing demo analysis — PARADIGM-HF trial</span>
      <button onClick={onDismiss} className="text-sky-700 underline">Dismiss</button>
    </div>
  );
}
