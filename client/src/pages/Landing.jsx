import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();
  const features = [
    {
      icon: "🔎",
      title: "Visual source tracing",
      description: "Highlights color-coded by finding type. Click any claim to see the exact supporting passage."
    },
    {
      icon: "✓",
      title: "Human-in-the-loop review",
      description: "Approve, flag, and annotate findings. You remain the final clinical decision-maker."
    },
    {
      icon: "🗂",
      title: "Structured analysis",
      description: "PICO extraction, Cochrane RoB 2.0 bias assessment, and a practice-ready summary."
    }
  ];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-100 px-6 py-3">
        <div className="text-sm font-semibold text-slate-800">RxEvidence</div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900">Evidence that explains itself</h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-slate-600">
            RxEvidence analyzes randomized controlled trials and drug comparison studies, then visually links every
            conclusion back to the exact passage in the paper that supports it. Built for clinical pharmacists
            evaluating new therapies against the standard of care.
          </p>

          <div className="mt-10 flex justify-center gap-3">
            <button
              onClick={() => navigate("/app?demo=1")}
              className="rounded-md bg-slate-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Try the demo
            </button>
            <button
              onClick={() => navigate("/app?openSettings=1")}
              className="rounded-md border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Analyze a paper
            </button>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title}>
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">Note:</span> RxEvidence uses the Anthropic Claude API to
          analyze papers. A pre-loaded demo is available without any setup. To analyze your own papers, add your
          Anthropic API key in Settings.
        </div>

        <footer className="mt-12 text-center text-sm text-slate-500">
          Built by Jake Zamrzycki · Clinical pharmacist & AI PM
        </footer>
      </section>
    </main>
  );
}
