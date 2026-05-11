import { useState } from "react";
import { extractSectionsFromPdf } from "../utils/pdfTextExtractor";

export function usePDFAnalysis() {
  const [findings, setFindings] = useState([]);
  const [loadingSections, setLoadingSections] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  const analyzePdf = async ({ file, apiKey, model }) => {
    setError("");
    setFindings([]);
    const sections = await extractSectionsFromPdf(file);
    setLoadingSections(sections.map((s) => s.sectionName));

    await Promise.all(
      sections.map(async (section) => {
        const startedAt = new Date().toISOString();
        try {
          const form = new FormData();
          form.append("pdf", file);
          form.append("sectionName", section.sectionName);
          form.append("sectionText", section.text);
          form.append("model", model || "claude-sonnet-4-20250514");

          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "x-user-api-key": apiKey || "" },
            body: form
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Analysis failed");
          }

          setFindings((prev) => [...prev, ...(data.findings || [])]);
          setLogs((prev) => [
            ...prev,
            {
              type: "api",
              section: section.sectionName,
              startedAt,
              completedAt: new Date().toISOString(),
              tokenCount: data.tokenCount || "n/a"
            }
          ]);
        } catch (e) {
          setError(e.message);
          setLogs((prev) => [
            ...prev,
            { type: "error", section: section.sectionName, message: e.message, startedAt }
          ]);
        } finally {
          setLoadingSections((prev) => prev.filter((s) => s !== section.sectionName));
        }
      })
    );
  };

  return { findings, setFindings, loadingSections, logs, error, analyzePdf };
}
