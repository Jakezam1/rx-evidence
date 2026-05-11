import { useState } from "react";

export default function SettingsModal({ isOpen, onClose, apiKey, saveApiKey, removeApiKey }) {
  const [value, setValue] = useState(apiKey || "");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">Close</button>
        </div>
        <label className="mb-2 block text-sm font-medium">Anthropic API key</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <p className="mt-3 text-xs text-gray-500">
          Your key is stored in your browser only and never saved to any server. It is sent directly to the
          Anthropic API with each request.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => {
              saveApiKey(value);
              onClose();
            }}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
          >
            Save
          </button>
          <button
            onClick={() => {
              removeApiKey();
              setValue("");
            }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            Remove
          </button>
          {apiKey && <span className="text-sm text-emerald-600">✓ Key saved</span>}
        </div>
      </div>
    </div>
  );
}
